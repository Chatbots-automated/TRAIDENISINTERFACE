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

## Solution 4: Netlify Functions Proxy (✅ IMPLEMENTED)

**This solution is now LIVE in the codebase!**

If you need to keep self-signed certificates and HTTPS, we use Netlify Functions as a serverless proxy to bypass SSL certificate verification.

### How It Works

1. **Client → Netlify Function**: Browser calls `/.netlify/functions/n8n-proxy` (trusted domain, no SSL issues)
2. **Netlify Function → n8n**: Server-side Node.js can bypass SSL verification with `NODE_TLS_REJECT_UNAUTHORIZED = '0'`
3. **Response flows back**: n8n → Netlify Function → Browser

### Implementation Details

**Files Modified:**
- `netlify/functions/n8n-proxy.ts` - New serverless function that proxies requests
- `src/lib/webhooksService.ts` - Added `callWebhookViaProxy()` helper function
- `src/lib/instructionsService.ts` - Updated to use proxy for webhook calls
- `src/lib/vectorSearch.ts` - Updated to use proxy for HTTPS webhooks
- `src/components/NestandardiniaiInterface.tsx` - All 3 webhook calls now use proxy
- `src/components/CommercialOfferPanel.tsx` - Document generation webhook uses proxy

### Usage

The proxy is automatically used for all HTTPS webhooks. No configuration needed!

```typescript
import { callWebhookViaProxy } from '../lib/webhooksService';

// Automatically handles self-signed certificates
const result = await callWebhookViaProxy('https://n8n.traidenis.lt:5678/webhook/...', {
  // your payload
});

if (result.success) {
  console.log('Response:', result.data);
}
```

### Security Considerations

⚠️ **SECURITY WARNING**: This solution disables SSL certificate verification server-side

- ✅ **Safe for development/internal use**: Good for internal n8n instances with self-signed certs
- ⚠️ **Vulnerable to MITM attacks**: The Netlify → n8n connection is not fully secure
- 🎯 **Temporary solution**: Should be replaced with proper SSL certificates (Solution 2 or 3) for production

### When to Use This Solution

- ✅ Internal n8n instance with self-signed certificate
- ✅ Development/staging environments
- ✅ Quick deployment without infrastructure changes
- ❌ Production with public internet traffic (use Let's Encrypt instead)

### Advantages

1. **No infrastructure changes**: Works with existing n8n setup
2. **Automatic**: All webhook calls transparently use the proxy
3. **CORS handling**: Bonus benefit - handles CORS issues as well
4. **Serverless**: No additional servers to maintain (uses Netlify's infrastructure)

### Deployment

Deployed automatically with your Netlify site. The function is available at:
```
https://your-site.netlify.app/.netlify/functions/n8n-proxy
```

No environment variables needed - the function accepts the webhook URL as a parameter.

---

## What Has Been Implemented

1. ✅ **Netlify Functions Proxy (Solution 4)** - Serverless proxy to bypass SSL verification
2. ✅ **Updated all webhook calls** - Now use `callWebhookViaProxy()` for HTTPS webhooks
3. ✅ **Automatic HTTPS detection** - Proxy is used only for HTTPS URLs (HTTP/ngrok URLs still work directly)
4. ✅ **Backward compatible** - Works with both HTTP and HTTPS webhooks
5. ✅ **Created this guide** - Comprehensive documentation of all solutions

---

## Recommended Approach

### For Development/Internal Networks (Current Implementation)
**✅ Solution 4 (Netlify Proxy)** - Currently implemented and working
- Handles self-signed certificates automatically
- No infrastructure changes needed
- Works immediately

**Alternative: Solution 1 (HTTP)** - Simpler if you can use HTTP
- Requires changing webhook URLs to HTTP
- No proxy needed

### For Production/Public Internet (Future Upgrade)
**🎯 Solution 2 (Let's Encrypt)** or **Solution 3 (Reverse Proxy)** - Proper long-term solution
- Free SSL certificates from Let's Encrypt
- Secure end-to-end encryption
- Remove the need for proxy bypass
- Professional production setup

### Migration Path

```
Current: Browser → Netlify Proxy → n8n (self-signed HTTPS)
                  ↑ bypasses SSL verification

Future:  Browser → n8n (Let's Encrypt HTTPS)
                  ✓ fully verified SSL
```

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
