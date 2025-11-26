# 🚀 Deploy n8n CORS Proxy - Simple Guide

## The Problem
Your n8n webhook doesn't have CORS headers, so the browser blocks the requests.

## The Solution
I've created a simple proxy that sits between your chat and n8n. It adds CORS headers automatically.

---

## ⚡ Deploy in 3 Minutes

### Step 1: Go to Supabase Dashboard

1. Open https://supabase.com/dashboard
2. Select your project: **tahsnionivotlbbbyuya**
3. Click **"Edge Functions"** in the left sidebar

### Step 2: Create New Function

1. Click **"New Function"** or **"Deploy a new function"**
2. **Name:** `n8n-proxy`
3. **Verify JWT:** Set to **OFF** (uncheck it)

### Step 3: Copy the Code

Copy this entire code into the function editor:

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const N8N_WEBHOOK_URL = "https://n8n-self-host-gedarta.onrender.com/webhook-test/16bbcb4a-d49e-4590-883b-440eb952b3c6";

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log("Proxying request to n8n webhook...");

    // Get the request body
    const body = await req.text();
    console.log("Request body:", body);

    // Forward the request to n8n
    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
      },
      body: body,
    });

    console.log("n8n responded with status:", n8nResponse.status);

    // Check if the response is a stream
    const contentType = n8nResponse.headers.get("content-type");
    console.log("Content-Type:", contentType);

    // Stream the response back with CORS headers
    const reader = n8nResponse.body?.getReader();

    if (!reader) {
      console.error("No reader available");
      return new Response("No response body from n8n", {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Create a new readable stream that adds CORS headers
    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              console.log("Stream complete");
              break;
            }

            controller.enqueue(value);
          }
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        } finally {
          controller.close();
          reader.releaseLock();
        }
      },
    });

    return new Response(stream, {
      status: n8nResponse.status,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType || "application/json",
        "Transfer-Encoding": "chunked",
      },
    });

  } catch (error) {
    console.error("Proxy error:", error);
    return new Response(
      JSON.stringify({
        error: "Proxy failed",
        message: error.message,
        details: error.toString()
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
```

### Step 4: Deploy

1. Click **"Deploy"** or **"Save"**
2. Wait for deployment to complete (usually 10-30 seconds)
3. You should see: ✅ **Function deployed successfully**

---

## ✅ Test It Works

After deploying, test in your browser console (F12):

```javascript
fetch('https://tahsnionivotlbbbyuya.supabase.co/functions/v1/n8n-proxy', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_ANON_KEY'
  },
  body: JSON.stringify({
    question: 'test',
    chat_id: '123',
    user_id: '456',
    project_id: '789'
  })
}).then(r => {
  console.log('✅ Proxy works!', r.status);
  return r.text();
}).then(text => console.log('Response:', text));
```

Expected: You should see the n8n response!

---

## 🎉 Done!

The chat is already configured to use the proxy. Once deployed:

1. **Open your chat app**
2. **Send a message**
3. **See the response!**

No CORS errors anymore!

---

## 🔧 Troubleshooting

### "Function not found" error

Check the function name is exactly: `n8n-proxy` (lowercase, with hyphen)

### Still getting CORS errors

1. Check the function is deployed (green checkmark in Supabase dashboard)
2. Check your `.env` file has correct `VITE_SUPABASE_URL`
3. Try clearing browser cache (Ctrl+Shift+R)

### Can't see responses

Check Edge Function logs in Supabase dashboard:
1. Go to Edge Functions → n8n-proxy
2. Click "Logs"
3. Send a test message
4. See what errors appear

---

## 💡 Alternative: Fix n8n Directly

If you prefer to fix n8n instead (faster, no proxy needed):

1. Open your n8n workflow
2. Add "Set Headers" node
3. Add these headers:
   - `Access-Control-Allow-Origin: *`
   - `Access-Control-Allow-Methods: POST, OPTIONS, GET`
   - `Access-Control-Allow-Headers: Content-Type`
4. Handle OPTIONS method (add IF node)

Then in ChatInterface.tsx, change line 382:
```typescript
const useProxy = false; // Use direct n8n connection
```

---

## 📞 Need Help?

The proxy logs everything to Supabase Edge Function logs. If something fails, check those logs first!
