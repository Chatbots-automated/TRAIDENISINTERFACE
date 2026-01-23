# Design System Migration - Phase 1 Complete

## Overview
This document tracks the migration to a unified Claude Anthropic-inspired design system across the interface.

## Design System Created ✅

**File:** `src/lib/designSystem.ts`

### Color Palette
- **Backgrounds:**
  - Primary: `#fdfcfb` (very light cream)
  - Secondary: `#faf9f7` (light beige)
  - White: `#ffffff`

- **Borders:**
  - Light: `#f0ede8`
  - Default: `#e8e5e0`
  - Active: `#5a5550`

- **Text:**
  - Primary: `#3d3935` (dark brown)
  - Secondary: `#5a5550` (medium brown)
  - Tertiary: `#8a857f` (light brown)

- **Green Accent:** `#556b50` (muted forest green)
  - Used for primary actions and interactive elements
  - Harmonizes with brown/beige palette

### Component Styles
- Cards with hover states
- Buttons (primary, secondary, tertiary)
- Inputs
- Info boxes

## Phase 1: Modals ✅ (Partial)

### ✅ SettingsModal - COMPLETE
- Removed macOS-style window control buttons (red/yellow/green dots)
- Added click-outside-to-close functionality
- Applied new color scheme throughout
- Green accent used for admin role indicator
- Updated spacing, borders, typography

### ⏳ WebhooksModal - TODO
- Remove macOS buttons (if any)
- Add click-outside-to-close
- Apply new design system colors
- Update buttons to use green accent for test/save actions

### ⏳ InstructionsModal - TODO
- Remove macOS buttons (if any)
- Add click-outside-to-close
- Apply new design system colors

## Phase 2: Interfaces - TODO

### DocumentsInterface
- Update page background to `#fdfcfb`
- Apply card styling from design system
- Use green accent for primary upload/action buttons
- Update text colors throughout

### AdminUsersInterface
- Apply new color scheme
- Use green accent for "Add User" button
- Update card/table styling

### TranscriptsInterface
- Apply new background and text colors
- Update any buttons to match design system
- Use green accent for filters or primary actions

### InstructionsInterface
- Apply design system colors
- Update cards and buttons
- Green accent for save/edit actions

## Phase 3: Login/Auth - TODO

### AuthForm
- Check for and remove macOS-style buttons
- Apply design system (but keep existing layout)
- Subtle updates only - don't break functionality

## Implementation Notes

### Green Accent Usage
The green accent (#556b50) should be used for:
- Primary action buttons (Save, Submit, Upload, etc.)
- Active/selected states for important toggles
- Hover states on interactive elements
- Status indicators for success/admin roles

### Click-Outside-to-Close Pattern
```typescript
<div onClick={onClose} className="backdrop...">
  <div onClick={(e) => e.stopPropagation()} className="modal-content...">
    {/* Modal content */}
  </div>
</div>
```

### Removing macOS Buttons
Look for and remove:
```tsx
{/* Remove this */}
<div className="macos-window-controls">
  <button className="macos-dot macos-dot-close" />
  <div className="macos-dot macos-dot-minimize" />
  <div className="macos-dot macos-dot-maximize" />
</div>
```

Replace with simple X button in header.

## Progress Tracking

- [x] Create design system file
- [x] Update SettingsModal
- [ ] Update WebhooksModal
- [ ] Update InstructionsModal
- [ ] Update DocumentsInterface
- [ ] Update AdminUsersInterface
- [ ] Update TranscriptsInterface
- [ ] Update InstructionsInterface
- [ ] Remove macOS buttons from AuthForm (if present)
- [ ] Create pull request to main

## Testing Checklist

After each component update:
- [ ] Colors match design system
- [ ] Green accent appears on primary actions
- [ ] Click-outside-to-close works
- [ ] No macOS-style window buttons
- [ ] Typography is consistent
- [ ] Hover states work correctly
- [ ] No console errors

## Next Steps

1. Complete remaining modal updates (WebhooksModal, InstructionsModal)
2. Update all interface components
3. Test thoroughly across all tabs
4. Create pull request with comprehensive description
5. Merge to main branch

## Notes

- Chat interface deliberately excluded from updates (as requested)
- Existing functionality preserved - only visual/UX updates
- Design system file can be imported: `import { colors } from '../lib/designSystem'`
