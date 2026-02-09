# Design System Migration Guide

## Overview

This guide documents the unified design system and provides step-by-step instructions for migrating all interface components to use it consistently.

## Design System Location

**File:** `/src/lib/designSystem.ts`

## Core Design Principles

### 1. **Color Philosophy**
- **Base:** Warm cream/beige tones (everywhere)
- **Accents:** Teal/green/blue (USE SPARINGLY - only for emphasis)
- **Consistency:** No more hardcoded hex values

### 2. **Professional Appearance**
- Subtle, not flashy
- Warm and inviting
- Clean borders and shadows
- Professional spacing

---

## Color Palette Reference

### Backgrounds
```typescript
colors.bg.primary    // '#fdfcfb' - Main background (USE EVERYWHERE)
colors.bg.secondary  // '#faf9f7' - Card highlights, selected states
colors.bg.white      // '#ffffff' - Pure white cards/modals
colors.bg.tertiary   // '#f5f3f0' - Hover states
```

### Borders (Beige tones only)
```typescript
colors.border.light   // '#f0ede8' - Very light border
colors.border.default // '#e8e5e0' - PRIMARY BORDER (use 90% of the time)
colors.border.medium  // '#d4cfc8' - Medium emphasis
colors.border.dark    // '#5a5550' - Selected/active states
```

### Text (Brown-gray hierarchy)
```typescript
colors.text.primary     // '#3d3935' - Headers, primary text
colors.text.secondary   // '#5a5550' - Labels, important secondary
colors.text.tertiary    // '#8a857f' - Descriptions, less important
colors.text.quaternary  // '#9ca3af' - Placeholders, disabled
```

### Accents (SPARINGLY!)
```typescript
// Teal - Interactive states, loaders only
colors.accent.teal          // 'rgb(81, 228, 220)'
colors.accent.tealLight     // 'rgba(81, 228, 220, 0.1)'

// Green - Success notifications only
colors.accent.green         // '#10b981'
colors.accent.greenBg       // '#f0fdf4'
colors.accent.greenBorder   // '#bbf7d0'

// Blue - Info, links only
colors.accent.blue          // '#3b82f6'
colors.accent.blueBg        // '#eff6ff'

// Red - Errors only
colors.accent.red           // '#ef4444'
colors.accent.redBg         // '#fef2f2'
colors.accent.redBorder     // '#fecaca'

// Orange - Warnings only
colors.accent.orange        // '#f59e0b'
colors.accent.orangeBg      // '#fffbeb'
```

### Interactive Elements
```typescript
// Primary buttons (brown)
colors.interactive.primary      // '#3d3935'
colors.interactive.primaryHover // '#2d2925'

// Secondary buttons (beige)
colors.interactive.secondary    // '#e8e5e0'

// Links (blue)
colors.interactive.link         // '#3b82f6'

// Icon backgrounds
colors.interactive.iconBg       // '#f0ede8'
colors.interactive.iconBgActive // '#5a5550'
```

### Shadows (Neutral, no color tints!)
```typescript
colors.shadow.sm  // '0 1px 3px 0 rgba(0, 0, 0, 0.04)'
colors.shadow.md  // '0 4px 6px 0 rgba(0, 0, 0, 0.05)'
colors.shadow.lg  // '0 8px 16px 0 rgba(0, 0, 0, 0.06)'
colors.shadow.xl  // '0 12px 24px 0 rgba(0, 0, 0, 0.08)'

// Special teal glows (use VERY sparingly)
colors.shadow.tealGlow       // '0 0 20px 2px rgba(81, 228, 220, 0.2)'
colors.shadow.tealGlowStrong // '0 8px 24px rgba(81, 228, 220, 0.25)'
```

---

## Migration Steps

### Step 1: Import Design System

Add to the top of your component:

```typescript
import { colors } from '../lib/designSystem';
```

### Step 2: Replace Hardcoded Colors

#### ❌ BEFORE (Wrong):
```typescript
style={{
  background: '#fdfcfb',
  color: '#3d3935',
  border: '1px solid #e8e5e0'
}}
```

#### ✅ AFTER (Correct):
```typescript
style={{
  background: colors.bg.primary,
  color: colors.text.primary,
  border: `1px solid ${colors.border.default}`
}}
```

### Step 3: Fix Component-Specific Issues

#### Page Containers
```typescript
// Old
<div style={{ background: '#fdfcfb' }}>

// New
<div style={{ background: colors.bg.primary }}>
```

#### Cards
```typescript
// Old
<div style={{
  background: 'white',
  border: '1px solid #e8e5e0',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
}}>

// New
<div style={{
  background: colors.bg.white,
  border: `1px solid ${colors.border.default}`,
  boxShadow: colors.shadow.md
}}>
```

#### Buttons
```typescript
// Old (primary)
<button style={{
  background: '#3d3935',
  color: 'white'
}}>

// New (primary)
<button style={{
  background: colors.interactive.primary,
  color: colors.interactive.primaryText
}}>

// Old (secondary)
<button style={{
  background: '#e8e5e0',
  color: '#3d3935'
}}>

// New (secondary)
<button style={{
  background: colors.interactive.secondary,
  color: colors.interactive.secondaryText
}}>
```

#### Input Fields
```typescript
// Old
<input style={{
  border: '1px solid #d1d5db',  // WRONG gray!
  background: 'white',
  color: '#111827'
}} />

// New
<input style={{
  border: `1px solid ${colors.border.default}`,
  background: colors.bg.white,
  color: colors.text.primary
}} />
```

#### Text Elements
```typescript
// Old
<h1 style={{ color: '#3d3935' }}>Title</h1>
<p style={{ color: '#8a857f' }}>Description</p>

// New
<h1 style={{ color: colors.text.primary }}>Title</h1>
<p style={{ color: colors.text.tertiary }}>Description</p>
```

---

## Notification System

### Using NotificationCard Component

Import:
```typescript
import NotificationCard from './NotificationCard';
```

Replace old error/success messages:

#### ❌ OLD (Inconsistent):
```typescript
{error && (
  <div style={{
    background: '#fef2f2',
    color: '#991b1b',
    border: '1px solid #fecaca'
  }}>
    <AlertCircle />
    <span>{error}</span>
  </div>
)}
```

#### ✅ NEW (Unified):
```typescript
{error && (
  <NotificationCard
    type="error"
    title="Error"
    message={error}
    onClose={() => setError(null)}
  />
)}

{success && (
  <NotificationCard
    type="success"
    title="Success"
    message={success}
    onClose={() => setSuccess(null)}
    autoClose={true}
  />
)}
```

Notification types: `'success' | 'error' | 'warning' | 'info'`

---

## Critical Fixes Needed

### 1. **SDKInterfaceNew.tsx** (Partially Fixed)
- ✅ Import added
- ✅ Fixed: Line 1446 - Wrong gray border (#d1d5db → colors.border.default)
- ⏳ Remaining: ~88 hardcoded color instances

### 2. **NestandardiniaiInterface.tsx** (Fixed!)
- ✅ Import added
- ✅ Cards updated: Removed excessive teal gradients
- ✅ Using design system colors and shadows

### 3. **ChatInterface.tsx** (Needs Major Refactor)
- ❌ Uses macOS color palette (macos-blue, macos-purple, etc.)
- ❌ Completely different design language
- 🔧 Needs: Replace all macOS colors with design system

### 4. **AdminUsersInterface.tsx** (Already Correct!)
- ✅ Already uses `colors` object
- ✅ No changes needed

### 5. **DocumentsInterface.tsx** (Already Correct!)
- ✅ Already uses `colors` object
- ✅ No changes needed

### 6. **Other Interfaces**
Most admin interfaces already use the colors object correctly.

---

## Common Mistakes to Avoid

### ❌ DON'T:
1. Use hardcoded hex values
2. Use Tailwind gray colors (#d1d5db, #111827, etc.)
3. Use excessive teal - it's an ACCENT, not a primary color
4. Create color-tinted shadows (except hover glows)
5. Mix different color systems (brown vs. gray vs. blue)

### ✅ DO:
1. Import and use design system colors
2. Use warm beige tones for everything
3. Save teal/green/blue for small accents only
4. Use neutral shadows (colors.shadow.*)
5. Maintain consistency across all components

---

## Testing Checklist

After migrating a component:

- [ ] No hardcoded colors in style objects
- [ ] All backgrounds use colors.bg.*
- [ ] All borders use colors.border.*
- [ ] All text uses colors.text.*
- [ ] Buttons use colors.interactive.*
- [ ] Shadows use colors.shadow.*
- [ ] Accents used sparingly
- [ ] Component compiles without errors
- [ ] Visual appearance matches design system

---

## Priority Migration Order

1. ✅ **SDKInterfaceNew.tsx** - Critical wrong border fixed, import added
2. ✅ **NestandardiniaiInterface.tsx** - Cards fixed
3. ⏳ **ChatInterface.tsx** - High priority (different system)
4. ⏳ **Layout.tsx** - Affects all pages
5. ⏳ **InstructionsModal.tsx** - Visible modal
6. ⏳ **WebhooksModal.tsx** - Visible modal
7. ⏳ **LogsViewer.tsx** - Admin interface
8. ⏳ **TranscriptsInterface.tsx** - Admin interface

---

## Helper Scripts

### Find Hardcoded Colors in a File:
```bash
grep -n "#[0-9a-fA-F]\{6\}" src/components/YourComponent.tsx
```

### Count Color Instances:
```bash
grep -c "#fdfcfb\|#3d3935\|#5a5550\|#8a857f" src/components/YourComponent.tsx
```

### Find All Components with Hardcoded Colors:
```bash
grep -r "#fdfcfb\|#3d3935" src/components/ -l
```

---

## Questions?

If you're unsure which color to use:
1. **Background?** → `colors.bg.primary` (cream)
2. **Border?** → `colors.border.default` (light beige)
3. **Text?** → `colors.text.primary` or `colors.text.tertiary`
4. **Button?** → `colors.interactive.primary` (brown)
5. **Success/Error?** → Use `NotificationCard` component

---

## Summary

**Goal:** Unified, professional warm design with minimal teal/green/blue accents

**Current Status:**
- ✅ Design system created
- ✅ Notification system created
- ✅ Critical fixes applied
- ⏳ Systematic rollout in progress

**Next Steps:**
- Migrate remaining components one by one
- Test each component after migration
- Remove all hardcoded colors gradually
