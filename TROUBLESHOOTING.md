# Webhook Streaming Troubleshooting Guide

## Quick Diagnosis Checklist

When chat responses aren't appearing, check console logs for these patterns:

### ✅ WORKING Pattern
```
=== WEBHOOK RESPONSE DEBUG ===
Status: 200
Headers: {content-type: "text/event-stream"}
📦 Chunk #1 (45 bytes): data: {"response": "Hello"}
  ✓ Parsed JSON: {response: "Hello"}
  ✓ Added to fullResponse, new length: 5
✅ Stream complete - Total chunks: 12
```

### ❌ PROBLEM Patterns

#### Pattern 1: Wrong JSON Field Name
```
📦 Chunk #1: {"message": "Hello"}
  ✓ Parsed JSON: {message: "Hello"}
  ⚠️ No "response" field in parsed JSON  ← PROBLEM!
```
**FIX:** n8n must use `"response"` field, not `"message"`, `"text"`, or `"output"`

#### Pattern 2: Not Streaming
```
=== WEBHOOK RESPONSE DEBUG ===
Status: 200
Headers: {content-type: "application/json"}  ← Should be "text/event-stream"
✅ Stream complete - Total chunks: 1  ← Should be multiple chunks
```
**FIX:** Enable streaming in n8n "Respond to Webhook" node

#### Pattern 3: No Chunks Received
```
=== STREAM READING DEBUG ===
Reader available: true
✅ Stream complete - Total chunks: 0
Final response length: 0
```
**FIX:** Check CORS headers or n8n is returning empty response

#### Pattern 4: HTML Error Response
```
📦 Chunk #1: <!DOCTYPE html><html>Error 500...
```
**FIX:** n8n workflow has an error, check n8n execution logs

---

## Solution Steps

### Step 1: Verify n8n Configuration

**"Respond to Webhook" Node Settings:**
```
Response Mode: "Stream Chunks" or "Stream Each Item"
Response Body: {{ { "response": $json.output } }}
```

**Required n8n Headers:**
```javascript
// Add HTTP Response Headers node BEFORE Respond to Webhook:
{
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive"
}
```

### Step 2: Test n8n Output Format

**Send test request with curl:**
```bash
curl -X POST https://n8n-self-host-gedarta.onrender.com/webhook-test/YOUR-ID \
  -H "Content-Type: application/json" \
  -d '{"question": "test", "chat_id": "123", "user_id": "456", "project_id": "789"}' \
  --no-buffer
```

**Expected output:**
```
data: {"response": "Hello"}
data: {"response": " there"}
data: {"response": "!"}
data: [DONE]
```

### Step 3: Alternative n8n Formats

If you can't change n8n, update the chat parser:

**Option A: Support multiple field names**
```javascript
// In ChatInterface.tsx, replace line ~369-375:
if (parsed.response) {
  fullResponse += parsed.response;
} else if (parsed.message) {
  fullResponse += parsed.message;
} else if (parsed.output) {
  fullResponse += parsed.output;
} else if (parsed.text) {
  fullResponse += parsed.text;
}
```

**Option B: Use first value**
```javascript
const value = Object.values(parsed)[0];
if (typeof value === 'string') {
  fullResponse += value;
}
```

### Step 4: Check Network Issues

**Test CORS:**
```javascript
// In browser console:
fetch('https://n8n-self-host-gedarta.onrender.com/webhook-test/YOUR-ID', {
  method: 'OPTIONS'
}).then(r => r.headers.forEach((v, k) => console.log(k + ': ' + v)))
```

**Expected headers:**
```
access-control-allow-origin: *
access-control-allow-methods: POST, OPTIONS
access-control-allow-headers: Content-Type
```

---

## Common n8n Streaming Patterns

### Pattern 1: SSE (Server-Sent Events) - RECOMMENDED
```javascript
// n8n output per item:
data: {"response": "chunk text"}

// Code Node example:
return items.map(item => ({
  json: {
    response: item.json.chunk
  }
}));
```

### Pattern 2: Newline-Delimited JSON
```javascript
// n8n output per item (no "data:" prefix):
{"response": "chunk1"}
{"response": "chunk2"}
```

### Pattern 3: Plain Text Streaming
```javascript
// n8n output (no JSON):
chunk1
chunk2
chunk3
```

---

## Debugging Commands

### Check if streaming works at all:
```bash
# This should show chunks appearing one by one:
curl -N -X POST https://your-n8n-url/webhook/id \
  -H "Content-Type: application/json" \
  -d '{"question":"test"}'
```

### Monitor network in real-time:
```javascript
// In browser console BEFORE sending message:
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  console.log('FETCH:', args[0]);
  const response = await originalFetch(...args);
  console.log('RESPONSE:', response.status, response.headers.get('content-type'));
  return response;
};
```

---

## Emergency Fallback: Disable Streaming

If streaming cannot be fixed, use this non-streaming workaround:

**In ChatInterface.tsx, replace streaming logic:**
```javascript
// Around line 300, replace entire streaming block with:
const responseText = await webhookResponse.text();
console.log('Full response:', responseText);

try {
  const parsed = JSON.parse(responseText);
  fullResponse = parsed.response || parsed.message || parsed.output || responseText;
} catch {
  fullResponse = responseText;
}

// Show response immediately
if (fullResponse) {
  const aiMessage: Message = {
    id: (Date.now() + 1).toString(),
    role: 'assistant',
    content: fullResponse,
    timestamp: new Date().toISOString(),
    author_ref: 'ai-assistant'
  };
  setMessages(prev => [...prev, aiMessage]);
}
```

---

## Contact Support

If none of these solutions work, provide these details:

1. **Full console output** (copy all debug logs)
2. **Network tab screenshot** showing the webhook request/response
3. **n8n workflow screenshot** of "Respond to Webhook" node settings
4. **Actual response body** from Network tab → Preview
5. **n8n execution logs** from the workflow run

The debug logs will show exactly where the problem is!
