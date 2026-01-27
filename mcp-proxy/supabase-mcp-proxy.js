/**
 * Supabase MCP Proxy for IBM watsonx Orchestrate
 * 
 * This Cloudflare Worker acts as an authentication proxy:
 * 1. Accepts unauthenticated MCP requests from watsonx Orchestrate
 * 2. Injects Supabase PAT (Personal Access Token) header
 * 3. Auto-fixes common parameter issues (e.g., schemas: null → ["public"])
 * 4. Forwards to Supabase MCP server
 * 5. Preserves MCP protocol semantics (JSON-RPC, SSE, streaming)
 */

export default {
    async fetch(request, env, ctx) {
        // CORS headers for watsonx Orchestrate
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id, Mcp-Session-Id',
        };

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // Get configuration from environment variables
            const SUPABASE_PROJECT_REF = env.SUPABASE_PROJECT_REF;
            const SUPABASE_PAT = env.SUPABASE_PAT;

            if (!SUPABASE_PROJECT_REF || !SUPABASE_PAT) {
                return new Response(
                    JSON.stringify({
                        jsonrpc: '2.0',
                        error: { code: -32603, message: 'Proxy not configured' },
                        id: null
                    }),
                    { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
                );
            }

            // Build Supabase MCP URL
            const supabaseUrl = `https://mcp.supabase.com/mcp?project_ref=${SUPABASE_PROJECT_REF}`;

            // Parse URL to preserve query parameters from watsonx
            const url = new URL(request.url);
            const finalUrl = new URL(supabaseUrl);

            // Preserve any additional query params (e.g., for SSE)
            url.searchParams.forEach((value, key) => {
                if (key !== 'project_ref') {
                    finalUrl.searchParams.set(key, value);
                }
            });

            // Clone request headers and inject Supabase PAT
            const headers = new Headers(request.headers);
            headers.set('Authorization', `Bearer ${SUPABASE_PAT}`);

            // Remove headers that shouldn't be forwarded
            headers.delete('Host');
            headers.delete('CF-Connecting-IP');
            headers.delete('CF-RAY');

            // Process request body to fix common parameter issues
            let requestBody = null;
            if (request.method === 'POST') {
                try {
                    const bodyText = await request.text();
                    let bodyJson = JSON.parse(bodyText);

                    // Auto-fix: list_tables with schemas: null → schemas: ["public"]
                    if (bodyJson.method === 'tools/call' && bodyJson.params) {
                        const params = bodyJson.params;

                        // Fix list_tables tool
                        if (params.name === 'list_tables' && params.arguments) {
                            if (params.arguments.schemas === null || params.arguments.schemas === undefined) {
                                params.arguments.schemas = ['public'];
                                console.log('Auto-fixed: list_tables schemas null → ["public"]');
                            }
                        }

                        // Fix execute_sql tool - ensure project_id exists
                        if (params.name === 'execute_sql' && params.arguments) {
                            if (!params.arguments.project_id) {
                                params.arguments.project_id = SUPABASE_PROJECT_REF;
                                console.log('Auto-fixed: execute_sql added project_id');
                            }
                        }

                        // Fix any tool with schemas: null
                        if (params.arguments && params.arguments.schemas === null) {
                            params.arguments.schemas = ['public'];
                            console.log('Auto-fixed: schemas null → ["public"]');
                        }
                    }

                    requestBody = JSON.stringify(bodyJson);
                } catch (e) {
                    // If parsing fails, use original body
                    requestBody = await request.clone().text();
                }
            }

            // Forward request to Supabase MCP
            const supabaseRequest = new Request(finalUrl.toString(), {
                method: request.method,
                headers: headers,
                body: requestBody,
            });

            // Fetch from Supabase MCP
            const response = await fetch(supabaseRequest);

            // Clone response to add CORS headers
            const newHeaders = new Headers(response.headers);
            Object.entries(corsHeaders).forEach(([key, value]) => {
                newHeaders.set(key, value);
            });

            // Preserve critical MCP headers
            if (response.headers.get('Content-Type')?.includes('text/event-stream')) {
                newHeaders.set('Content-Type', 'text/event-stream');
                newHeaders.set('Cache-Control', 'no-cache');
                newHeaders.set('Connection', 'keep-alive');
            }

            // Return response with CORS headers
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders,
            });

        } catch (error) {
            console.error('Proxy error:', error);

            return new Response(
                JSON.stringify({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: `Proxy error: ${error.message}`
                    },
                    id: null
                }),
                {
                    status: 500,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                }
            );
        }
    }
};
