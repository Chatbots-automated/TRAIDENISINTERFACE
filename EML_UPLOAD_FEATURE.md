# EML Upload Feature - Nestandartiniai Gaminiai

## Overview

The "Nestandartiniai Gaminiai" (Non-standard Products) feature is a comprehensive workflow management system for handling non-standard product requests and commercial offers. It provides two distinct modes of operation with intelligent project selection and file management capabilities.

## Features

### Two Workflow Modes

#### 1. **Nauja Užklausa (New Request)**
- Upload new .eml files (email files)
- Choose between two actions:
  - **Find Similar** - Search for similar products and related documents
  - **Just Upload** - Upload as a new record to populate the knowledge base
- Support for large .eml files (up to 25MB)
- Drag & drop interface

#### 2. **Įkelti Sprendimą (Upload Solution)**
- Select existing project from Supabase database
- Search projects by subject line
- Upload commercial offer files (PDF, Word, Excel, etc.)
- Option to find similar products for existing projects
- Support for multiple file formats

## User Interface

### Mode Selection
The tab features a segmented control at the top to switch between:
- **Nauja Užklausa** (New Request) - Upload icon
- **Įkelti Sprendimą** (Upload Solution) - Package icon

### Workflow A: New Request (Nauja Užklausa)

1. **Select Action**
   - Choose "Rasti panašius gaminius" (Find similar) OR
   - Choose "Tiesiog įkelti naują įrašą" (Just upload)

2. **Upload .eml File**
   - Drag and drop an .eml file into the upload area
   - OR click "Naršyti failus" (Browse files) to select a file
   - File size limit: 25MB
   - Only .eml files are accepted

3. **Submit**
   - Click "Rasti Panašų" (Find Similar) OR "Įkelti Įrašą" (Upload Record)
   - System processes the request via n8n webhook

4. **View Results** (if finding similar)
   - Results page shows "Rasti aktualūs failai" (Found relevant files)
   - Displays:
     - Subject line from email thread
     - Description text explaining why these files were retrieved
     - .eml file (original or similar)
     - Additional PDF or Word document (if available)

5. **Download Files**
   - Click on any file card to download it

### Workflow B: Upload Solution (Įkelti Sprendimą)

1. **Select Project**
   - Type in the search field to find projects by subject line
   - Select a project from the dropdown
   - Projects are fetched from Supabase `nestandartiniai_projects` table

2. **Optional: Find Similar**
   - Once a project is selected, you can click "Rasti panašius šiam projektui" (Find similar for this project)
   - This will search for similar products without uploading a file
   - Results displayed in the same format as Workflow A

3. **Upload Commercial Offer**
   - With a project selected, drag and drop or browse for a commercial offer file
   - Accepts: PDF, Word, Excel, TXT, and other common formats
   - File size limit: 25MB

4. **Submit**
   - Click "Įkelti Sprendimą" (Upload Solution)
   - File is sent to n8n for processing and storage

5. **View Confirmation**
   - Success message with project subject line
   - Confirmation of upload

## Configuration

### Environment Variables

Add the following environment variables to your `.env` file:

```env
# Nestandartiniai Gaminiai Webhooks
VITE_N8N_WEBHOOK_UPLOAD_NEW=https://your-n8n-instance.com/webhook/nestandartiniai-upload-new
VITE_N8N_WEBHOOK_FIND_SIMILAR=https://your-n8n-instance.com/webhook/nestandartiniai-find-similar
VITE_N8N_WEBHOOK_UPLOAD_SOLUTION=https://your-n8n-instance.com/webhook/nestandartiniai-upload-solution
```

Replace the URLs with your actual n8n webhook endpoints.

### Supabase Database

Create a table called `nestandartiniai_projects` with the following structure:

```sql
CREATE TABLE nestandartiniai_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_line TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  project_metadata JSONB
);

-- Add index for faster searches
CREATE INDEX idx_nestandartiniai_projects_subject_line ON nestandartiniai_projects(subject_line);
```

This table will be populated by n8n when new projects are created from email uploads.

## n8n Webhook Requirements

### Webhook 1: Upload New (.eml without search)

**Endpoint:** `VITE_N8N_WEBHOOK_UPLOAD_NEW`

**Accepts POST:**
```json
{
  "action": "just-upload",
  "filename": "email.eml",
  "fileContent": "base64_encoded_content",
  "mimeType": "message/rfc822",
  "userId": "user_id",
  "userEmail": "user@example.com",
  "projectId": "project_id",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Returns:**
```json
{
  "message": "Įrašas sėkmingai įkeltas",
  "subjectLine": "Email Subject",
  "description": "Record has been added to the knowledge base"
}
```

### Webhook 2: Find Similar (by .eml file OR by project)

**Endpoint:** `VITE_N8N_WEBHOOK_FIND_SIMILAR`

**Accepts POST (with .eml file):**
```json
{
  "action": "find-similar",
  "filename": "email.eml",
  "fileContent": "base64_encoded_content",
  "mimeType": "message/rfc822",
  "userId": "user_id",
  "userEmail": "user@example.com",
  "projectId": "project_id",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Accepts POST (by project):**
```json
{
  "action": "find-similar-by-project",
  "projectId": "nestandartinis_project_id",
  "projectSubjectLine": "Project Subject Line",
  "userId": "user_id",
  "userEmail": "user@example.com",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Returns:**
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
    "filename": "commercial-offer.pdf",
    "content": "base64_encoded_content",
    "mimeType": "application/pdf"
  }
}
```

### Webhook 3: Upload Solution (Commercial Offer)

**Endpoint:** `VITE_N8N_WEBHOOK_UPLOAD_SOLUTION`

**Accepts POST:**
```json
{
  "action": "upload-solution",
  "projectId": "nestandartinis_project_id",
  "projectSubjectLine": "Project Subject Line",
  "filename": "commercial-offer.pdf",
  "fileContent": "base64_encoded_content",
  "mimeType": "application/pdf",
  "userId": "user_id",
  "userEmail": "user@example.com",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Returns:**
```json
{
  "message": "Komercinis pasiūlymas sėkmingai įkeltas",
  "subjectLine": "Project Subject Line",
  "description": "Commercial offer has been stored and linked to the project"
}
```

**Notes:**
- All file contents must be base64 encoded
- `emlFile` and `attachmentFile` in responses are optional
- All webhooks should handle errors gracefully and return appropriate error messages

## Technical Details

### Component Files

- **Main Component**: `/src/components/NestandardiniaiInterface.tsx`
- **Service Layer**: `/src/lib/nestandardiniaiService.ts`
- **Type Definitions**: Interfaces defined in component file

### Key Features

#### File Handling
- **Validation**: Type checking based on workflow mode
- **Large file support**: Handles files up to 25MB
- **Base64 encoding**: Converts files to base64 for webhook transmission
- **Download capability**: Decodes base64 responses and triggers downloads

#### Project Management
- **Search**: Real-time search by subject line with debouncing
- **Dropdown**: Autocomplete dropdown with keyboard navigation
- **Click outside**: Auto-close dropdown when clicking outside
- **Selection**: Clear visual feedback for selected project

#### State Management
- **Mode switching**: Seamless transition between workflows
- **Form reset**: Clean state when switching modes or starting new operations
- **Error handling**: Comprehensive error messages with dismiss capability
- **Loading states**: Clear visual feedback during async operations

#### Logging
- **Comprehensive tracking**: All operations logged via appLogger
- **Error logging**: Failed operations with full context
- **Success logging**: Successful operations with metadata
- **Action differentiation**: Different log actions for each workflow type

### Styling

Uses the app's macOS-inspired design system:
- `.macos-card` - Card containers with glassmorphic effects
- `.macos-btn` / `.macos-btn-primary` / `.macos-btn-secondary` - Button styles
- `.macos-segmented-control` - Mode selector
- `.macos-input` - Form inputs
- `.macos-animate-*` - Animation classes
- Custom color palette (macos-purple, macos-blue, macos-green, etc.)

### Icons

Uses Lucide React icons:
- `Upload` - File upload and new request
- `Package` - Upload solution mode
- `Search` - Project search
- `FileArchive` - .eml files
- `FileText` - PDF and Word files
- `Loader2` - Loading spinner
- `Check` - Success indicator
- `AlertCircle` - Error indicator

## Error Handling

The component handles various error scenarios:

1. **Invalid File Type**: Shows error if wrong file type for mode
2. **Missing Project**: Alerts if project not selected in solution mode
3. **Missing File**: Alerts if no file selected when required
4. **Missing Webhook URL**: Error if environment variables not configured
5. **Network Errors**: Displays error if webhook request fails
6. **Download Errors**: Shows error if file download fails
7. **Database Errors**: Handles project loading failures gracefully

All errors are logged to the appLogger service for debugging and monitoring.

## Workflow Logic Summary

```
┌─────────────────────────────────────────────────────────────┐
│                  Nestandartiniai Gaminiai                    │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
         ┌────▼─────┐                   ┌────▼─────┐
         │  Nauja   │                   │  Įkelti  │
         │ Užklausa │                   │ Sprendimą│
         └────┬─────┘                   └────┬─────┘
              │                               │
      ┌───────┴───────┐               ┌──────┴──────┐
      │               │               │             │
  ┌───▼────┐    ┌────▼─────┐    ┌────▼────┐   ┌────▼─────┐
  │  Rasti │    │ Tiesiog  │    │ Pasirink│   │  Įkelti  │
  │ Panašių│    │  Įkelti  │    │ Projektą│   │  Failą   │
  └───┬────┘    └────┬─────┘    └────┬────┘   └────┬─────┘
      │              │               │             │
      │              │          ┌────▼────┐        │
      │              │          │  Rasti  │        │
      │              │          │ Panašių │        │
      │              │          │(optional│        │
      │              │          └────┬────┘        │
      │              │               │             │
      └──────┬───────┴───────────────┴─────────────┘
             │
      ┌──────▼──────┐
      │   n8n       │
      │  Webhook    │
      └──────┬──────┘
             │
      ┌──────▼──────┐
      │   Response  │
      │   Display   │
      └─────────────┘
```

## Usage Tips

1. **Project Creation**: Projects are created automatically by n8n when processing new .eml files with "find-similar" action
2. **File Sizes**: While the component supports files up to 25MB, ensure your n8n instance and server are configured to handle large payloads
3. **Search Optimization**: The project search is case-insensitive and uses SQL ILIKE for fuzzy matching
4. **Batch Operations**: For multiple files, use separate operations - batch upload is not currently supported
5. **File Formats**: When uploading solutions, PDF and Word documents are most common, but any format is accepted

## Future Enhancements

Potential improvements:
- Batch file upload support
- Project archive/history view
- Advanced filtering for project selection
- Direct email server integration
- Progress indicators for large file uploads
- Project metadata editing
- File preview before download
- Version history for commercial offers
- Automated matching suggestions
- Export project reports
