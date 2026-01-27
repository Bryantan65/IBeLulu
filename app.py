"""
Flask server to serve the embedded chat with dynamic JWT generation
"""
from flask import Flask, render_template_string, jsonify
from flask_cors import CORS
from jwt_generator import WatsonxJWTGenerator
import os
import datetime

app = Flask(__name__)
CORS(app)

# Initialize JWT generator
# Warning: Ensure keys exist in ./keys/ folder
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
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; flex-direction: column; }
        .header { background: rgba(255, 255, 255, 0.95); padding: 2rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .container { flex: 1; max-width: 1200px; margin: 2rem auto; padding: 0 2rem; width: 100%; }
        .chat-card { background: white; border-radius: 12px; padding: 2rem; min-height: 600px; }
        #root { min-height: 500px; }
    </style>
</head>
<body>
    <div class="header"><h1>🤖 watsonx Orchestrate - Live Chat</h1></div>
    <div class="container">
        <div class="chat-card">
            <div id="root"></div>
        </div>
    </div>
    <script>
        let currentToken = null;
        async function fetchToken() {
            const res = await fetch('/api/token');
            const data = await res.json();
            currentToken = data.token;
            return currentToken;
        }
        async function initChat() {
            await fetchToken();
            window.wxOConfiguration = {
                orchestrationID: "20260126-1305-0189-1099-b2cf449c589c_20260126-1332-1571-30ef-acf1a3847d97",
                hostURL: "https://ap-southeast-1.dl.watson-orchestrate.ibm.com",
                rootElementID: "root",
                token: currentToken,
                chatOptions: {
                    agentId: "c4cb63cc-c59a-4e45-b77d-9e299229d7d4",
                    agentEnvironmentId: "ffd2c972-994a-4ca0-8b4d-a990cf736f7a"
                },
                onAuthTokenNeeded: async () => await fetchToken()
            };
            const script = document.createElement('script');
            script.src = `${window.wxOConfiguration.hostURL}/wxochat/wxoLoader.js?embed=true`;
            script.addEventListener('load', () => wxoLoader.init());
            document.head.appendChild(script);
        }
        initChat();
    </script>
</body>
</html>
"""

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/api/token')
def get_token():
    user_id = "demo-user-123"
    user_data = {"email": "demo@example.com", "name": "Demo User"}
    context = {"dev_id": 23424, "dev_name": "Demo User", "is_active": True}
    
    token = generator.generate_token(user_id, user_data, context)
    return jsonify({"token": token, "user_id": user_id})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
