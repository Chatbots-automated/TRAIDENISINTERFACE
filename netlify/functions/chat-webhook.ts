import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

/**
 * Netlify Function: Chat Webhook Proxy
 *
 * Proxies chat requests to n8n webhook, solving CORS issues.
 * The webhook URL is stored securely in environment variables.
 */
const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  // Get webhook URL from environment variable
  const webhookUrl = process.env.CHAT_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error("CHAT_WEBHOOK_URL environment variable is not set");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Webhook URL not configured" })
    };
  }

  try {
    // Parse the request body
    const body = event.body ? JSON.parse(event.body) : {};

    console.log("Proxying chat request to:", webhookUrl);

    // Forward the request to n8n webhook
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body)
    });

    // Get response text (handles both JSON and streaming)
    const responseText = await response.text();
    const contentType = response.headers.get("content-type") || "text/plain";

    // Return the response with proper CORS headers
    return {
      statusCode: response.status,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*", // Allows all origins (adjust for production)
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      },
      body: responseText
    };
  } catch (error: any) {
    console.error("Error proxying chat webhook:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error: "Failed to proxy webhook request",
        message: error.message
      })
    };
  }
};

export { handler };
