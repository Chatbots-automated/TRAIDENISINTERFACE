# 🚀 Voiceflow Toggle - Quick Start Guide

## 30-Second Overview

You now have a toggle button that switches between your standard chat and a Voiceflow AI widget!

---

## 🎯 How to Use

### Step 1: Open a Chat
Select any chat thread from your sidebar (or create a new one)

### Step 2: Find the Toggle
Look in the **top-right corner** of the chat area - you'll see a toggle button

### Step 3: Switch Interfaces
Click the button to switch between:
- 🟢 **Standard Chat** (your original interface)
- 🟣 **Voiceflow Chat** (AI-powered widget)

---

## 🎨 Visual Guide

### Toggle Button Location
```
┌─────────────────────────────────────┐
│  Chat Thread Title  [Toggle Button] │ ← Here!
├─────────────────────────────────────┤
│                                     │
│  Chat messages appear here...      │
│                                     │
└─────────────────────────────────────┘
```

### Standard Mode (Default)
```
┌────────────────────────────────────┐
│         [🟢 Voiceflow Chat]        │
├────────────────────────────────────┤
│  💬 Your messages                  │
│  🤖 AI responses                   │
│  📋 Query type selector            │
├────────────────────────────────────┤
│  [Type] [Message input...] [Send]  │
└────────────────────────────────────┘
```

### Voiceflow Mode
```
┌────────────────────────────────────┐
│         [🟣 Standard Chat]         │
├────────────────────────────────────┤
│                                    │
│     Voiceflow Widget Interface     │
│     (Independent AI chat)          │
│                                    │
└────────────────────────────────────┘
```

---

## ⚡ Quick Facts

| Feature | Details |
|---------|---------|
| **Location** | Top-right corner of chat |
| **Color** | 🟢 Green (Standard) / 🟣 Purple (Voiceflow) |
| **Hotkey** | None (click only) |
| **Persistence** | Resets to Standard on page reload |
| **Availability** | Only when chat thread is open |

---

## 🎭 What's Different?

### Standard Chat
- ✅ Your custom chat history
- ✅ Query type selector (Commercial, General, Custom)
- ✅ Message persistence in Supabase
- ✅ User identification
- ✅ Commercial offer features

### Voiceflow Chat
- ✅ Embedded AI widget
- ✅ Independent conversation flow
- ✅ Voiceflow's AI capabilities
- ✅ Separate from standard chat history
- ✅ No query type selector needed

---

## 🔧 Technical Info

**Voiceflow Project**: `692f59baeb204d830537c543`
**Mode**: Embedded (not popup)
**Version**: Production
**Auto-start**: Yes

---

## ❓ FAQs

### Q: Will my chat history be lost?
**A**: No! Standard chat history is preserved. Voiceflow runs independently.

### Q: Can I use both simultaneously?
**A**: No, it's either/or. Toggle switches between them.

### Q: Which mode should I use?
**A**:
- Use **Standard** for regular conversations with your custom features
- Use **Voiceflow** to test the AI widget or for alternative interaction

### Q: Does Voiceflow sync with my standard chat?
**A**: No, they are completely separate interfaces with independent conversation histories.

### Q: Why isn't the toggle button showing?
**A**: Make sure you have a chat thread selected in the sidebar.

---

## 🎓 For Power Users

### Browser Console
Check toggle state:
```javascript
// In browser console
localStorage.getItem('voiceflowMode') // Future feature
```

### Keyboard Navigation
- `Tab` to focus toggle button
- `Enter` or `Space` to activate

---

## ✨ Pro Tips

1. **Quick Testing**: Use Voiceflow mode to quickly test AI responses without affecting your chat history

2. **Fallback Option**: If one interface has issues, switch to the other

3. **Feature Comparison**: Try the same question in both interfaces to compare responses

4. **Clean Slate**: Voiceflow mode starts fresh conversations every time

---

## 🚨 Known Limitations

- Toggle requires active chat thread
- Voiceflow conversations don't save to your database
- No keyboard shortcut (yet)
- Mode preference doesn't persist across reloads

---

## 🎉 That's It!

You're ready to use the Voiceflow toggle feature. Just click the button in the top-right corner to switch between interfaces!

**Need help?** Check `VOICEFLOW-TOGGLE.md` for detailed documentation.
