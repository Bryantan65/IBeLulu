# Deployment Guide - Watson JWT Edge Function

## 1. Install Supabase CLI

```bash
npm install -g supabase
```

## 2. Login to Supabase

```bash
supabase login
```

## 3. Link to Your Project

```bash
supabase link --project-ref your-project-ref
```

## 4. Set Environment Secrets

You need to set your Watson keys as secrets in Supabase.

### Set the Secrets

> **Note:** Your private key should be stored securely and NOT committed to version control.
> The IBM public key can be found in `keys/ibmPublic.key.pub` for reference.

```bash
# Set private key (paste the ENTIRE key including headers)
supabase secrets set WATSON_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIJQgIBADANBgkqhkiG9w0BAQEFAASCCSwwggkoAgEAAoICAQC...
...your full private key content...
-----END PRIVATE KEY-----"

# Set IBM public key (paste the ENTIRE key including headers)
supabase secrets set IBM_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA...
...your full IBM public key content...
-----END PUBLIC KEY-----"
```

**Important:** Make sure to include the entire key with:
- `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----`
- `-----BEGIN PUBLIC KEY-----` / `-----END PUBLIC KEY-----`
- All newlines preserved

## 5. Deploy the Edge Function

```bash
supabase functions deploy watson-token
```

## 6. Update Your Frontend

Replace the Flask backend URL with the Edge Function URL:

```typescript
// In aegis-frontend/index.html or React code
const BACKEND_URL = 'https://your-project.supabase.co/functions/v1'

// Fetch token
const response = await fetch(`${BACKEND_URL}/watson-token`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    user_id: 'user-123',
    name: 'John Doe',
    email: 'john@example.com'
  })
})

const { token, expires_at } = await response.json()
```

## 7. Test the Function

```bash
# Test locally first
supabase functions serve watson-token

# Then test the endpoint
curl -X POST http://localhost:54321/functions/v1/watson-token \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test-user"}'
```

## 8. Cleanup Complete ✅

The following files have been removed after migrating to Supabase Edge Functions:
- ~~`app.py`~~ (Flask backend)
- ~~`jwt_generator.py`~~ (Python JWT generator)
- ~~`requirements.txt`~~ (Python dependencies)
- ~~`keys/example-jwtRS256.key`~~ (Private key - now in Supabase secrets)

**Current project structure:**
- `aegis-frontend/` - React frontend with Watson chat integration
- `keys/ibmPublic.key.pub` - IBM public key (for reference only)
- Supabase Edge Functions handle JWT generation

## Environment Variables for Local Development

Create `.env` file in `supabase/` directory:

```bash
WATSON_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----"

IBM_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
...
-----END PUBLIC KEY-----"
```

## Verify Deployment

```bash
# Check function logs
supabase functions logs watson-token

# List all secrets (doesn't show values)
supabase secrets list
```

## Architecture After Migration

```
Frontend (React)
    ↓ HTTP POST
Supabase Edge Function (watson-token)
    ↓ Generate JWT
    ↓ Return token
Frontend
    ↓ Use token
Watson Orchestrate Chat
```

No more Flask server needed! 🎉
