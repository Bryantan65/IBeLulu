# 🤖 Multi-Agent Configuration Guide

## Quick Answer: Do I Need to Regenerate JWT & Security Keys for Each Chatbot?

### ✅ **NO! You Do NOT Need to Regenerate Keys**

The RSA key pairs and JWT generator are configured **once at the SERVICE INSTANCE level**, not per agent.

---

## What You Need for Each New Chatbot

### ✅ **One-Time Setup (Already Complete)**
```bash
# You only did this ONCE for your watsonx instance:
./wxO-embed-chat-security-tool.sh

# Generated files (REUSE for ALL agents):
keys/
├── example-jwtRS256.key        # Your private key (signs JWTs)
├── example-jwtRS256.key.pub    # Your public key (uploaded to watsonx)
└── ibmPublic.key.pub           # IBM's public key (encrypts user data)
```

### ✅ **For Each NEW Agent**
You only need to change **3 values** in your configuration:

```python
# In app.py - lines 194-200
return render_template_string(
    HTML_TEMPLATE,
    orchestration_id="YOUR_ORCHESTRATION_ID",  # ⚠️ Usually stays the same
    host_url="https://ap-southeast-1.dl.watson-orchestrate.ibm.com",
    agent_id="NEW_AGENT_ID",                   # ✅ CHANGE THIS
    agent_environment_id="NEW_AGENT_ENV_ID"    # ✅ CHANGE THIS
)
```

---

## Your Current Agents

### Agent 1: Hello World Agent (Original)
```python
agent_id="c4cb63cc-c59a-4e45-b77d-9e299229d7d4"
agent_environment_id="ffd2c972-994a-4ca0-8b4d-a990cf736f7a"
```

### Agent 2: New Agent (Just Added) ✨
```python
agent_id="addd6d7a-97ab-44db-8774-30fb15f7a052"
agent_environment_id="e1af0ec2-0a5c-490a-9ae1-5e3327eb3d0c"
```

---

## How to Switch Between Agents

### Option 1: Update app.py (Current Method)
```python
# Simply edit lines 198-199 in app.py:
agent_id="addd6d7a-97ab-44db-8774-30fb15f7a052",          # New agent
agent_environment_id="e1af0ec2-0a5c-490a-9ae1-5e3327eb3d0c"  # New env
```

### Option 2: Create Multiple Routes (Recommended)
```python
@app.route('/')
def hello_world():
    """Hello World Agent"""
    return render_template_string(
        HTML_TEMPLATE,
        orchestration_id="20260126-1305-0189-1099-b2cf449c589c_20260126-1332-1571-30ef-acf1a3847d97",
        host_url="https://ap-southeast-1.dl.watson-orchestrate.ibm.com",
        agent_id="c4cb63cc-c59a-4e45-b77d-9e299229d7d4",
        agent_environment_id="ffd2c972-994a-4ca0-8b4d-a990cf736f7a"
    )

@app.route('/new-agent')
def new_agent():
    """Your New Agent"""
    return render_template_string(
        HTML_TEMPLATE,
        orchestration_id="20260126-1305-0189-1099-b2cf449c589c_20260126-1332-1571-30ef-acf1a3847d97",
        host_url="https://ap-southeast-1.dl.watson-orchestrate.ibm.com",
        agent_id="addd6d7a-97ab-44db-8774-30fb15f7a052",
        agent_environment_id="e1af0ec2-0a5c-490a-9ae1-5e3327eb3d0c"
    )
```

**Access different agents at:**
- `http://localhost:5000/` - Hello World Agent
- `http://localhost:5000/new-agent` - Your New Agent

---

## Security Key Reuse - Technical Details

### How It Works

1. **Your Private Key** signs the JWT token
   - Same key works for ALL agents in your instance
   - watsonx verifies using YOUR public key (uploaded once)

2. **IBM's Public Key** encrypts user data in the JWT
   - Same IBM key for ALL agents in your instance
   - watsonx decrypts using THEIR private key

3. **Agent Selection** happens via the configuration:
   ```javascript
   chatOptions: {
       agentId: "...",           // Tells watsonx WHICH agent
       agentEnvironmentId: "..." // Tells watsonx WHICH environment
   }
   ```

### The JWT Token is Agent-Agnostic

```json
{
  "sub": "user-123",
  "iat": 1234567890,
  "exp": 1234654290,
  "user_payload": "encrypted_data",
  "context": { "custom": "data" }
}
```

**Notice:** No agent ID in the token! The token just authenticates the USER. The agent selection happens in the `wxOConfiguration`.

---

## Quick Checklist for Adding a New Agent

- [ ] Get agent configuration from watsonx:
  ```bash
  orchestrate channels webchat embed --agent-name=Your_Agent_Name
  ```

- [ ] Copy the 3 values:
  - orchestrationID (usually same for all agents)
  - agentId
  - agentEnvironmentId

- [ ] Update `app.py` (lines 196-199):
  ```python
  agent_id="YOUR_NEW_AGENT_ID",
  agent_environment_id="YOUR_NEW_AGENT_ENV_ID"
  ```

- [ ] Restart Flask:
  ```bash
  python app.py
  ```

- [ ] Test at `http://localhost:5000`

- [ ] ✅ **NO need to generate new keys!**
- [ ] ✅ **NO need to run security tool again!**
- [ ] ✅ **Same JWT generator works!**

---

## Common Confusion - Cleared Up

### ❌ WRONG Understanding:
> "Each chatbot needs its own security keys and JWT setup"

### ✅ CORRECT Understanding:
> "The security keys authenticate your APP to watsonx. Once configured, you can talk to ANY agent in that instance by just changing the agentId in the configuration."

---

## Analogy

Think of it like a **building access card**:

- **Security Keys** = Your access card (works for the whole building)
- **JWT Token** = Proves you have the valid card
- **Agent ID** = Which room/office you want to visit
- **Agent Environment ID** = Which floor (dev/prod)

You don't need a new access card for each room - you just need to specify which room you're going to!

---

## Testing Multiple Agents

### Method 1: Switch Manually
Edit `app.py`, restart server

### Method 2: Query Parameters
```python
@app.route('/')
def index():
    agent_id = request.args.get('agent', 'addd6d7a-97ab-44db-8774-30fb15f7a052')
    agent_env = request.args.get('env', 'e1af0ec2-0a5c-490a-9ae1-5e3327eb3d0c')
    
    return render_template_string(
        HTML_TEMPLATE,
        orchestration_id="20260126-1305-0189-1099-b2cf449c589c_20260126-1332-1571-30ef-acf1a3847d97",
        host_url="https://ap-southeast-1.dl.watson-orchestrate.ibm.com",
        agent_id=agent_id,
        agent_environment_id=agent_env
    )
```

**Access via:**
- `http://localhost:5000/?agent=AGENT1&env=ENV1`
- `http://localhost:5000/?agent=AGENT2&env=ENV2`

### Method 3: Dropdown Selector (Advanced)
Create a UI with a dropdown to switch agents dynamically

---

## Summary

### ✅ What You DON'T Need to Do Again:
- ❌ Generate new RSA keys
- ❌ Run `wxO-embed-chat-security-tool.sh`
- ❌ Create new `jwt_generator.py`
- ❌ Upload new public keys to watsonx
- ❌ Reconfigure security settings

### ✅ What You DO Need for Each New Agent:
- ✅ Get the agent's ID and environment ID
- ✅ Update 2 lines in `app.py` (or add a new route)
- ✅ Restart your Flask server
- ✅ **That's it!**

---

## Additional Resources

- [IBM_WATSONX_SETUP_GUIDE.md](./IBM_WATSONX_SETUP_GUIDE.md) - Complete setup guide
- [jwt_generator.py](./jwt_generator.py) - Your JWT generator (reusable!)
- [app.py](./app.py) - Flask server with embedded chat

---

**Last Updated:** January 27, 2026  
**Your Current Status:** ✅ Ready to use multiple agents with the same security setup!
