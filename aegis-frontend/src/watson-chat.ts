/**
 * Watson Orchestrate Chat Widget Initialization
 * Uses environment variables from .env.local
 */

// Extend Window interface for Watson configuration
declare global {
  interface Window {
    wxOConfiguration: {
      orchestrationID: string;
      hostURL: string;
      rootElementID: string;
      token: string | null;
      chatOptions: {
        agentId: string;
        agentEnvironmentId: string;
      };
      onAuthTokenNeeded: () => Promise<string>;
    };
    wxoLoader: {
      init: () => void;
    };
  }
}

// Environment variables (loaded from .env.local)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TOKEN_ENDPOINT = `${SUPABASE_URL}/functions/v1/watson-token`;

let currentToken: string | null = null;

/**
 * Fetch JWT token from Supabase Edge Function
 */
async function fetchToken(): Promise<string> {
  try {
    console.log('🔑 Fetching JWT token from Supabase Edge Function...');
    
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        user_id: 'demo-user-' + Date.now(),
        name: 'Demo User',
        email: 'demo@example.com'
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch token: ' + response.status);
    }
    
    const data = await response.json();
    currentToken = data.token;
    
    console.log('✅ Token received for user:', data.user_id);
    console.log('⏰ Token expires at:', new Date(data.expires_at * 1000).toLocaleString());
    
    return currentToken;
  } catch (error) {
    console.error('❌ Failed to get token:', error);
    console.error('Make sure you have deployed the watson-token Edge Function');
    console.error('See DEPLOYMENT_GUIDE.md for instructions');
    throw error;
  }
}

/**
 * Show error message in chat container
 */
function showError(chatDiv: HTMLElement): void {
  chatDiv.innerHTML = `
    <div style="padding: 20px; background: #fee; border: 1px solid #f00; border-radius: 8px; margin: 20px;">
      <h3>⚠️ Watson Chat Error</h3>
      <p>Failed to connect to authentication server.</p>
      <p><strong>Make sure to:</strong></p>
      <ol style="text-align: left;">
        <li>Set VITE_SUPABASE_URL in .env.local</li>
        <li>Set VITE_SUPABASE_ANON_KEY in .env.local</li>
        <li>Deploy watson-token Edge Function</li>
        <li>Set WATSON_PRIVATE_KEY and IBM_PUBLIC_KEY secrets in Supabase</li>
      </ol>
      <p>See <strong>DEPLOYMENT_GUIDE.md</strong> for detailed instructions.</p>
    </div>
  `;
}

/**
 * Initialize Watson Orchestrate Chat Widget
 */
export async function initWatsonChat(): Promise<void> {
  // Validate environment variables
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Missing environment variables. Check .env.local file.');
    console.error('Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
    const chatDiv = document.getElementById('watson-chat');
    if (chatDiv) showError(chatDiv);
    return;
  }

  try {
    // Fetch initial token BEFORE configuring
    await fetchToken();
    
    // Configure wxO with token at ROOT level (CRITICAL!)
    window.wxOConfiguration = {
      orchestrationID: "20260126-1305-0189-1099-b2cf449c589c_20260126-1332-1571-30ef-acf1a3847d97",
      hostURL: "https://ap-southeast-1.dl.watson-orchestrate.ibm.com",
      rootElementID: "watson-chat",
      
      // Token at ROOT level (NOT inside chatOptions)
      token: currentToken,
      
      chatOptions: {
        agentId: "addd6d7a-97ab-44db-8774-30fb15f7a052", 
        agentEnvironmentId: "e1af0ec2-0a5c-490a-9ae1-5e3327eb3d0c"
      },
      
      // Token refresh handler (REQUIRED)
      onAuthTokenNeeded: async function() {
        console.log('🔄 Token refresh requested by Watson');
        return await fetchToken();
      }
    };
    
    // Load wxoLoader script
    const script = document.createElement('script');
    script.src = window.wxOConfiguration.hostURL + '/wxochat/wxoLoader.js?embed=true';
    
    script.addEventListener('load', function () {
      console.log('✅ wxoLoader loaded successfully');
      window.wxoLoader.init();
    });
    
    script.addEventListener('error', function(error) {
      console.error('❌ Failed to load wxoLoader:', error);
    });
    
    document.head.appendChild(script);
    
  } catch (error) {
    console.error('❌ Failed to initialize Watson chat:', error);
    const chatDiv = document.getElementById('watson-chat');
    if (chatDiv) showError(chatDiv);
  }
}
