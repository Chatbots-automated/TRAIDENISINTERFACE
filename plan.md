# Plan: Live Document Preview Feature

## Overview

Add a split-pane document preview to the artifact panel that shows a live, formatted preview of the commercial offer document as variables are filled in by the chat and user.

## Current Architecture

- Chat (Claude) generates YAML variables → stored as artifact in `sdk_conversations.artifact`
- User fills offer parameters + selects team in the artifact panel
- "Generuoti" button sends everything to n8n webhook → n8n creates a Google Doc from a template → returns URL
- User opens the finished Google Doc externally (no preview before sending)

**The gap:** Users can't see what the final document will look like until after it's generated and opened in Google Docs.

---

## Proposed Approach: HTML Template Preview (Client-Side)

### Why this approach

| Approach | Pros | Cons |
|----------|------|------|
| **A: HTML template (recommended)** | Real-time, no network calls, instant feedback | Need to keep HTML template in sync with Google Docs template |
| B: n8n preview endpoint | Exact match to final output | Slow (network round-trip per change), needs n8n changes |
| C: PDF.js viewer | Renders actual PDF | Still needs server-side PDF generation, heavy library (~2MB) |

**Recommendation: Approach A** — Store an HTML template that mirrors the Google Docs template structure. Replace `{{variable}}` placeholders with live values as user/chat fills them in. This gives instant visual feedback. The actual final document is still generated through n8n for accuracy.

---

## Implementation Plan

### Step 1: Create the Document Template Service

**New file:** `src/lib/documentTemplateService.ts`

- Store a default HTML template string that mirrors the commercial offer Google Docs layout
- The template uses `{{variable_key}}` placeholders (matching the YAML keys)
- Function: `renderTemplate(template, variables) → HTML string`
- Function: `getDefaultTemplate() → string` (hardcoded initial template)
- Later: Allow admins to edit the template via a settings modal and store in `instruction_variables` table with key `document_template`

Template example:
```html
<div class="document">
  <h1>KOMERCINIS PASIŪLYMAS</h1>
  <p>{{object_sentence}}</p>
  <h2>EKONOMINIS KOMPLEKTAS</h2>
  <p>{{economy_HNV}}</p>
  <p>Kaina be PVM: {{economy_priceNoPVM}}</p>
  <p>PVM (21%): {{economy_PVM}}</p>
  <p><strong>Viso su PVM: {{economy_totalWithPVM}}</strong></p>
  ...
</div>
```

### Step 2: Create the DocumentPreview Component

**New file:** `src/components/DocumentPreview.tsx`

- Receives: `templateHtml`, `variables` (merged YAML + offer params + team)
- Renders the template with variables substituted, inside a styled container
- Uses CSS that mimics an A4 page look (white background, page margins, professional typography)
- Unfilled variables shown as highlighted placeholders: `[variable_name]`
- Scrollable, zoomable preview area

### Step 3: Add Preview Tab to Artifact Panel

**Modify:** `src/components/SDKInterfaceNew.tsx`

The artifact panel header gets two tabs:

```
┌────────────────────────────────────────────────┐
│ Komercinis pasiūlymas    [Duomenys] [Peržiūra] │
│                          ~~~~~~~~   ~~~~~~~~~   │
│                          (current)  (new tab)   │
```

- **"Duomenys" tab** (Data) — the current view with collapsible sections (YAML variables, object params, team)
- **"Peržiūra" tab** (Preview) — the new DocumentPreview component showing the live rendered document

New state: `const [artifactTab, setArtifactTab] = useState<'data' | 'preview'>('data');`

When "Peržiūra" is active:
1. Merge all variable sources: YAML artifact content + offerParameters + team info
2. Pass to `renderTemplate()`
3. Display the rendered HTML in the DocumentPreview component

### Step 4: Template Variable Merging

Create a merge function that combines all data sources:

```typescript
const mergeAllVariables = (): Record<string, string> => {
  const yamlVars = currentConversation?.artifact
    ? parseYAMLContent(currentConversation.artifact.content)
    : {};

  return {
    ...yamlVars,                    // economy_HNV_price, midi_SIR, etc.
    ...offerParameters,              // object_sentence, BDS values, etc.
    ekonomistas: selectedEconomist?.full_name || '',
    vadybininkas: selectedManager?.full_name || '',
    technologas: user.full_name || user.email,
    project_name: currentConversation?.title || '',
  };
};
```

### Step 5: (Optional future) Admin Template Editor

**Later enhancement:** Add a template editor in the admin settings where the HTML template can be customized. Store in `instruction_variables` table with `variable_key = 'document_template'`. This allows the template to be updated without code changes.

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/lib/documentTemplateService.ts` | **New** | Template storage, rendering, variable substitution |
| `src/components/DocumentPreview.tsx` | **New** | A4-styled document preview component |
| `src/components/SDKInterfaceNew.tsx` | **Modify** | Add tabs to artifact panel header, toggle between data/preview views |

## Dependencies

- No new npm packages needed — pure HTML/CSS rendering
- The HTML template needs to be authored once to match the Google Docs template structure

## Risks & Considerations

1. **Template sync:** The HTML preview template may drift from the actual Google Docs template used by n8n. Mitigation: keep the HTML template simple and focused on content layout, not pixel-perfect matching. Add a disclaimer: "Peržiūra yra apytikslė. Galutinis dokumentas gali šiek tiek skirtis."
2. **Template authoring:** Someone needs to create the initial HTML template matching the current Google Docs structure. This is a one-time effort.
3. **Variable coverage:** The template must use the same `{{variable_key}}` names as the YAML artifact and offer parameters. The `mergeAllVariables` function handles this mapping.
