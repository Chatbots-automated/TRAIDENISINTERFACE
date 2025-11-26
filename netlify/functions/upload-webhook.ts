import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

/**
 * Netlify Function: Upload Webhook Proxy
 *
 * Proxies file upload requests to n8n webhook, solving CORS issues.
 * Handles multipart/form-data for file uploads.
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
  const webhookUrl = process.env.UPLOAD_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error("UPLOAD_WEBHOOK_URL environment variable is not set");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Upload webhook URL not configured" })
    };
  }

  try {
    // Get content type from request
    const contentType = event.headers["content-type"] || "application/json";

    console.log("Proxying upload request to:", webhookUrl);

    // Forward the request to n8n webhook
    // Note: body is already base64 encoded for binary data
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
      },
      body: event.isBase64Encoded ? Buffer.from(event.body || "", "base64") : event.body
    });

    // Get response text
    const responseText = await response.text();
    const responseContentType = response.headers.get("content-type") || "application/json";

    // Return the response with proper CORS headers
    return {
      statusCode: response.status,
      headers: {
        "Content-Type": responseContentType,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      },
      body: responseText
    };
  } catch (error: any) {
    console.error("Error proxying upload webhook:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error: "Failed to proxy upload request",
        message: error.message
      })
    };
  }
};

export { handler };
