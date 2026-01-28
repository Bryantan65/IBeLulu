
// Access environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface ChatMessage {
    role: 'user' | 'assistant';
    text: string;
}

// Actual API response structure based on what the user showed
export interface OrchestrateResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    thread_id: string;
}

// Token management
let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

async function getValidToken(): Promise<string> {
    // Check if we have a valid cached token (with 5 minute buffer)
    if (cachedToken && tokenExpiry && Date.now() < (tokenExpiry * 1000 - 300000)) {
        return cachedToken;
    }

    console.log("🔄 Fetching new IBM JWT token from Edge Function...");

    try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/watson-token`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Token fetch failed: ${response.status} - ${text}`);
        }

        const data = await response.json();

        cachedToken = data.token;
        tokenExpiry = data.expires_at;

        console.log("✅ New token received, expires at:", new Date(data.expires_at * 1000).toLocaleString());
        return cachedToken as string;

    } catch (error) {
        console.error("Critical: Failed to get IBM token", error);
        throw error;
    }
}

// New signature allows optional agentId. Defaults to "Complaints Agent" if not provided.
// Complaints Agent ID: 'addd6d7a-97ab-44db-8774-30fb15f7a052'
// Review Agent ID: 'f3c41796-118f-4f5a-a77c-e29890eaca6e'
export async function sendMessageToAgent(history: ChatMessage[], agentId?: string): Promise<string> {
    const TARGET_AGENT_ID = agentId || 'addd6d7a-97ab-44db-8774-30fb15f7a052';
    const INSTANCE_ID = '20260126-1332-1571-30ef-acf1a3847d97';
    // Use the proxy path configured in vite.config.ts
    const URL = `/api/orchestrate/instances/${INSTANCE_ID}/v1/orchestrate/${TARGET_AGENT_ID}/chat/completions`;

    try {
        const token = await getValidToken();

        // Use the format provided by the user in the CURL request:
        // "content": [ { "response_type": "text", "text": "..." } ]
        const apiMessages = history.map(msg => ({
            role: msg.role,
            content: [
                { response_type: 'text', text: msg.text }
            ]
        }));

        const response = await fetch(URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                stream: false,
                messages: apiMessages
            })
        });

        if (!response.ok) {
            // If 401, maybe token expired just now? Retry once.
            if (response.status === 401) {
                console.warn("⚠️ Received 401, retrying with fresh token...");
                cachedToken = null; // Force refresh
                const newToken = await getValidToken();

                const retryResponse = await fetch(URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${newToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        stream: false,
                        messages: apiMessages
                    })
                });

                if (!retryResponse.ok) {
                    const errorText = await retryResponse.text();
                    throw new Error(`API Request failed after retry: ${retryResponse.status} ${retryResponse.statusText} - ${errorText}`);
                }

                return await parseResponse(retryResponse);
            }

            const errorText = await response.text();
            throw new Error(`API Request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return await parseResponse(response);

    } catch (error) {
        console.error("Error calling Watson Orchestrate:", error);
        throw error;
    }
}

async function parseResponse(response: Response): Promise<string> {
    const data: OrchestrateResponse = await response.json();

    // Extract the assistant's response from choices[0].message.content
    if (data.choices && data.choices.length > 0) {
        const firstChoice = data.choices[0];
        if (firstChoice && firstChoice.message && firstChoice.message.content) {
            return firstChoice.message.content;
        }
    }

    return "No response text received from agent.";
}
