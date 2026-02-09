# SDK Interface Implementation

## Overview

The SDK interface has been completely redesigned to match the Anthropic Claude interface style with enhanced features including:

- **Conversation Management**: Create, switch between, and delete conversations
- **Extended Thinking**: Claude's internal reasoning is captured and can be viewed
- **Artifact Generation**: Commercial offers are treated as iterative artifacts
- **Diff Viewer**: GitHub-style diff viewer to see changes between versions
- **Dark Theme**: Anthropic's signature dark theme (#1a1a1a background, #f97316 orange accent)
- **Collapsible Sidebar**: Secondary sidebar for project and conversation management

## Features

### 1. Layout Structure

```
┌─────────────────┬──────────────────────────┬──────────────────┐
│  Main Sidebar   │   Secondary Sidebar      │   Main Chat      │
│  (Traidenis)    │   (SDK Conversations)    │   Area           │
│                 │                          │                  │
│  - Chat         │  - Project: Standartinis │  - Messages      │
│  - Documents    │  - Instructions          │  - Input         │
│  - Transcripts  │  - Conversations List    │  - Artifact      │
│  - EML Upload   │                          │    Panel         │
│  - SDK          │                          │                  │
│  - Users        │                          │                  │
└─────────────────┴──────────────────────────┴──────────────────┘
```

### 2. Secondary Sidebar

- **Project Header**: Shows "Standartinis" project with doc icon
- **Collapsible**: Can be hidden to maximize chat space
- **Instructions Section**: View full system prompt with one click
- **Conversations Tab**: List of all conversations with dates
- **New Conversation Button**: Create new conversation threads

### 3. Conversation Management

```typescript
// Conversations are stored in Supabase with structure:
interface SDKConversation {
  id: string;
  project_id: string;
  title: string;
  author_id: string;
  author_email: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_at: string;
  messages: SDKMessage[];
  artifact?: CommercialOfferArtifact;
}
```

### 4. Extended Thinking

The interface uses Claude Sonnet 4's extended thinking feature:

```typescript
thinking: {
  type: 'enabled',
  budget_tokens: 5000
}
```

- Thinking content is captured and stored with each assistant message
- Users can expand a "Show thinking process" section to view Claude's reasoning
- Thinking is excluded from the main message display

### 5. Artifact System

Commercial offers are treated as artifacts that evolve through the conversation:

```typescript
interface CommercialOfferArtifact {
  id: string;
  type: 'commercial_offer';
  title: string;
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
  diff_history: DiffEntry[];
}
```

**Features:**
- Artifact content is extracted from `<commercial_offer>` XML tags
- Each iteration increments the version number
- Diffs are automatically calculated between versions
- Artifacts are displayed in a separate panel

### 6. Diff Viewer

GitHub-style diff viewer showing:
- ✅ **Added lines**: Green background (#1f3a1f), green text (#4ade80)
- ❌ **Removed lines**: Red background (#3d1f1f), red text (#ff6b6b)
- 🔄 **Modified lines**: Shows before (red) and after (green)

Toggle between "Content View" and "Diff View" with a button.

### 7. Dark Theme Colors

Following Anthropic's design system:

- **Background**: `#1a1a1a` (main), `#0f0f0f` (sidebar)
- **Borders**: `#2a2a2a`, `#3a3a3a`
- **Primary Accent**: `#f97316` (orange)
- **Text**:
  - Primary: `#e5e5e5`
  - Secondary: `#9ca3af`
  - Muted: `#6b7280`
- **User Messages**: `#f97316` background
- **Assistant Messages**: `#2a2a2a` background

## Database Setup

### Required Migration

Run the SQL migration file to create the `sdk_conversations` table:

```bash
# In Supabase SQL Editor, run:
cat supabase_migration_sdk_conversations.sql
```

**Table Schema:**
```sql
CREATE TABLE sdk_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL,
  title TEXT NOT NULL,
  author_id UUID NOT NULL,
  author_email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  messages JSONB DEFAULT '[]'::jsonb,
  artifact JSONB DEFAULT NULL
);
```

## API Integration

### Anthropic API Requirements

1. **API Key**: Set in `.env`:
   ```
   VITE_ANTHROPIC_API_KEY=your_anthropic_api_key
   ```

2. **Model**: `claude-sonnet-4-20250514`

3. **Features Used**:
   - Extended thinking (5000 token budget)
   - Prompt caching (ephemeral, 1 hour)
   - Message streaming (for future implementation)

### System Prompt

The system prompt is loaded from the `instruction_variables` table and includes:
- Role and purpose
- Commercial offer structure requirements
- XML tag usage for artifacts: `<commercial_offer>...</commercial_offer>`
- Thinking guidance

## Files Created/Modified

### New Files:
1. `src/lib/sdkConversationService.ts` - Conversation CRUD operations
2. `src/components/SDKInterfaceNew.tsx` - New SDK interface component
3. `supabase_migration_sdk_conversations.sql` - Database migration
4. `SDK_IMPLEMENTATION.md` - This documentation

### Modified Files:
1. `src/App.tsx` - Updated to use SDKInterfaceNew component

## Usage

### Creating a Conversation

1. Click "SDK" tab in main sidebar
2. Click "Naujas pokalbis" button in secondary sidebar
3. Start typing in the message input

### Using Artifacts

When Claude generates a commercial offer, it will:
1. Automatically detect `<commercial_offer>` tags in the response
2. Extract and parse the content
3. Create/update the artifact
4. Show the artifact panel on the right side
5. Calculate diffs if this is an iteration

### Viewing Diffs

1. Artifact panel appears when offer is generated
2. Click "Rodyti pakeitimus" button to switch to diff view
3. See added (green), removed (red), and modified lines
4. Click "Rodyti turinį" to return to content view

### Viewing Thinking

1. In any assistant message with thinking
2. Click "Rodyti mąstymo procesą" to expand
3. See Claude's internal reasoning process

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] Can create new conversations
- [ ] Can switch between conversations
- [ ] Can send messages and receive responses
- [ ] Extended thinking is captured and viewable
- [ ] Commercial offer artifacts are created correctly
- [ ] Diff viewer shows changes accurately
- [ ] Sidebar collapses and expands smoothly
- [ ] Prompt preview modal works
- [ ] Conversations persist after page reload
- [ ] Delete conversation works

## Future Enhancements

1. **Message Streaming**: Real-time response streaming
2. **File Attachments**: Upload documents for context
3. **Artifact Export**: Download commercial offers as PDF/DOCX
4. **Conversation Search**: Search through conversation history
5. **Branching**: Create alternate conversation branches
6. **Collaboration**: Share conversations with team members
7. **Templates**: Pre-defined commercial offer templates
8. **Version Comparison**: Compare any two versions side-by-side

## Troubleshooting

### Conversations not loading
- Check Supabase connection
- Verify `sdk_conversations` table exists
- Check browser console for errors

### Extended thinking not showing
- Verify you're using Claude Sonnet 4 model
- Check API key has access to extended thinking
- Inspect response in network tab

### Artifacts not generating
- Ensure system prompt includes `<commercial_offer>` tag instruction
- Check that response contains the tags
- Verify artifact extraction regex

### Diff not calculating correctly
- Check that previous artifact version exists
- Verify content format is consistent
- Test with simple text changes first

## Support

For issues or questions, check:
1. Browser console for errors
2. Supabase logs for database issues
3. Network tab for API call failures
4. This documentation for setup steps
