# SSL Certificate Issue - n8n Webhook Calls

## Problem
The browser's `fetch()` API rejects requests to `https://n8n.traidenis.lt:5678` because the server uses a **self-signed SSL certificate**. Browsers enforce strict SSL verification and cannot be configured to bypass this for security reasons.

**Error:** `SSL certificate problem: self signed certificate`

---

## ✅ Solution 1: Use HTTP Instead (Recommended - Quick Fix)

### What Changed
I've updated `SETUP_WEBHOOKS.sql` to use **HTTP** URLs instead of HTTPS:
- ❌ Before: `https://n8n.traidenis.lt:5678/webhook/...`
- ✅ After: `http://n8n.traidenis.lt:5678/webhook/...`

### Setup Steps
1. **Ensure n8n accepts HTTP connections**
   - Check your n8n configuration allows HTTP on port 5678
   - No infrastructure changes needed if n8n already listens on HTTP

2. **Update webhook URLs in Supabase**
   ```bash
   # Run this in Supabase SQL Editor
   UPDATE webhooks
   SET url = REPLACE(url, 'https://', 'http://')
   WHERE webhook_key LIKE 'n8n_%';
   ```

   OR re-run the updated `SETUP_WEBHOOKS.sql` file

3. **Test the webhooks**
   - Go to Webhooks settings in your admin panel
   - Test each n8n webhook
   - Should now work without SSL errors

### Security Considerations
- ✅ **Safe for internal networks**: If your frontend and n8n are on the same internal network or behind a firewall
- ✅ **Safe for localhost/development**: Perfect for development environments
- ⚠️ **Not recommended for public internet**: HTTP is unencrypted, so data can be intercepted

---

## Solution 2: Get a Valid SSL Certificate (Recommended - Production)

### Using Let's Encrypt (Free)
If your n8n instance is publicly accessible, get a free SSL certificate:

```bash
# Install certbot
sudo apt-get install certbot

# Get certificate (automatic)
sudo certbot certonly --standalone -d n8n.traidenis.lt

# Or use nginx/apache plugin
sudo certbot --nginx -d n8n.traidenis.lt
```

### Configure n8n with the certificate
```bash
# Edit your n8n configuration
export N8N_PROTOCOL=https
export N8N_SSL_KEY=/etc/letsencrypt/live/n8n.traidenis.lt/privkey.pem
export N8N_SSL_CERT=/etc/letsencrypt/live/n8n.traidenis.lt/fullchain.pem

# Restart n8n
pm2 restart n8n
```

### Update webhooks back to HTTPS
Once you have a valid certificate, update webhooks to use `https://`:
```sql
UPDATE webhooks
SET url = REPLACE(url, 'http://', 'https://')
WHERE webhook_key LIKE 'n8n_%';
```

---

## Solution 3: Reverse Proxy with Valid Certificate

### Using Nginx or Caddy
Set up a reverse proxy with a valid certificate that forwards to your n8n instance:

#### Option A: Nginx
```nginx
server {
    listen 443 ssl;
    server_name n8n.traidenis.lt;

    ssl_certificate /etc/letsencrypt/live/n8n.traidenis.lt/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/n8n.traidenis.lt/privkey.pem;

    location / {
        proxy_pass http://localhost:5678;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Option B: Caddy (Automatic HTTPS)
```caddyfile
n8n.traidenis.lt {
    reverse_proxy localhost:5678
}
```

Caddy automatically gets and renews Let's Encrypt certificates!

---

## Solution 4: Backend Proxy (Complex - Not Recommended)

If you absolutely need to keep self-signed certificates and HTTPS, you'd need to create a backend service that can bypass SSL verification. This requires:

1. **Node.js/Express backend**
2. **Custom HTTPS agent with `rejectUnauthorized: false`**
3. **Deploy the proxy service**

This is **NOT recommended** because:
- Adds complexity and maintenance burden
- Requires additional infrastructure
- Security risk if misconfigured
- Better to fix the SSL certificate issue at the source

---

## What I've Done

1. ✅ **Updated `SETUP_WEBHOOKS.sql`** to use HTTP URLs for all n8n webhooks
2. ✅ **Left webhook calling code unchanged** - it will work with any valid URL (HTTP or HTTPS)
3. ✅ **Created this guide** explaining all solutions

---

## Recommended Approach

### For Development/Internal Networks
**Use Solution 1 (HTTP)** - Simple, works immediately, safe for internal use

### For Production/Public Internet
**Use Solution 2 (Let's Encrypt)** or **Solution 3 (Reverse Proxy)** - Free, secure, proper solution

---

## Testing

After applying Solution 1 (HTTP URLs):

1. Go to your app's Webhooks settings (admin panel)
2. Navigate to "Nestandartiniai Gaminiai" tab
3. Click "Test" on `n8n_upload_new` webhook
4. Should see: ✅ Status 200 (or whatever your n8n returns)
5. Test the other two webhooks similarly

If tests pass, the integration will work in the Nestandartiniai Projektai interface.

---

## Current Webhook URLs (After Fix)

```
n8n_upload_new:
http://n8n.traidenis.lt:5678/webhook-test/4929719e-8f1b-45da-9b0e-2427184f67eb

n8n_find_similar:
http://n8n.traidenis.lt:5678/webhook/find-similar
(Update to your actual endpoint)

n8n_upload_solution:
http://n8n.traidenis.lt:5678/webhook/upload-solution
(Update to your actual endpoint)
```

Update these URLs in the Webhooks settings modal as needed.
