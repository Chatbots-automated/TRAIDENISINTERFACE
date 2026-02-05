# Implementation Plan: User Data & Webhook Integration

## Architecture Decision

**Problem**: Multiple features need access to user data (Users page, artifact panel, webhooks, economist selection)

**Solution**: Create a shared user service that loads data once and is reused everywhere

### Benefits:
- Single source of truth for user data
- No duplicate database calls
- Consistent data across components
- Easy to maintain and test
- Prevents prop drilling

## Phase 1: Fix Foundation (Users Page & Data Service)

### 1.1 Update Database Query
**File**: `src/lib/supabase.ts`
- Update `getAllUsers()` to select all fields: id, email, display_name, is_admin, created_at, phone, kodas, full_name, role
- Ensures we have complete user data

### 1.2 Update TypeScript Interface
**File**: `src/components/AdminUsersInterface.tsx`
- Update `UserData` interface to include: phone, kodas, full_name, role
- Matches actual database schema

### 1.3 Enhance UI
**File**: `src/components/AdminUsersInterface.tsx`
- Keep current card view for basic info (display_name/email, admin badge)
- Add expandable detail view (click card icon)
- Show in details: role, kodas, phone, full_name, email
- Fix blank page issue (likely missing render condition)

### 1.4 Create User Service
**File**: `src/lib/userService.ts` (NEW)
```typescript
export interface AppUserData {
  id: string;
  email: string;
  display_name?: string;
  is_admin: boolean;
  created_at: string;
  phone?: string;
  kodas?: string;
  full_name?: string;
  role?: string;
}

export const getAllUsersData = async (): Promise<AppUserData[]>
export const getEconomists = async (): Promise<AppUserData[]>
export const getCurrentUserData = (userId: string, users: AppUserData[]): AppUserData | null
```

## Phase 2: Silent Button Execution

### 2.1 Change Button Click Behavior
**File**: `src/components/SDKInterfaceNew.tsx`
- Remove input value setting
- Send button value directly to API
- Mark button as "selected" (change style to outline)
- Don't display user's choice in chat UI

### 2.2 Button Visual Feedback
- Selected button: `background: transparent, border: 2px solid {color}`
- Unselected: `background: {color}, border: none`

## Phase 3: Artifact Streaming

### 3.1 Detect Tags During Streaming
**File**: `src/components/SDKInterfaceNew.tsx`
- Monitor streaming content for `<commercial_offer`
- When detected: set flag `isStreamingArtifact = true`
- Show artifact panel immediately

### 3.2 Content Routing
- If `isStreamingArtifact`:
  - Extract YAML content between tags
  - Stream to artifact panel (not chat)
  - Hide from chat messages
- After `</commercial_offer>` detected:
  - Stop artifact streaming
  - Resume normal chat display

### 3.3 State Management
```typescript
const [isStreamingArtifact, setIsStreamingArtifact] = useState(false);
const [artifactStreamContent, setArtifactStreamContent] = useState('');
```

## Phase 4: Webhook Integration

### 4.1 Add Economist Selection to Artifact Panel
**File**: `src/components/SDKInterfaceNew.tsx`
- Add user icon button next to Send button
- Dropdown shows economists (role = 'ekonomistas')
- User can select one
- Selection stored in state

### 4.2 Webhook Payload Construction
**Trigger**: Click "Send Offer" button in artifact panel

**Payload**:
```json
{
  "yaml_content": "...",
  "technologist": "full_name",
  "technologist_code": "kodas",
  "technologist_phone": "phone",
  "technologist_email": "email",
  "ekonomistas": "selected_economist_kodas"
}
```

### 4.3 Webhook Execution
1. POST to `https://n8n.traidenis.org/webhook/a80582f0-d42b-4490-b142-0494f0afff89`
2. Log to Supabase `webhooks` table
3. Display in Webhooks tab under appropriate category

### 4.4 Fix Duplicate Button Issue
- Investigate artifact panel rendering
- Ensure only one button rendered

## Phase 5: Data Flow Architecture

```
App.tsx
  ↓
Load Users (once) → userService.getAllUsersData()
  ↓
Pass to components as props OR use Context
  ↓
├─ AdminUsersInterface (display)
├─ SDKInterfaceNew (technologist data for webhook)
└─ Artifact Panel (economist selection dropdown)
```

## Implementation Order

1. ✓ Fix Users page blank issue
2. ✓ Update user data schema & service
3. ✓ Enhance Users page UI with details view
4. ✓ Implement silent button execution
5. ✓ Implement artifact streaming
6. ✓ Add economist selection to artifact
7. ✓ Implement webhook integration
8. ✓ Fix duplicate button
9. ✓ Test complete flow

## Testing Checklist

- [ ] Users page loads and displays all users
- [ ] Expandable details show all fields correctly
- [ ] Button click sends silent API request
- [ ] Selected button shows outline style
- [ ] Artifact panel appears when <commercial_offer> detected
- [ ] YAML streams to artifact panel, not chat
- [ ] Economist dropdown shows only ekonomistas role
- [ ] Webhook sends with complete payload
- [ ] Webhook logged to database
- [ ] Webhook appears in Webhooks tab
- [ ] No duplicate buttons in artifact panel
