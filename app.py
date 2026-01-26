"""
Flask server to serve the embedded chat with dynamic JWT generation
"""
from flask import Flask, render_template_string, jsonify
from flask_cors import CORS
from jwt_generator import WatsonxJWTGenerator
import os

app = Flask(__name__)
CORS(app)

# Initialize JWT generator
generator = WatsonxJWTGenerator(
    private_key_path='keys/example-jwtRS256.key',
    ibm_public_key_path='keys/ibmPublic.key.pub'
)

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>watsonx Orchestrate - Live Chat</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            padding: 2rem;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .header h1 {
            color: #667eea;
            font-size: 2rem;
            margin-bottom: 0.5rem;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            background: #d4edda;
            color: #155724;
            padding: 0.5rem 1rem;
            border-radius: 20px;
            font-weight: 600;
            margin-top: 1rem;
        }

        .container {
            flex: 1;
            max-width: 1200px;
            margin: 2rem auto;
            padding: 0 2rem;
            width: 100%;
        }

        .chat-card {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 12px;
            padding: 2rem;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
        }

        #root {
            min-height: 500px;
            background: white;
            border-radius: 8px;
            padding: 1rem;
        }

        .debug-info {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 1rem;
            margin-top: 1rem;
            border-radius: 4px;
            font-family: monospace;
            font-size: 0.85rem;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🤖 watsonx Orchestrate - Live Chat</h1>
        <div class="status-badge">✅ JWT Authentication Active</div>
    </div>

    <div class="container">
        <div class="chat-card">
            <h2 style="color: #667eea; margin-bottom: 1rem;">💬 Embedded Chat</h2>
            <div id="root">
                <p style="text-align: center; color: #999; padding: 2rem;">
                    Initializing chat...
                </p>
            </div>
            <div class="debug-info" id="debug">
                Status: Loading...
            </div>
        </div>
    </div>

    <script>
        // Global token storage
        let currentToken = null;
        
        // Function to fetch a fresh token from the server
        async function fetchToken() {
            try {
                const response = await fetch('/api/token');
                if (!response.ok) {
                    throw new Error(`Failed to fetch token: ${response.status}`);
                }
                const data = await response.json();
                currentToken = data.token;
                
                document.getElementById('debug').innerHTML = 
                    'Status: Token received<br>' +
                    'User: ' + data.user_id + '<br>' +
                    'Expires: ' + new Date(data.expires_at * 1000).toLocaleString() + '<br>' +
                    'Chat: Ready';
                
                return currentToken;
            } catch (error) {
                console.error('Failed to get token:', error);
                document.getElementById('debug').innerHTML = 'Error: Failed to get authentication token';
                throw error;
            }
        }
        
        // Initialize the chat
        async function initChat() {
            // Fetch initial token
            await fetchToken();
            
            // Configure wxO
            window.wxOConfiguration = {
                orchestrationID: "{{ orchestration_id }}",
                hostURL: "{{ host_url }}",
                rootElementID: "root",
                chatOptions: {
                    agentId: "{{ agent_id }}",
                    agentEnvironmentId: "{{ agent_environment_id }}"
                },
                // Provide the initial token
                token: currentToken,
                // Handle token refresh requests
                onAuthTokenNeeded: async function() {
                    console.log('🔄 Token refresh requested');
                    return await fetchToken();
                }
            };
            
            // Load the wxO chat script
            const script = document.createElement('script');
            script.src = `${window.wxOConfiguration.hostURL}/wxochat/wxoLoader.js?embed=true`;
            script.addEventListener('load', function () {
                console.log('✅ wxoLoader loaded successfully');
                document.getElementById('debug').innerHTML += '<br>Chat: Loaded successfully';
                wxoLoader.init();
            });
            script.addEventListener('error', function(error) {
                console.error('❌ Failed to load wxoLoader:', error);
                document.getElementById('debug').innerHTML += '<br>Error: Failed to load chat';
            });
            document.head.appendChild(script);
        }
        
        // Start initialization
        initChat();
    </script>
</body>
</html>
"""

@app.route('/')
def index():
    return render_template_string(
        HTML_TEMPLATE,
        orchestration_id="20260126-1305-0189-1099-b2cf449c589c_20260126-1332-1571-30ef-acf1a3847d97",
        host_url="https://ap-southeast-1.dl.watson-orchestrate.ibm.com",
        agent_id="c4cb63cc-c59a-4e45-b77d-9e299229d7d4",
        agent_environment_id="ffd2c972-994a-4ca0-8b4d-a990cf736f7a"
    )

@app.route('/api/token')
def get_token():
    """Generate a fresh JWT token"""
    user_id = "demo-user-123"
    user_data = {
        "email": "demo@example.com",
        "name": "Demo User",
        "custom_message": "Encrypted message"
    }
    
    # Context data (not encrypted, accessible by agent)
    context = {
        "dev_id": 23424,
        "dev_name": "Demo User",
        "is_active": True
    }
    
    token = generator.generate_token(user_id, user_data, context, expires_in_hours=24)
    
    # Decode to get expiration
    import jwt
    decoded = jwt.decode(token, options={"verify_signature": False})
    
    return jsonify({
        "token": token,
        "user_id": user_id,
        "expires_at": decoded.get('exp', 0)
    })

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 Starting watsonx Orchestrate Chat Server")
    print("=" * 60)
    print("\n📍 Open your browser to: http://localhost:5000")
    print("\n⚠️  Press CTRL+C to stop the server\n")
    app.run(debug=True, port=5000)
