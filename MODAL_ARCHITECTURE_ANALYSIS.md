# Modal & Popup Architecture Analysis

## Problem Statement

After implementing React Router navigation with actual URL changes, several components are showing blank screens:
- Documents tab (now fixed with placeholder)
- Webhooks popup
- Users tab
- Instrukcijos tab when pressing 'Redaguoti'
- Settings popup

## Architecture Overview

### Component Hierarchy

```
App.tsx
└── BrowserRouter
    └── AppContent
        └── Layout
            ├── Sidebar
            ├── SettingsModal (z-50, fixed positioning)
            ├── WebhooksModal (z-50, fixed positioning)
            └── Main Content Area
                └── Routes (children)
                    ├── /sdk → SDKInterface
                    ├── /documents → DocumentsInterface
                    ├── /users → AdminUsersInterface
                    ├── /instrukcijos → InstructionsInterface
                    └── /nestandartiniai → NestandardiniaiInterface
```

### Modal Rendering Location

Modals are rendered in `Layout.tsx` BEFORE the main content area:

```tsx
// Layout.tsx line 439-451
{/* Settings Modal */}
<SettingsModal
  isOpen={settingsOpen}
  onClose={() => setSettingsOpen(false)}
  user={user}
/>

{/* Webhooks Modal */}
<WebhooksModal
  isOpen={webhooksOpen}
  onClose={() => setWebhooksOpen(false)}
  user={user}
/>

{/* Main content */}
<div className="flex-1 flex flex-col min-w-0">
  <div className="flex-1 overflow-hidden">
    {children} {/* Routes render here */}
  </div>
</div>
```

## Potential Issues Identified

### 1. Z-Index Conflicts

Multiple components use `z-50`:
- SettingsModal: `z-50`
- WebhooksModal: `z-50`
- LogsViewer: `z-50`
- InstructionsModal: `z-50`
- SDKInterfaceNew: Multiple elements with `z-50`

**Issue**: When elements have the same z-index, DOM order determines stacking. Since modals are rendered BEFORE `{children}`, any z-50 elements in route components will appear on top of modals.

**Solution**: Modals should use higher z-index (e.g., `z-[100]` or `z-[9999]`).

### 2. DOM Order vs. Fixed Positioning

Current structure:
```tsx
<div>
  <SettingsModal /> <!-- Rendered first -->
  <WebhooksModal /> <!-- Rendered second -->
  <div>{children}</div> <!-- Rendered last -->
</div>
```

Even though modals use `position: fixed`, if route components contain fixed elements with same/higher z-index, they will layer on top.

### 3. Modal State Management

Modal state (`settingsOpen`, `webhooksOpen`) is managed in Layout component. When routes change:
- Layout persists (doesn't unmount)
- Modal state should persist
- BUT: If modals are being hidden by overlaying content, it appears as blank screen

### 4. Missing Portal Usage

Modals are NOT using React Portals. They're rendered in-line within Layout's DOM structure. Best practice for modals is to use portals to render at document root level.

### 5. Route Component Errors

If a route component throws an error during render, React may show blank screen. Need to check:
- AdminUsersInterface
- DocumentsInterface
- InstructionsInterface
- WebhooksModal
- SettingsModal

## Investigation Steps

### Step 1: Check for Component Errors

Run app and check browser console for:
- React errors
- TypeScript errors
- Missing dependencies
- API call failures

### Step 2: Verify Modal Visibility

When modal is "open", check:
- Is modal DOM present? (use React DevTools)
- What is modal's computed z-index?
- Are there overlaying elements?

### Step 3: Check Z-Index Stack

Examine all elements with high z-index:
```bash
grep -r "z-50\|z-\[" src/components/
```

Result shows 17+ components using z-50 or higher.

### Step 4: Portal Implementation

Modals should be refactored to use React Portals:

```tsx
// Example fix for SettingsModal
import { createPortal } from 'react-dom';

export default function SettingsModal({ isOpen, onClose, user }) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] ...">
      {/* Modal content */}
    </div>,
    document.body
  );
}
```

## Recommended Fixes

### Priority 1: Increase Modal Z-Index

Change all modals to use `z-[9999]` instead of `z-50`:
- SettingsModal.tsx
- WebhooksModal.tsx
- LogsViewer.tsx
- InstructionsModal.tsx

### Priority 2: Implement React Portals

Render modals at document.body level using createPortal.

### Priority 3: Add Error Boundaries

Wrap route components in error boundaries to catch and display errors instead of blank screens.

### Priority 4: Review Component Dependencies

Ensure all route components:
- Don't import removed Voiceflow code
- Have proper type definitions
- Handle loading/error states

## Testing Plan

1. Open app, navigate to /users → Check if AdminUsersInterface renders
2. Click Settings button → Check if modal appears on top
3. Click Webhooks button → Check if modal appears on top
4. Navigate to /instrukcijos → Click "Redaguoti" → Check if password input appears
5. Check browser console for any errors

## Notes

- Layout.tsx has unused state: `editingThreadId`, `editingTitle`, references to `Thread` type
- These should be removed as thread management was removed
- Some imports like `History` icon are no longer used after removing Transcripts tab
