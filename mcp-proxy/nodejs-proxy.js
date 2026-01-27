/**
 * Node.js Express Proxy for Supabase MCP
 * 
 * Alternative to Cloudflare Worker for self-hosted deployments
 * Use this if you need more control or already have Node.js infrastructure
 */

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const SUPABASE_PAT = process.env.SUPABASE_PAT;

if (!SUPABASE_PROJECT_REF || !SUPABASE_PAT) {
    console.error('❌ Missing environment variables:');
    console.error('   SUPABASE_PROJECT_REF or SUPABASE_PAT not set');
    process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());

// Simple rate limiting (in-memory - use Redis for production)
const rateLimitMap = new Map();
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(ip) {
    const now = Date.now();
    const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + RATE_WINDOW };

    if (now > record.resetTime) {
        record.count = 0;
        record.resetTime = now + RATE_WINDOW;
    }

    record.count++;
    rateLimitMap.set(ip, record);

    return record.count <= RATE_LIMIT;
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        proxy: 'supabase-mcp-proxy',
        version: '1.0.0'
    });
});

// Main proxy endpoint
app.all('*', async (req, res) => {
    try {
        // Rate limiting
        const clientIp = req.ip || req.connection.remoteAddress;
        if (!checkRateLimit(clientIp)) {
            return res.status(429).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'Rate limit exceeded'
                },
                id: null
            });
        }

        // Build Supabase MCP URL
        const url = new URL(`https://mcp.supabase.com/mcp`);
        url.searchParams.set('project_ref', SUPABASE_PROJECT_REF);

        // Copy query parameters
        Object.entries(req.query).forEach(([key, value]) => {
            if (key !== 'project_ref') {
                url.searchParams.set(key, value);
            }
        });

        // Prepare headers
        const headers = {
            'Authorization': `Bearer ${SUPABASE_PAT}`,
            'Content-Type': req.headers['content-type'] || 'application/json',
            'Accept': req.headers['accept'] || 'application/json',
        };

        // Optional: Preserve X-Session-Id if present
        if (req.headers['x-session-id']) {
            headers['X-Session-Id'] = req.headers['x-session-id'];
        }

        console.log(`📤 Proxying ${req.method} to Supabase MCP`);

        // Forward request to Supabase
        const response = await fetch(url.toString(), {
            method: req.method,
            headers: headers,
            body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
        });

        // Check if response is SSE (Server-Sent Events)
        const contentType = response.headers.get('content-type');
        const isSSE = contentType?.includes('text/event-stream');

        if (isSSE) {
            // Stream SSE response
            res.writeHead(response.status, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            });

            response.body.pipe(res);
        } else {
            // Regular JSON response
            const data = await response.json();
            res.status(response.status).json(data);
        }

        console.log(`✅ Response: ${response.status} ${isSSE ? '(streaming)' : ''}`);

    } catch (error) {
        console.error('❌ Proxy error:', error);

        res.status(500).json({
            jsonrpc: '2.0',
            error: {
                code: -32603,
                message: `Proxy error: ${error.message}`
            },
            id: null
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log('🚀 Supabase MCP Proxy started');
    console.log(`📍 Listening on http://localhost:${PORT}`);
    console.log(`🔗 Supabase Project: ${SUPABASE_PROJECT_REF}`);
    console.log('');
    console.log('✅ Ready to proxy MCP requests to Supabase');
    console.log('');
    console.log('Test with:');
    console.log(`  curl -X POST http://localhost:${PORT} \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`);
});
