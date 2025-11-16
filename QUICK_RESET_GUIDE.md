# Quick Reset & Test Guide

## TL;DR - Reset and Test in 5 Minutes

### 1. Start the app
```bash
npm run dev
```

### 2. Open browser console (F12) and run:
```javascript
resetForTesting()
```

### 3. Wait for reload, then:
1. ✅ Select **Team Mode**
2. ✅ Click **Sign in with Google**
3. ✅ Sign in as `conceptualize@launchwith.co`
4. ✅ Grant Drive permissions
5. ✅ Click **+ Create Team**
6. ✅ Enter name: `Test Team`
7. ✅ Click **Create Team**

### 4. Success! ✨

You should see:
- Team appears in sidebar
- No error messages
- Drive folder ID displayed

### 5. Create a note:
1. Click **+ New Note**
2. Enter: `My First Note`
3. Click **Create**
4. Click **View** to open in Drive

---

## If You Get Errors

### "Google Drive API has not been used..."
👉 The API is already enabled! This shouldn't happen.
If it does, visit: https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=295348593042

### "Not authenticated"
```javascript
resetAuthOnly()
```
Then sign in again.

### Any other error
```javascript
showStoredData()  // See what's stored
resetForTesting()  // Nuclear reset
```

---

## Quick Commands

```javascript
// Complete reset (clears everything - back to mode selection)
resetForTesting()

// Auth reset only (keeps app mode & folder)
resetAuthOnly()

// Reset local mode (clears folder selection - back to mode selection)
resetLocalMode()

// See what's stored
showStoredData()

// Clear everything manually
clearEverything()
clearAllAuthData()
```

## When to Use Which Reset?

**`resetForTesting()`** - Use when:
- Testing team workflow from scratch
- Want to go back to mode selection screen
- Need to clear ALL data (auth, mode, folder)

**`resetAuthOnly()`** - Use when:
- Want to sign in with a different Google account
- Keep your current mode (local/team) and folder
- Just need fresh authentication

**`resetLocalMode()`** - Use when:
- Want to select a different folder for local mode
- Start local mode from scratch
- Goes back to mode selection screen

---

## What Gets Created

When you create a team:
1. 📁 **Google Drive folder** in `conceptualize@launchwith.co` account
2. 📄 **Firestore document** with team metadata
3. 👥 **Team membership** record for you as owner

When you create a note:
1. 📝 **`.md` file** uploaded to the team's Drive folder
2. 🔗 **File ID** cached for quick access

---

## Next: Full Testing Guide

See [TESTING_TEAM_WORKFLOW.md](./TESTING_TEAM_WORKFLOW.md) for complete testing instructions.
