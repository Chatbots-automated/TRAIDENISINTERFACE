# 🔧 Voiceflow Embed - Debug Guide

## Fixed Issues

The following fixes have been applied to resolve the Voiceflow embed display issue:

### 1. **Enhanced Container Detection with Retry Logic**
- Increased retry attempts from 10 to 20 (3 seconds total)
- Increased retry interval from 100ms to 150ms
- Added detailed console logging for each attempt

### 2. **Improved Script Loading**
- Better detection of existing Voiceflow scripts
- Proper handling of script load timing
- Added 300ms delay after script load before initialization

### 3. **Fixed Container Styling**
- Increased `minHeight` from 400px to 600px
- Changed `overflow` from `hidden` to `visible`
- Added explicit `display: block` and `position: relative`
- Added background color for visual debugging

### 4. **Better Error Handling**
- Comprehensive console logging with emojis for easy tracking
- Script load error detection
- Initialization error catching

---

## Console Logs to Look For

When you toggle to Voiceflow mode, you should see:

```
🔵 Voiceflow mode activated
🔍 Attempt 1: Container check { exists: true, ... }
♻️ Re-initializing existing Voiceflow instance
✅ Voiceflow widget initialized successfully
```

**OR** (if first time):

```
🔵 Voiceflow mode activated
🔍 Attempt 1: Container check { exists: true, ... }
📦 Loading Voiceflow script for the first time
📥 Voiceflow script loaded
✅ Voiceflow widget initialized on first load
```

---

## If Still Not Working

### Quick Browser Console Check

Paste this in your browser console after toggling to Voiceflow mode:

```javascript
// === QUICK DIAGNOSTIC ===
const container = document.getElementById('voiceflow-container');
console.log('📊 DIAGNOSTIC REPORT:', {
  containerExists: !!container,
  containerVisible: container ? window.getComputedStyle(container).display !== 'none' : false,
  containerDimensions: container?.getBoundingClientRect(),
  voiceflowLoaded: typeof window.voiceflow !== 'undefined',
  voiceflowChat: typeof window.voiceflow?.chat !== 'undefined',
  containerChildren: container?.children.length || 0,
  containerHTML: container?.innerHTML.substring(0, 200)
});
```

### Expected Output:
```javascript
{
  containerExists: true,
  containerVisible: true,
  containerDimensions: DOMRect { x: ..., y: ..., width: >300, height: >600 },
  voiceflowLoaded: true,
  voiceflowChat: true,
  containerChildren: >0,  // Should have child elements from Voiceflow
  containerHTML: "<div class='vf-..." // Voiceflow markup
}
```

---

## Common Issues & Solutions

### Issue 1: Container has 0 height
**Check:** Run diagnostic above, look at `containerDimensions.height`
**Fix:** Applied - minHeight now 600px with explicit height: 100%

### Issue 2: Script loads but widget doesn't initialize
**Check:** Console should show "Voiceflow script loaded" but no "initialized"
**Fix:** Applied - added 300ms delay between script load and initialization

### Issue 3: Container not found
**Check:** Console shows multiple "Attempt X" messages
**Fix:** Applied - retry logic now runs for 3 seconds instead of 1 second

### Issue 4: Parent container has display:none
**Check:**
```javascript
const container = document.getElementById('voiceflow-container');
let parent = container?.parentElement;
while (parent) {
  console.log(parent.className, window.getComputedStyle(parent).display);
  parent = parent.parentElement;
}
```
**Fix:** Ensure `isVoiceflowMode` is true and standard chat is hidden

---

## Manual Testing Steps

1. **Clear browser cache** (Ctrl+Shift+Delete)
2. **Hard refresh** the page (Ctrl+Shift+R)
3. **Open DevTools Console** (F12)
4. **Select a chat thread** from sidebar
5. **Click toggle button** (top-right)
6. **Watch console** for the diagnostic messages above
7. **Wait 3-5 seconds** for initialization
8. **Check Elements tab** - look for `#voiceflow-container` and its children

---

## Verification Checklist

After toggling to Voiceflow mode:

- [ ] Console shows "🔵 Voiceflow mode activated"
- [ ] Console shows "✅ Voiceflow widget initialized"
- [ ] No red error messages in console
- [ ] Container has children elements (visible in Elements tab)
- [ ] Widget interface is visible on screen
- [ ] Can interact with the Voiceflow chat

---

## Advanced Debugging

### Force Reinitialization

If the widget seems stuck, run this in console:

```javascript
// Force cleanup and reinit
if (window.voiceflow?.chat?.destroy) {
  window.voiceflow.chat.destroy();
}

setTimeout(() => {
  const container = document.getElementById('voiceflow-container');
  if (container && window.voiceflow?.chat) {
    window.voiceflow.chat.load({
      verify: { projectID: '692f59baeb204d830537c543' },
      url: 'https://general-runtime.voiceflow.com',
      versionID: 'production',
      render: {
        mode: 'embedded',
        target: container
      },
      autostart: true,
      voiceURL: 'https://runtime-api.voiceflow.com'
    });
    console.log('✅ Manually reinitialized');
  }
}, 500);
```

### Check Network Requests

1. Open DevTools → Network tab
2. Filter by "voiceflow"
3. Toggle to Voiceflow mode
4. Look for:
   - `bundle.mjs` - Should be 200 OK
   - API calls to `general-runtime.voiceflow.com` - Should be 200 OK

### Inspect DOM Structure

After toggle, the DOM should look like:

```html
<div id="voiceflow-container" style="min-height: 600px; height: 100%; ...">
  <div class="vf-chat-widget" style="...">
    <!-- Voiceflow injected content -->
    <div class="vf-chat-container">...</div>
  </div>
</div>
```

---

## Getting Help

If the issue persists after these fixes:

1. **Screenshot console logs** showing the diagnostic messages
2. **Screenshot Elements tab** showing the `#voiceflow-container` structure
3. **Screenshot Network tab** showing Voiceflow requests
4. **Note browser and version** (Chrome 120, Firefox 115, etc.)
5. **Check browser extensions** - Try in Incognito mode

---

## Key Improvements Made

| Issue | Before | After |
|-------|--------|-------|
| Container detection | 1 second timeout | 3 second timeout with retry |
| Retry interval | 100ms | 150ms |
| Script loading | Basic check | Comprehensive load handling |
| Container height | 400px min | 600px min + 100% height |
| Container overflow | hidden | visible |
| Console logging | Minimal | Detailed with status emojis |
| Error handling | Basic | Comprehensive with error details |

---

## Success Indicators

You'll know it's working when:

1. ✅ Toggle button changes color (green → purple)
2. ✅ Standard chat disappears
3. ✅ Gray background appears (Voiceflow container)
4. ✅ Voiceflow chat interface loads within 1-3 seconds
5. ✅ Console shows green checkmark "✅ Voiceflow widget initialized"
6. ✅ You can interact with the Voiceflow chat

---

## Performance Notes

- **First load**: ~2-3 seconds (script download + initialization)
- **Subsequent toggles**: ~300-500ms (re-initialization only)
- **Script size**: ~100-200KB (cached after first load)
- **Memory usage**: Properly cleaned up when switching back to standard mode

---

## Related Files

- `src/components/ChatInterface.tsx` - Main implementation
- `src/vite-env.d.ts` - TypeScript definitions
- `VOICEFLOW-TOGGLE.md` - Complete feature documentation
- `VOICEFLOW-QUICK-START.md` - User guide

---

**Last Updated:** After applying comprehensive fixes for container detection, script loading, and styling issues.
