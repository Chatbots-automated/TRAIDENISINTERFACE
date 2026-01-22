# EML Upload Feature - Nestandartiniai Gaminiai

## Overview

The "Nestandartiniai Gaminiai" (Non-standard Products) feature allows users to upload .eml files (email files) and search for similar products using an n8n webhook integration.

## Features

- **File Upload**: Support for large .eml files (10MB+)
- **Drag & Drop**: Easy file upload with drag-and-drop interface
- **Webhook Integration**: Sends files to n8n for processing
- **Response Display**: Shows search results with files and descriptions
- **File Download**: Download returned .eml, PDF, and Word files

## User Interface

The tab is accessible from the main navigation bar with the "EML Upload" button (Package icon).

### Upload Flow

1. **Upload .eml File**
   - Drag and drop an .eml file into the upload area
   - OR click "Naršyti failus" (Browse files) to select a file
   - File size limit: 25MB
   - Only .eml files are accepted

2. **Search for Similar Products**
   - Click "Rasti Panašų" (Find Similar) button
   - System displays loading state while processing
   - Request is sent to configured n8n webhook

3. **View Results**
   - Results page shows "Rasti aktualūs failai" (Found relevant files)
   - Displays:
     - Subject line from email thread
     - Description text explaining why these files were retrieved
     - .eml file (original or similar)
     - Additional PDF or Word document (if available)
   - Files are displayed in a card-based layout matching the app's macOS-inspired design

4. **Download Files**
   - Click on any file card to download it
   - Files are automatically decoded from base64 and downloaded

5. **New Search**
   - Click "Nauja paieška" (New Search) to start over

## Configuration

### Environment Variables

Add the following environment variable to your `.env` file:

```env
VITE_N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/eml-search
```

Replace `https://your-n8n-instance.com/webhook/eml-search` with your actual n8n webhook URL.

### n8n Webhook Requirements

The webhook should:

1. **Accept POST requests** with the following JSON payload:
```json
{
  "filename": "email.eml",
  "fileContent": "base64_encoded_content",
  "mimeType": "message/rfc822",
  "userId": "user_id",
  "userEmail": "user@example.com",
  "projectId": "project_id",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

2. **Return JSON response** with the following structure:
```json
{
  "subjectLine": "Email Subject Line",
  "description": "Description of why these files were retrieved",
  "emlFile": {
    "filename": "similar.eml",
    "content": "base64_encoded_content",
    "mimeType": "message/rfc822"
  },
  "attachmentFile": {
    "filename": "document.pdf",
    "content": "base64_encoded_content",
    "mimeType": "application/pdf"
  }
}
```

**Notes:**
- `emlFile` is optional (can be omitted if no similar email found)
- `attachmentFile` is optional (can be omitted if no attachment available)
- `description` should explain the search results
- All file contents must be base64 encoded

## Technical Details

### Component Location
`/src/components/NestandardiniaiInterface.tsx`

### Key Features
- **File validation**: Only accepts .eml files
- **Large file support**: Handles files up to 25MB
- **Error handling**: User-friendly error messages
- **Loading states**: Clear visual feedback during processing
- **Logging**: Comprehensive logging with appLogger service
- **macOS-style UI**: Consistent with the rest of the application

### Dependencies
- React hooks (useState, useRef)
- Lucide React icons
- appLogger service for logging
- Environment variable configuration

### Styling
Uses the app's macOS-inspired design system:
- `.macos-card` - Card containers
- `.macos-btn` - Button styles
- `.macos-animate-*` - Animation classes
- Custom color palette (macos-purple, macos-blue, etc.)

## Error Handling

The component handles various error scenarios:

1. **Invalid File Type**: Shows error if non-.eml file is selected
2. **Missing Webhook URL**: Alerts if environment variable not configured
3. **Network Errors**: Displays error if webhook request fails
4. **Download Errors**: Shows error if file download fails

All errors are logged to the appLogger service for debugging.

## Usage Tips

1. **File Size**: While the component supports large files (10MB+), ensure your n8n instance is configured to handle large payloads
2. **Timeout**: Long-running webhook processing may timeout - consider implementing async processing with callbacks
3. **File Formats**: The component accepts PDF and Word documents in the response - ensure they're properly base64 encoded

## Future Enhancements

Potential improvements:
- Batch file upload support
- Search history
- Advanced filtering options
- Direct integration with email servers
- Progress indicators for large file uploads
