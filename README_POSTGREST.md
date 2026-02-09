# PostgreSQL + PostgREST Migration for TRAIDENIS

Complete migration from Supabase to local PostgreSQL with PostgREST API.

## 🎯 Your Setup

- **Frontend:** Netlify (cloud-hosted)
- **Backend:** Windows 11 machine (local PostgreSQL + PostgREST)
- **Challenge:** Need to expose local PostgREST to internet for Netlify access

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **[NETLIFY_SETUP.md](./NETLIFY_SETUP.md)** | ⭐ **START HERE** - Netlify + Win11 setup |
| [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) | Detailed migration instructions |
| [POSTGREST_QUICKSTART.md](./POSTGREST_QUICKSTART.md) | Quick reference guide |
| [NETWORK_SETUP.md](./NETWORK_SETUP.md) | All network scenarios |

## 🚀 Quick Start (Netlify Users)

### Step 1: Start PostgreSQL + PostgREST on Windows 11

```bash
# In WSL or Git Bash
cd /home/user/TRAIDENISINTERFACE

# Run migration script
./scripts/migrate-to-postgrest.sh

# OR manually:
docker-compose -f docker-compose.postgrest.yml up -d
```

### Step 2: Expose PostgREST to Internet

**Option A: ngrok (Easiest)**

```bash
# Windows PowerShell
cd C:\path\to\TRAIDENISINTERFACE\scripts
.\start-ngrok.ps1

# OR Windows CMD
scripts\start-ngrok.bat

# OR manually
ngrok http 3000
```

You'll get a URL like: `https://abc-123-def.ngrok-free.app`

**Option B: Cloudflare Tunnel (Best for production)**

See [NETLIFY_SETUP.md](./NETLIFY_SETUP.md#solution-2-cloudflare-tunnel-best-free-option)

### Step 3: Configure Netlify

1. Go to **Netlify Dashboard** → Site Settings → Environment Variables

2. Add/Update:
   ```
   VITE_POSTGREST_URL = https://abc-123-def.ngrok-free.app
   VITE_POSTGREST_ANON_KEY = anon
   ```

3. Trigger deploy: Deploys → Trigger deploy → Deploy site

### Step 4: Test

Visit your Netlify site and verify functionality works!

## 📦 What's Included

### Database Migration
- ✅ All Supabase tables migrated to PostgreSQL
- ✅ `nestandartiniai_projects` as VIEW on `n8n_vector_store`
- ✅ Indexes for performance
- ✅ PostgREST roles and permissions

### Backend Services
- ✅ PostgreSQL 15 (port 5432)
- ✅ PostgREST API (port 3000)
- ✅ pgAdmin web UI (port 5050)
- ✅ CORS configured for Netlify

### Client Library
- ✅ PostgREST wrapper mimicking Supabase API
- ✅ Drop-in replacement for existing code
- ✅ No changes to service files needed

### Scripts & Tools
- ✅ Automated migration script
- ✅ ngrok startup scripts (Windows)
- ✅ Docker Compose configuration

## 🏗️ Architecture

```
┌─────────────────────┐
│   Netlify (Cloud)   │  ← React app hosted here
│  your-app.netlify..│
└──────────┬──────────┘
           │ HTTPS
           ▼
┌─────────────────────┐
│   ngrok/Cloudflare  │  ← Tunnel to local machine
│   Tunnel Service    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Windows 11 PC     │
│                     │
│  ┌───────────────┐  │
│  │  PostgREST    │  │ ← Port 3000
│  │  (REST API)   │  │
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │  PostgreSQL   │  │ ← Port 5432
│  │  + n8n_vector │  │
│  └───────────────┘  │
└─────────────────────┘
```

## 🔑 Key Features

### Backward Compatibility
- ✅ Existing `NestandardiniaiInterface` component works unchanged
- ✅ Service files require no modifications
- ✅ Same API as Supabase (chainable query builders)

### Data Mapping
The `nestandartiniai_projects` table is now a **VIEW** that queries `n8n_vector_store`:

```sql
CREATE VIEW nestandartiniai_projects AS
SELECT DISTINCT ON (project_name)
  komercinis_id as id,
  project_name as subject_line,
  pateikimo_data as created_at,
  ...
FROM n8n_vector_store
WHERE project_name IS NOT NULL
```

No code changes needed! ✨

## 📝 Common Tasks

### Start Services

```bash
# Start PostgreSQL + PostgREST
docker-compose -f docker-compose.postgrest.yml up -d

# View logs
docker-compose -f docker-compose.postgrest.yml logs -f

# Stop services
docker-compose -f docker-compose.postgrest.yml down
```

### Expose to Internet

```bash
# PowerShell
.\scripts\start-ngrok.ps1

# CMD
scripts\start-ngrok.bat

# Or Cloudflare Tunnel (runs as Windows service)
cloudflared service install
cloudflared service start
```

### Database Access

```bash
# PostgreSQL CLI
docker exec -it traidenis_postgres psql -U postgres

# pgAdmin Web UI
# Open: http://localhost:5050
# Login: admin@traidenis.local / admin
```

### Test API

```bash
# Check if PostgREST is running
curl http://localhost:3000/

# Get webhooks
curl http://localhost:3000/webhooks

# Get projects
curl http://localhost:3000/nestandartiniai_projects
```

## ⚙️ Configuration Files

```
TRAIDENISINTERFACE/
├── .env.postgrest.example      ← Environment template
├── docker-compose.postgrest.yml ← Docker services
├── migrations/
│   └── 001_migrate_from_supabase.sql ← Database schema
├── scripts/
│   ├── migrate-to-postgrest.sh      ← Automated migration
│   ├── start-ngrok.bat              ← Windows ngrok script
│   └── start-ngrok.ps1              ← PowerShell ngrok script
├── src/lib/
│   ├── postgrest.ts                 ← PostgREST client
│   └── supabase.postgrest.ts        ← Supabase replacement
└── docs/
    ├── NETLIFY_SETUP.md            ← Netlify-specific guide
    ├── MIGRATION_GUIDE.md          ← Full migration guide
    ├── POSTGREST_QUICKSTART.md     ← Quick reference
    └── NETWORK_SETUP.md            ← Network configurations
```

## 🔒 Security

### Development
```env
# .env.postgrest
CORS_ORIGINS=*
POSTGREST_JWT_SECRET=any_value_for_testing
```

### Production
```env
# .env.postgrest
CORS_ORIGINS=https://your-app.netlify.app
POSTGREST_JWT_SECRET=your_secure_32_character_secret_here
```

Enable JWT authentication:
```typescript
// src/lib/postgrest.ts
headers: {
  'Authorization': `Bearer ${JWT_TOKEN}`,
  'apikey': POSTGREST_ANON_KEY
}
```

## 🆘 Troubleshooting

### Netlify can't connect

1. ✅ Check ngrok/tunnel is running
2. ✅ Test: `curl https://your-ngrok-url/webhooks`
3. ✅ Verify Netlify env vars are set
4. ✅ Check CORS configuration

### CORS errors

Update `.env.postgrest`:
```env
CORS_ORIGINS=*
```

Restart PostgREST:
```bash
docker-compose -f docker-compose.postgrest.yml restart postgrest
```

### ngrok URL changed

Free ngrok URLs change on restart:
1. Get new URL from ngrok output
2. Update Netlify env vars
3. Trigger new deploy

**Solution:** Use Cloudflare Tunnel for permanent URL

### Database connection failed

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check logs
docker logs traidenis_postgres

# Restart
docker-compose -f docker-compose.postgrest.yml restart postgres
```

## 💡 Best Practices

### Daily Development Workflow

```bash
# Morning (Windows 11):
# 1. Start Docker services
wsl -e bash -c "cd /home/user/TRAIDENISINTERFACE && docker-compose -f docker-compose.postgrest.yml up -d"

# 2. Start ngrok (if using ngrok)
.\scripts\start-ngrok.ps1

# 3. Update Netlify if ngrok URL changed

# During development:
# - Make code changes
# - Test locally: npm run dev
# - Push to Git: git push (triggers Netlify deploy)

# Evening:
# - Keep Docker running (or stop with 'docker-compose down')
# - Stop ngrok (or keep running)
```

### Production Recommendations

1. ✅ **Use Cloudflare Tunnel** instead of ngrok for permanent URL
2. ✅ **Enable JWT authentication** for API security
3. ✅ **Restrict CORS** to your Netlify domain only
4. ✅ **Regular backups** of PostgreSQL database
5. ✅ **Monitor logs** for errors and security issues

## 🌟 Alternatives to Local Hosting

If running PostgreSQL on Windows 11 becomes inconvenient:

### Option 1: Cloud PostgreSQL
- **Neon.tech** - Free serverless PostgreSQL
- **Supabase** - Stay with Supabase (easier!)
- **Railway.app** - PostgreSQL + PostgREST hosting
- **DigitalOcean** - Managed PostgreSQL

### Option 2: Fully Cloud Setup
Deploy both PostgreSQL and PostgREST to cloud:
- Railway.app (easiest)
- Render.com
- Fly.io
- Heroku

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for cloud deployment guides.

## 📊 Cost Comparison

| Solution | Cost | Best For |
|----------|------|----------|
| **ngrok Free** | $0 | Testing, development |
| **ngrok Paid** | $8/mo | Production with static URL |
| **Cloudflare Tunnel** | $0 | Production (needs domain) |
| **Neon.tech** | $0-19/mo | Cloud PostgreSQL |
| **Railway.app** | $5-20/mo | Full cloud hosting |
| **Stay with Supabase** | $0-25/mo | Easiest (no migration) |

## 📞 Support

- **Issues:** Check troubleshooting sections in docs
- **Questions:** See [NETLIFY_SETUP.md](./NETLIFY_SETUP.md)
- **Architecture:** See [NETWORK_SETUP.md](./NETWORK_SETUP.md)

## 📄 License

Same as main project.

---

**Ready to get started?** → [NETLIFY_SETUP.md](./NETLIFY_SETUP.md)
