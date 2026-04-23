# SDK Prompt/Data-Flow Investigation (2026-04-23)

## Scope Reviewed
- `src/components/SDKInterfaceNew.tsx`
- `src/lib/instructionVariablesService.ts`
- `src/lib/instructionsService.ts`
- `src/lib/directus.ts`

## Executive Summary
The SDK page currently violates single-source-of-truth behavior for prompt data due to **three separate data-flow breaks**:

1. **Prompt data is loaded only once on initial mount** in the SDK page and then reused for all later chat requests and modal views.
2. **Template lookup is nondeterministic when duplicates exist** because `variable_key='template'` is queried with `.single()` and no explicit ordering.
3. **Silent button-triggered chat path appends raw template again** (`systemPrompt + promptTemplate`), creating a second prompt source and possible stale/deprecated placeholders.

Together these explain why Directus can show updated values while SDK chat and the SDK “instrukcijos” modal still display/send outdated content.

---

## Detailed Findings

### 1) SDK page captures a snapshot of prompt/template at mount-time only
`loadSystemPrompt()` is called only in a `useEffect(..., [])` on component mount and not refreshed when opening the modal or before send.

- `useEffect(() => { loadSystemPrompt(); ... }, [])` in `SDKInterfaceNew.tsx`.
- `handleSend` blocks until `systemPrompt` exists but uses stored state thereafter.
- Prompt modal renders state (`systemPrompt`, `templateFromDB`, `promptTemplate`) rather than refetching.

**Impact:** If instruction variables/template are changed in Directus after SDK page load, the SDK page can continue showing/sending old prompt content until full page reload.

### 2) Competing template sources + legacy fallback are still active
`getPromptTemplate()` has a 3-level fallback chain:
1. `instruction_variables` (`variable_key='template'`)
2. `prompt_template` (legacy table)
3. hardcoded `getDefaultPromptTemplate()`.

This keeps old systems alive and can silently switch source if the first query is not resolved as expected.

**Impact:** Even with new Directus template variables configured, SDK may still consume old structure/placeholders from legacy fallback sources.

### 3) `template` fetch uses `.single()` without deterministic ordering
Both `getPromptTemplate()` and SDK-local `fetchTemplateVariable()` query:
- `instruction_variables`
- `.eq('variable_key', 'template')`
- `.single()`

The custom Directus client implements `.single()` as `limit=1` and returns first row without enforcing uniqueness or order.

**Impact:** If duplicate `template` rows exist (manual edits/import drift), returned row can be arbitrary/stale, producing apparent desync.

### 4) Silent button flow sends a different system prompt than normal send
In button-trigger path, SDK builds:
- `contextualSystemPrompt = systemPrompt + '\n\n' + promptTemplate`

But `systemPrompt` is already fully injected output from `getSystemPrompt()` (template + variables). This appends another template copy and may include unresolved/deprecated placeholders.

**Impact:** Different user actions can send different prompt payloads, violating single source of truth and increasing mismatch risk.

### 5) Modal and chat are not guaranteed to represent same freshness window
The modal displays `systemPrompt`/template state from earlier load. Chat requests also use stored `systemPrompt` state. Both are stale together after updates, but may diverge across paths (normal send vs silent button send).

**Impact:** Users observe “saved in Directus but SDK still old” behavior.

---

## What Prompt Is SDK Actually Sending?

### Normal message send (`handleSend`)
- Uses in-memory `systemPrompt` state.
- `systemPrompt` was built by `getSystemPrompt()` at initial page load.
- Therefore prompt equals **snapshot-at-mount** final injected prompt.

### Silent button-trigger send
- Uses `systemPrompt + promptTemplate` (double composition).
- Can include stale/unresolved template fragments on top of the snapshot.

---

## Root Cause Statement
The mismatch is caused by **state snapshotting + multi-source fallback + nondeterministic template row selection + divergent send paths**. This breaks the expected “Directus runtime single source of truth” model.

---

## Recommended Fix Direction (high priority)
1. Refresh prompt/template from Directus immediately before each outbound SDK chat request (or invalidate with short TTL cache).
2. Remove legacy fallback (`prompt_template` + hardcoded template) from SDK runtime path, or gate it behind explicit migration flag.
3. Enforce uniqueness of `instruction_variables.variable_key` at DB level; clean duplicates and add deterministic ordering as safety.
4. Unify system prompt assembly so all send paths use one builder output (never append `promptTemplate` separately).
5. On opening SDK “instrukcijos” modal, refetch current prompt/template from Directus.

