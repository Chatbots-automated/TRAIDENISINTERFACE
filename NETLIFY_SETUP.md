# Netlify + Local PostgreSQL Setup Guide

This guide explains how to connect your Netlify-hosted frontend to PostgreSQL running on your Windows 11 machine.

## The Challenge

```
┌──────────────────────┐
│  Netlify (Cloud)     │  ← Frontend hosted here
│  your-app.netlify.app│
└──────────┬───────────┘
           │
           │ ❌ Cannot reach localhost:3000
           │
           ▼
┌──────────────────────┐
│  Windows 11 Machine  │
│  localhost:3000      │  ← PostgREST running here
│  (Your computer)     │
└──────────────────────┘
```

**Problem:** Netlify can't reach `localhost` on your machine. We need to expose PostgREST to the internet.

---

## Solution 1: ngrok (Recommended for Quick Setup)

### Step 1: Install ngrok on Windows 11

1. **Download ngrok:**
   - Go to https://ngrok.com/download
   - Download Windows version (64-bit)
   - Extract to `C:\ngrok\`

2. **Create free account:**
   - Sign up at https://dashboard.ngrok.com/signup
   - Get your auth token

3. **Configure ngrok:**
   ```cmd
   cd C:\ngrok
   ngrok config add-authtoken YOUR_AUTH_TOKEN_HERE
   ```

### Step 2: Start PostgreSQL + PostgREST

```bash
# In WSL or Git Bash (in project directory)
cd /home/user/TRAIDENISINTERFACE

# Start Docker services
docker-compose -f docker-compose.postgrest.yml up -d

# Verify it's running
curl http://localhost:3000/
```

### Step 3: Start ngrok Tunnel

**Option A: Using the script:**
```cmd
cd C:\path\to\TRAIDENISINTERFACE\scripts
start-ngrok.bat
```

**Option B: Manual:**
```cmd
cd C:\ngrok
ngrok http 3000
```

**You'll see output like:**
```
Session Status    online
Forwarding        https://abc-123-def.ngrok-free.app -> http://localhost:3000
```

**Copy the HTTPS URL** (e.g., `https://abc-123-def.ngrok-free.app`)

### Step 4: Configure Netlify

1. **Go to Netlify Dashboard:**
   - Site Settings → Environment Variables

2. **Add/Update these variables:**
   ```
   VITE_POSTGREST_URL = https://abc-123-def.ngrok-free.app
   VITE_POSTGREST_ANON_KEY = anon
   ```

3. **Trigger a new deploy:**
   - Deploys → Trigger deploy → Deploy site

### Step 5: Test

Visit your Netlify site and test the functionality. Check browser console for any errors.

### Important Notes

⚠️ **Free ngrok limitations:**
- URL changes when you restart ngrok
- Must keep terminal/script running
- Bandwidth limits

💡 **To keep ngrok running:**
```cmd
# Run as Windows service (optional)
nssm install ngrok "C:\ngrok\ngrok.exe" http 3000
```

---

## Solution 2: Cloudflare Tunnel (Best Free Option)

### Step 1: Install Cloudflare Tunnel

1. **Download cloudflared for Windows:**
   ```
   https://github.com/cloudflare/cloudflared/releases
   ```
   - Download `cloudflared-windows-amd64.exe`
   - Rename to `cloudflared.exe`
   - Move to `C:\cloudflared\`

2. **Add to PATH:**
   ```cmd
   setx PATH "%PATH%;C:\cloudflared"
   ```

### Step 2: Setup Tunnel

1. **Login to Cloudflare:**
   ```cmd
   cloudflared tunnel login
   ```
   - Opens browser → Select your domain

2. **Create tunnel:**
   ```cmd
   cloudflared tunnel create traidenis-api
   ```
   - Note the Tunnel ID shown

3. **Create config file:**

   Create `C:\Users\YourUser\.cloudflared\config.yml`:
   ```yaml
   tunnel: YOUR_TUNNEL_ID
   credentials-file: C:\Users\YourUser\.cloudflared\YOUR_TUNNEL_ID.json

   ingress:
     - hostname: api.yourdomain.com
       service: http://localhost:3000
     - service: http_status:404
   ```

4. **Create DNS record:**
   ```cmd
   cloudflared tunnel route dns traidenis-api api.yourdomain.com
   ```

### Step 3: Run Tunnel

**Test run:**
```cmd
cloudflared tunnel run traidenis-api
```

**Run as Windows Service (keeps running):**
```cmd
cloudflared service install
cloudflared service start
```

### Step 4: Configure Netlify

Add environment variables:
```
VITE_POSTGREST_URL = https://api.yourdomain.com
VITE_POSTGREST_ANON_KEY = anon
```

### Benefits

✅ **Permanent URL** - doesn't change
✅ **Free forever** - no bandwidth limits
✅ **HTTPS automatic**
✅ **Runs as service** - auto-starts with Windows

---

## Solution 3: Deploy to Cloud (Production)

If you want a fully cloud-based solution:

### Option A: Neon.tech (PostgreSQL) + Fly.io (PostgREST)

**Neon.tech (Free PostgreSQL):**
1. Sign up at https://neon.tech
2. Create database
3. Import your schema
4. Get connection string

**Fly.io (Free PostgREST):**
```bash
# Install flyctl
# https://fly.io/docs/hands-on/install-flyctl/

# Login
fly auth login

# Create app
fly launch --name traidenis-postgrest

# Set secrets
fly secrets set PGRST_DB_URI="postgres://..."

# Deploy
fly deploy
```

### Option B: Supabase (Stay with Supabase)

If the local setup is too complex, you could stay with Supabase and just migrate the `n8n_vector_store` data.

---

## Security Considerations

### 1. Enable JWT Authentication

Update PostgREST environment:
```yaml
# docker-compose.postgrest.yml
PGRST_JWT_SECRET: your_32_character_secret_here
```

Generate JWT token:
```bash
# In browser console or Node.js
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { role: 'authenticated' },
  'your_32_character_secret_here',
  { expiresIn: '1h' }
);
console.log(token);
```

Update frontend:
```typescript
// src/lib/postgrest.ts
const headers = {
  'Authorization': `Bearer ${JWT_TOKEN}`,
  'apikey': POSTGREST_ANON_KEY
};
```

### 2. Restrict CORS

Update `.env.postgrest`:
```env
# Only allow your Netlify domain
CORS_ORIGINS=https://your-app.netlify.app,https://your-app.netlify.com
```

### 3. Add Rate Limiting

Consider adding Cloudflare in front of ngrok/tunnel for rate limiting and DDoS protection.

---

## Troubleshooting

### "Failed to fetch" in Netlify

**Check:**
1. ngrok/tunnel is running
2. PostgREST is responding: `curl https://your-ngrok-url/`
3. CORS is configured correctly
4. Netlify env vars are set

**Test connection:**
```bash
# From your local machine
curl https://your-ngrok-url/webhooks

# Should return webhook data
```

### CORS Error

Add to `.env.postgrest`:
```env
CORS_ORIGINS=*
```

Restart services:
```bash
docker-compose -f docker-compose.postgrest.yml restart
```

### ngrok URL changed

This happens when you restart ngrok (free plan). Solutions:
1. Update Netlify env vars with new URL
2. Trigger new deploy
3. OR: Upgrade to ngrok paid plan for static URL
4. OR: Switch to Cloudflare Tunnel (permanent URL)

---

## Development Workflow

### Daily Workflow with ngrok

```bash
# 1. Start Docker (in WSL/Git Bash)
cd /home/user/TRAIDENISINTERFACE
docker-compose -f docker-compose.postgrest.yml up -d

# 2. Start ngrok (in Windows CMD)
cd C:\ngrok
ngrok http 3000

# 3. If URL changed:
#    - Update Netlify env vars
#    - Redeploy

# 4. Develop locally
npm run dev  # Test at localhost:5173

# 5. Push changes to Git
git push origin main  # Triggers Netlify deploy
```

### Automated Startup (Windows)

Create `startup-services.bat`:
```batch
@echo off
echo Starting PostgreSQL + PostgREST...
wsl -d Ubuntu -e bash -c "cd /home/user/TRAIDENISINTERFACE && docker-compose -f docker-compose.postgrest.yml up -d"

echo Starting ngrok tunnel...
start /B C:\ngrok\ngrok.exe http 3000

echo Services started!
echo Check ngrok dashboard: http://localhost:4040
pause
```

Add to Windows startup:
1. Press `Win + R`
2. Type `shell:startup`
3. Copy `startup-services.bat` to this folder

---

## Cost Comparison

| Solution | Cost | Pros | Cons |
|----------|------|------|------|
| **ngrok Free** | $0 | Easy, instant | URL changes, limits |
| **ngrok Paid** | $8/mo | Static URL, faster | Monthly cost |
| **Cloudflare Tunnel** | $0 | Permanent, unlimited | Needs domain |
| **Cloud (Neon+Fly)** | $0-20/mo | Fully hosted | Migration needed |
| **Port Forwarding** | $0 | No third party | Security risk, complex |

---

## Recommended Setup

For your case (Netlify + Win11), I recommend:

**Short term (testing):**
- ✅ Use **ngrok** for immediate setup
- Update Netlify env vars when URL changes

**Long term (production):**
- ✅ Use **Cloudflare Tunnel** with custom domain
- OR deploy PostgreSQL to cloud (Neon.tech, Railway, etc.)

---

## Next Steps

1. ✅ Choose solution (ngrok or Cloudflare Tunnel)
2. ✅ Start PostgreSQL: `docker-compose -f docker-compose.postgrest.yml up -d`
3. ✅ Expose PostgREST (run ngrok or cloudflared)
4. ✅ Update Netlify environment variables
5. ✅ Trigger new Netlify deploy
6. ✅ Test your application

Need help? Check the troubleshooting section or reach out!
