
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

export async function sendMessageToAgent(history: ChatMessage[]): Promise<string> {
    const AGENT_ID = 'addd6d7a-97ab-44db-8774-30fb15f7a052';
    const INSTANCE_ID = '20260126-1332-1571-30ef-acf1a3847d97';
    // Use the proxy path configured in vite.config.ts
    const URL = `/api/orchestrate/instances/${INSTANCE_ID}/v1/orchestrate/${AGENT_ID}/chat/completions`;

    // Using the JWT token from env as requested
    const token = import.meta.env.VITE_IBM_JWT_TOKEN;

    if (!token) {
        throw new Error('VITE_IBM_JWT_TOKEN is not defined in environment variables');
    }

    try {
        // Convert simplified history to API format
        // The API expects messages with role and content (as a string directly, like OpenAI)
        const apiMessages = history.map(msg => ({
            role: msg.role,
            content: msg.text
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
            const errorText = await response.text();
            throw new Error(`API Request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data: OrchestrateResponse = await response.json();

        // Extract the assistant's response from choices[0].message.content
        if (data.choices && data.choices.length > 0) {
            const firstChoice = data.choices[0];
            if (firstChoice && firstChoice.message && firstChoice.message.content) {
                return firstChoice.message.content;
            }
        }

        return "No response text received from agent.";

    } catch (error) {
        console.error("Error calling Watson Orchestrate:", error);
        throw error;
    }
}
