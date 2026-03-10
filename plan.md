# SDK Citations Implementation Plan

## Overview
Add reasoning-based citations to the SDK page so that every LLM-generated variable in the HTML document preview links back to the AI's thinking/reasoning that produced it.

## Architecture

```
Claude generates <commercial_offer> YAML + thinking/reasoning
         ↓
handleArtifactGeneration() detects which variables changed (old vs new YAML)
         ↓
Creates citation entry per changed variable: {message_index, thinking_excerpt, timestamp, version}
         ↓
Stored in artifact.variable_citations (persisted in Directus DB)
         ↓
renderTemplate() adds citation badges next to cited filled variables
         ↓
DocumentPreview handles citation badge clicks → emits onCitationClick
         ↓
SDKInterfaceNew shows CitationPopover with reasoning + "Jump to message" button
```

## Implementation Steps

### Step 1: Data Model (`src/lib/sdkConversationService.ts`)
- Add `VariableCitation` interface:
  ```typescript
  export interface VariableCitation {
    variable_key: string;
    message_index: number;        // index in conversation.messages
    thinking_excerpt: string;     // AI's reasoning/thinking content
    chat_excerpt: string;         // visible chat text from that message (secondary)
    timestamp: string;
    version_introduced: number;
    version_last_modified: number;
  }
  ```
- Add `variable_citations?: Record<string, VariableCitation>` to `CommercialOfferArtifact`

### Step 2: Citation Capture (`src/components/SDKInterfaceNew.tsx`)
- Modify `handleArtifactGeneration()` signature to accept `thinkingContent: string`, `chatText: string`, and `messageIndex: number`
- After determining which variables changed (compare old vs new YAML via `parseYAMLContent`):
  - For NEW artifact: all variables get citations
  - For UPDATED artifact: only changed/added variables get new citations, unchanged ones keep existing
- Build `variable_citations` map with the thinking content and chat text from the current message
- Store citations in the artifact object alongside existing fields
- Update the call site at line ~1317 to pass `thinkingContent`, `chatText`, and message index

### Step 3: Template Rendering (`src/lib/documentTemplateService.ts`)
- Modify `renderTemplate()` to accept optional `citations?: Record<string, VariableCitation>` parameter
- For filled variables that have a citation, append a small citation badge:
  ```html
  <span data-var="key" class="template-var filled">value</span><sup data-citation="key" class="citation-badge">AI</sup>
  ```
- Badge styled as a small, subtle superscript indicator (accent color, cursor pointer)
- No badge for non-cited variables (offer params, team, auto-computed)

### Step 4: Document Preview (`src/components/DocumentPreview.tsx`)
- Add `citations?: Record<string, VariableCitation>` prop
- Add `onCitationClick?: (citation: VariableCitation, position: {x: number, y: number}) => void` prop
- Pass citations through to `renderTemplate()` call
- In `handleIframeLoad`, attach click handlers to `[data-citation]` elements
- On citation badge click: emit `onCitationClick` with the full citation data + position info
- Add CSS for citation badges inside the iframe srcdoc styles

### Step 5: Citation Popover UI (`src/components/SDKInterfaceNew.tsx`)
- Add state: `activeCitation: {citation: VariableCitation, x: number, y: number} | null`
- Render a floating popover (similar to existing variable edit popup) showing:
  - Variable name and current value
  - "AI Reasoning" section with the thinking excerpt (scrollable, max ~200px height)
  - "Chat context" collapsible section with visible chat text excerpt
  - Version badge: "v{version_introduced}" or "Updated in v{version_last_modified}"
  - Timestamp
  - "Jump to message" button
- Popover positioned relative to the clicked badge in the preview

### Step 6: Jump to Message
- "Jump to message" scrolls the chat panel to the referenced message
- Use message index to find the DOM element and scroll into view
- Briefly highlight the target message with a flash animation (CSS transition)

### Step 7: CSS & Styling
- Citation badge styles in DocumentPreview iframe CSS:
  - Small "AI" superscript, accent color (#c7a88a), subtle
  - Hover: slightly more visible
  - Print: hidden (don't print citation badges)
- Citation popover styles matching existing design system

## Files Modified
1. `src/lib/sdkConversationService.ts` — VariableCitation interface, updated CommercialOfferArtifact
2. `src/lib/documentTemplateService.ts` — renderTemplate accepts citations, adds badges
3. `src/components/DocumentPreview.tsx` — citations prop, click handlers for badges
4. `src/components/SDKInterfaceNew.tsx` — citation capture in handleArtifactGeneration, popover UI, jump-to-message

## No New Files
All changes go into existing files. No new component files needed — the popover is inline in SDKInterfaceNew.tsx (consistent with existing variable edit popup pattern).

## Edge Cases
- First artifact creation: all variables get citations from that single message
- Artifact update: only changed/added variables get new citations, unchanged ones keep existing
- Manual variable edit (via popup): citation cleared for that variable (it's now user-edited)
- Version revert: citations from the reverted-to version are restored
- No thinking content: fallback to chat text excerpt only
- Empty thinking: show "Nėra AI samprotavimo" in popover

## Database Impact
- No schema changes needed — `variable_citations` is stored inside the existing `artifact` JSON column in `sdk_conversations` table
- Backward compatible — old artifacts without `variable_citations` simply show no citation badges
