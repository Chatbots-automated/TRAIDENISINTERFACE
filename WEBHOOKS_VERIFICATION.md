# Webhooks Verification for Nestandartiniai Projektai

## Overview
All three webhook requests in the Nestandartiniai Projektai tab have been updated to fetch webhook URLs from the Supabase `webhooks` table using the `getWebhookUrl()` function from `webhooksService.ts`.

## Webhook Configuration

### Database Setup
Webhooks are stored in the Supabase `webhooks` table with the following keys:
- `n8n_upload_new` - Upload new .eml file without search
- `n8n_find_similar` - Find similar products
- `n8n_upload_solution` - Upload commercial offer for a project

To set up webhooks, run the SQL script: `SETUP_WEBHOOKS.sql`

---

## 1. Pateikti naują užklausą (New Request)

### Webhook Details
- **Webhook Key**: `n8n_upload_new`
- **Function**: `handleNewRequest()`
- **Trigger**: When user selects "Pateikti naują užklausą" card and uploads a .eml file

### Request Validation
✅ Webhook URL fetched from Supabase using `getWebhookUrl('n8n_upload_new')`
✅ Validates webhook exists and is active
✅ File is converted to base64 before sending
✅ Proper error handling with Lithuanian error messages

### Request Payload
```json
{
  "action": "just-upload",
  "filename": "email.eml",
  "fileContent": "<base64-encoded-file>",
  "mimeType": "message/rfc822",
  "userId": "user-uuid",
  "userEmail": "user@example.com",
  "projectId": "project-uuid",
  "timestamp": "2024-01-22T10:30:00.000Z"
}
```

### Expected Response
```json
{
  "subjectLine": "Project subject",
  "description": "Description of the upload",
  "message": "File uploaded successfully",
  "emlFile": {
    "filename": "email.eml",
    "content": "<base64>",
    "mimeType": "message/rfc822"
  },
  "attachmentFile": {
    "filename": "document.pdf",
    "content": "<base64>",
    "mimeType": "application/pdf"
  }
}
```

### Error Handling
- Missing webhook: `"Webhook "n8n_upload_new" nerastas arba neaktyvus. Prašome sukonfigūruoti webhook Webhooks nustatymuose."`
- HTTP error: `"Webhook užklausa nepavyko: <statusText>"`
- File validation: `"Prašome pasirinkti .eml formato failą"`

### Logging
- Start: `eml_upload_started`
- Success: `eml_upload_success`
- Logs include: filename, fileSize, project_id, subject_line

---

## 2. Rasti panašius (Find Similar)

### Webhook Details
- **Webhook Key**: `n8n_find_similar`
- **Function**: `handleFindSimilar()`
- **Trigger**: When user selects "Rasti panašius" card and uploads a .eml file

### Request Validation
✅ Webhook URL fetched from Supabase using `getWebhookUrl('n8n_find_similar')`
✅ Validates webhook exists and is active
✅ File is converted to base64 before sending
✅ Proper error handling with Lithuanian error messages

### Request Payload
```json
{
  "action": "find-similar",
  "filename": "search.eml",
  "fileContent": "<base64-encoded-file>",
  "mimeType": "message/rfc822",
  "userId": "user-uuid",
  "userEmail": "user@example.com",
  "projectId": "project-uuid",
  "timestamp": "2024-01-22T10:30:00.000Z"
}
```

### Expected Response
Same format as "Pateikti naują užklausą" (includes emlFile and attachmentFile)

### Error Handling
- Missing webhook: `"Webhook "n8n_find_similar" nerastas arba neaktyvus. Prašome sukonfigūruoti webhook Webhooks nustatymuose."`
- HTTP error: `"Webhook užklausa nepavyko: <statusText>"`
- File validation: `"Prašome pasirinkti .eml formato failą"`

### Logging
- Start: `eml_search_started`
- Success: `eml_search_success`
- Logs include: filename, fileSize, project_id, subject_line

---

## 3. Pateikti sprendimą užklausai (Upload Solution)

### Webhook Details
- **Webhook Key**: `n8n_upload_solution`
- **Function**: `handleUploadSolution()`
- **Trigger**: When user selects "Pateikti sprendimą užklausai" card, selects a project, and uploads a file

### Request Validation
✅ Webhook URL fetched from Supabase using `getWebhookUrl('n8n_upload_solution')`
✅ Validates webhook exists and is active
✅ File is converted to base64 before sending
✅ Validates project is selected
✅ Proper error handling with Lithuanian error messages

### Request Payload
```json
{
  "action": "upload-solution",
  "projectId": "project-uuid",
  "projectSubjectLine": "Original project subject",
  "filename": "commercial_offer.pdf",
  "fileContent": "<base64-encoded-file>",
  "mimeType": "application/pdf",
  "userId": "user-uuid",
  "userEmail": "user@example.com",
  "timestamp": "2024-01-22T10:30:00.000Z"
}
```

### Expected Response
```json
{
  "subjectLine": "Commercial offer uploaded",
  "description": "Your commercial offer has been uploaded successfully",
  "message": "Upload successful",
  "emlFile": {
    "filename": "related.eml",
    "content": "<base64>",
    "mimeType": "message/rfc822"
  },
  "attachmentFile": {
    "filename": "commercial_offer.pdf",
    "content": "<base64>",
    "mimeType": "application/pdf"
  }
}
```

### Error Handling
- Missing webhook: `"Webhook "n8n_upload_solution" nerastas arba neaktyvus. Prašome sukonfigūruoti webhook Webhooks nustatymuose."`
- HTTP error: `"Webhook užklausa nepavyko: <statusText>"`
- Missing project: `"Prašome pasirinkti projektą"`
- Missing file: `"Prašome pasirinkti failą"`

### Logging
- Start: `commercial_offer_upload_started`
- Success: `commercial_offer_upload_success`
- Logs include: filename, fileSize, project_id, nestandartinis_project_id, project_subject

---

## File Upload Details

### File Conversion
All files are converted to base64 using the `fileToBase64()` function:
```typescript
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1]; // Remove data:... prefix
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};
```

### File Type Validation
- **New Request & Find Similar**: Only accepts `.eml` files
- **Upload Solution**: Accepts `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.txt` files
- Validation happens both on file selection and drag & drop

---

## Webhook Service Features

### Caching
- Webhook URLs are cached for 1 minute (60000ms)
- Reduces database queries for frequently used webhooks
- Cache is automatically cleared when webhooks are updated

### Active Status Check
- Only returns webhook URLs if `is_active = true`
- Returns `null` if webhook is inactive or not found
- Prevents sending requests to disabled webhooks

### Error Messages
All error messages are in Lithuanian for consistency with the interface:
- `"Webhook [key] nerastas arba neaktyvus. Prašome sukonfigūruoti webhook Webhooks nustatymuose."`
- `"Webhook užklausa nepavyko: [statusText]"`
- `"Operacija nepavyko: [message]"`

---

## Testing Webhooks

### Via Webhooks Modal (Admin Only)
1. Go to Webhooks settings in the sidebar
2. Navigate to "Nestandartiniai Gaminiai" tab
3. Each webhook can be:
   - Tested (sends test payload)
   - Enabled/Disabled
   - URL edited
   - View last test status and timestamp

### Test Payload Format
```json
{
  "test": true,
  "timestamp": "2024-01-22T10:30:00.000Z",
  "webhook_key": "n8n_upload_new",
  "message": "Test request from Traidenis admin panel"
}
```

---

## Summary

✅ All three webhooks fetch URLs from Supabase `webhooks` table
✅ Proper validation and error handling in place
✅ Files are correctly encoded as base64
✅ Request payloads include all necessary user and file information
✅ Response handling for file downloads implemented
✅ Comprehensive logging for all operations
✅ Lithuanian error messages throughout
✅ Active status checking prevents calling inactive webhooks
✅ 1-minute caching reduces database load

## Next Steps

1. Run `SETUP_WEBHOOKS.sql` in Supabase SQL Editor
2. Update webhook URLs in the Webhooks settings modal
3. Set webhooks to active status
4. Configure n8n workflows to handle the request payloads
5. Ensure n8n workflows return responses in the expected format
