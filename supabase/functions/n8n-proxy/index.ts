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
