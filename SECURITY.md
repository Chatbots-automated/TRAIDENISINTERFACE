# Security & Setup Guide

## 🔒 Security Improvements Implemented

This document explains the security improvements made to fix CORS issues and protect sensitive credentials.

### What Was Fixed

#### 1. **Removed Service Role Key from Git** ✅
- **CRITICAL**: Supabase service role key was exposed in `netlify.toml`
- **Risk**: Anyone with repo access had full database admin access
- **Fix**: Removed from git, must now be configured in Netlify Dashboard

#### 2. **Implemented Netlify Functions Proxy** ✅
- **Problem**: Direct webhook calls from browser caused CORS errors
- **Problem**: Webhook URLs were hardcoded in frontend (insecure)
- **Solution**: Created serverless functions to proxy webhook requests
- **Benefits**:
  - ✅ Fixes CORS issues for all deploy previews
  - ✅ Hides webhook URLs from frontend
  - ✅ Works for production and all branches
  - ✅ More secure architecture

#### 3. **Moved Credentials to Environment Variables** ✅
- Webhook URLs now configured server-side only
- No secrets exposed in frontend code

---

## 🚀 Setup Instructions

### Step 1: Configure Netlify Environment Variables

You **MUST** add these environment variables in Netlify for the app to work:

1. Go to **Netlify Dashboard**
2. Select your site
3. Go to **Site configuration** → **Environment variables**
4. Click **Add a variable** and add the following:

#### Required Variables:

```bash
# Chat webhook (for chat messages and commercial offers)
CHAT_WEBHOOK_URL=https://n8n-self-host-gedarta.onrender.com/webhook-test/16bbcb4a-d49e-4590-883b-440eb952b3c6

# Upload webhook (for document uploads)
UPLOAD_WEBHOOK_URL=https://209f05431d92.ngrok-free.app/webhook/88b13b24-9857-49f4-a713-41b2964177f7

# Search webhook (for vector search)
SEARCH_WEBHOOK_URL=https://209f05431d92.ngrok-free.app/webhook-test/8a667605-f58f-42e0-a8f1-5ce633954009
```

#### Variable Scope:
- ✅ Enable for: **Production**
- ✅ Enable for: **Deploy previews**
- ✅ Enable for: **Branch deploys**

### Step 2: Redeploy Your Site

After adding environment variables:
1. Trigger a new deploy (push to git or manual deploy)
2. Netlify will build with the new configuration
3. Functions will be available at `/.netlify/functions/*`

### Step 3: Verify Setup

Test that webhooks work:
1. Open your deployed site
2. Try sending a chat message
3. Check browser console for errors
4. Check Netlify Function logs if issues occur

---

## 🏗️ Architecture Overview

### Before (Broken):
```
Browser (Netlify) → n8n (Render)
     ❌ CORS blocked - different origins
```

### After (Fixed):
```
Browser (Netlify) → Netlify Function (same origin) → n8n (Render)
                     ✅ No CORS issue!
```

### How It Works:

1. **Frontend** calls `/.netlify/functions/chat-webhook`
2. **Netlify Function** receives request (same-origin, no CORS)
3. **Function** forwards to actual n8n webhook URL (from env var)
4. **n8n** processes and returns response
5. **Function** adds CORS headers and returns to frontend
6. **Browser** receives response (CORS satisfied)

---

## 📁 File Structure

```
netlify/
└── functions/
    ├── chat-webhook.ts      # Proxies chat & commercial offer requests
    ├── upload-webhook.ts    # Proxies file upload requests
    └── search-webhook.ts    # Proxies vector search requests

.env.example                 # Template for environment variables
netlify.toml                 # Netlify build configuration
SECURITY.md                  # This file
```

---

## 🔐 Security Best Practices

### ✅ DO:
- Store sensitive keys in Netlify Dashboard environment variables
- Use Netlify Functions for server-side operations
- Keep service role keys server-side only
- Use Row Level Security (RLS) in Supabase
- Rotate keys if they were exposed

### ❌ DON'T:
- Commit secrets to git
- Expose service role keys to frontend (variables starting with `VITE_`)
- Hardcode webhook URLs in frontend code
- Disable CORS on production APIs
- Share admin credentials

---

## 🔧 Local Development

For local development:

1. Create `.env` file (NOT committed to git):
```bash
cp .env.example .env
```

2. Add your webhook URLs to `.env`

3. Install Netlify CLI:
```bash
npm install -g netlify-cli
```

4. Run with Netlify Dev (to test functions locally):
```bash
netlify dev
```

This runs your app with local function emulation.

---

## 🚨 If You Had Security Issues

### If Service Role Key Was Exposed:

1. **Rotate the key immediately**:
   - Go to Supabase Dashboard
   - Project Settings → API
   - Generate new Service Role Key
   - Update in Netlify Dashboard (if needed for functions)

2. **Audit database activity**:
   - Check for suspicious queries
   - Review user accounts created
   - Check data modifications

3. **Review git history**:
   - Consider using `git filter-branch` to remove keys from history
   - Or create a new repository if heavily compromised

---

## 📝 Environment Variables Reference

| Variable | Where Used | Exposed to Frontend? | Description |
|----------|-----------|---------------------|-------------|
| `VITE_SUPABASE_URL` | Frontend | ✅ Yes | Public Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend | ✅ Yes | Public anon key (safe) |
| `CHAT_WEBHOOK_URL` | Netlify Functions | ❌ No | n8n chat webhook |
| `UPLOAD_WEBHOOK_URL` | Netlify Functions | ❌ No | n8n upload webhook |
| `SEARCH_WEBHOOK_URL` | Netlify Functions | ❌ No | n8n search webhook |

---

## 🐛 Troubleshooting

### "Webhook URL not configured" Error

**Cause**: Environment variables not set in Netlify

**Fix**:
1. Check Netlify Dashboard → Environment Variables
2. Ensure variables are enabled for your deploy context
3. Redeploy the site

### CORS Errors Still Occurring

**Cause**: Frontend still calling old webhook URLs directly

**Fix**:
1. Clear browser cache
2. Hard refresh (Ctrl+Shift+R)
3. Check that code is updated to use `/.netlify/functions/*`

### Functions Not Found (404)

**Cause**: Functions didn't build correctly

**Fix**:
1. Check Netlify build logs
2. Ensure `netlify/functions/*.ts` files exist
3. Check for TypeScript errors
4. Verify `@netlify/functions` is installed

---

## 📚 Additional Resources

- [Netlify Functions Documentation](https://docs.netlify.com/functions/overview/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/security)
- [CORS Explained](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] Chat messages work without CORS errors
- [ ] File uploads work
- [ ] Vector search works
- [ ] No secrets visible in browser DevTools
- [ ] No secrets in git history
- [ ] Environment variables set in Netlify Dashboard
- [ ] Functions show in Netlify Functions tab
- [ ] All deploy previews work

---

**Last Updated**: 2025-11-26
**Maintained By**: Development Team
