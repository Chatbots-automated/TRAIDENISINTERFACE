# Tool Integration Analysis & Fixes

## Problem Statement

The Anthropic API was rejecting messages with error:
```
messages.5: `tool_use` ids were found without `tool_result` blocks immediately after
```

Even though our validation showed all tool_use IDs had matching tool_result IDs.

## Root Cause Analysis

### What We Found

1. **Insufficient Validation**:   - Previous validation only checked if tool_use IDs existed SOMEWHERE in tool_result IDs
   - Did NOT validate the STRUCTURAL requirement: tool_use must be in message N, tool_result must be in message N+1
   - Anthropic API requires strict adjacency

2. **Potential Message Construction Issues**:
   - Messages are built recursively during tool execution
   - Each recursive call spreads previous messages and adds new tool_use + tool_result pair
   - If any message in the chain is malformed, it propagates

3. **Lack of Visibility**:
   - No logging of actual JSON being sent to API
   - Validation happened but didn't catch structural issues

## Implemented Fixes

### 1. Structural Validation (SDKInterfaceNew.tsx:242-283)

**Before**:
```typescript
// Only checked if IDs matched SOMEWHERE
const missingToolResults = toolUseIds.filter(id => !toolResultIds.includes(id));
```

**After**:
```typescript
// Check ADJACENCY: if message N has tool_use, message N+1 MUST have tool_result
for (let i = 0; i < messages.length; i++) {
  const msg = messages[i];
  if (hasToolUse && msg.role === 'assistant') {
    // Verify next message is user with matching tool_results
    const nextMsg = messages[i + 1];
    // Validate role, content type, and ID matching
  }
}
```

**What it catches**:
- tool_use without following message
- tool_use followed by wrong role
- tool_use followed by non-array content
- tool_use IDs not present in next message's tool_results

### 2. Detailed API Logging (SDKInterfaceNew.tsx:290-293)

```typescript
console.log('[API CALL] Sending to Anthropic API:');
console.log('[API CALL] Total messages:', messages.length);
console.log('[API CALL] Serialized messages:', JSON.stringify(messages, null, 2));
```

**Why this matters**:
- Shows EXACTLY what's being sent (no assumptions)
- Reveals any serialization issues
- Can compare validation output with actual API input

## Expected Flow (Correct Scenario)

### Scenario: User asks question that requires 2 tool calls

#### Call 1: Initial Request
```
Input to processAIResponse:
[0] user: "What's the price for HNVN13?" (string)
```

API responds with tool_use → Execute tools → Construct:
```
[0] user: "What's the price for HNVN13?" (string)
[1] assistant: [tool_use(get_products), text] (array)
[2] user: [tool_result] (array)
```

#### Call 2: Recursive (tools executed)
```
Input to processAIResponse:
[0] user: "What's the price for HNVN13?" (string)
[1] assistant: [tool_use(get_products), text] (array)
[2] user: [tool_result] (array)
```

API responds with ANOTHER tool_use → Execute tools → Construct:
```
[0] user: "What's the price for HNVN13?" (string)
[1] assistant: [tool_use(get_products), text] (array)
[2] user: [tool_result] (array)
[3] assistant: [tool_use(get_prices), text] (array)
[4] user: [tool_result] (array)
```

**Structure**: ✅ All tool_use messages immediately followed by tool_result

#### Call 3: Recursive (second tool executed)
```
Input to processAIResponse:
[0] user: "What's the price for HNVN13?" (string)
[1] assistant: [tool_use(get_products), text] (array)
[2] user: [tool_result] (array)
[3] assistant: [tool_use(get_prices), text] (array)
[4] user: [tool_result] (array)
```

API responds with final answer (no tools) → Save to database

## Potential Issues To Watch For

### 1. Database Contamination
**Symptom**: Messages with array content in database
**Cause**: Bug in save logic or manual DB editing
**Solution**: handleSend filters out non-string messages (lines 620-626)

### 2. Concurrent Requests
**Symptom**: Multiple handleSend calls interleaving
**Cause**: User clicking send multiple times
**Solution**: handleSend checks `loading` state (line 462)

### 3. Tool Execution Failures
**Symptom**: Empty or malformed tool_result content
**Cause**: executeTool throwing exception or returning invalid JSON
**Solution**: Catch block at lines 377-388 returns error as tool_result

### 4. SDK Serialization Issues
**Symptom**: Messages look correct in logs but API rejects
**Cause**: Anthropic SDK transforming messages before sending
**Solution**: Now logging JSON.stringify output to see exact bytes sent

## Testing Instructions

1. Clear any existing conversations
2. Start new conversation
3. Send query that triggers tool use: "Našumas 13 m3/parą, įgilinimas 1,8m, srauto išlyginimo rezervuaras 7m3 kaina 100"
4. Watch console for:
   - `[STRUCTURAL VALIDATION FAILED]` - indicates adjacency issue
   - `[API CALL] Serialized messages` - shows exact JSON structure
   - Any differences between validation output and API call output

## Next Steps If Issue Persists

1. **Check the JSON output**: Does message structure match validation?
2. **Check message indices**: Are tool_use/tool_result actually adjacent?
3. **Check tool_result content**: Is it valid (non-empty string)?
4. **Check for hidden characters**: Could there be Unicode issues in IDs?

## Code Quality Improvements

### Simple & Robust Design
- Single source of truth for message construction (lines 401-419)
- No complex filtering during recursive calls
- Clear separation: handleSend filters DB messages, processAIResponse handles clean arrays

### Validation Before API Call
- Fail fast with clear error messages
- Prevent 400 errors from reaching production
- Detailed logging for debugging

### No Complex Workarounds
- Didn't add message deduplication logic (not needed)
- Didn't add message reordering logic (not needed)
- Didn't add complex state management (not needed)
- Just fixed the root cause: proper validation

