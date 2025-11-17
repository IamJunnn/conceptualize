# Testing Team Workflow - Complete Guide

This guide walks you through testing the team collaboration feature from scratch.

## Prerequisites

✅ Google Drive API is **ENABLED** in Google Cloud Console (project 295348593042)
✅ OAuth credentials are configured in `.env` file
✅ Firebase is set up and running

## Step 1: Reset Everything

1. **Start the app in development mode:**
   ```bash
   npm run dev
   ```

2. **Open the browser console** (F12)

3. **Run the reset command:**
   ```javascript
   resetForTesting()
   ```

4. **Wait for auto-reload** (or press F5 to reload manually)

5. **Verify:** You should see the **Mode Selection Screen**

---

## Step 2: Select Team Mode

1. **Click "Team Mode"**
2. **Verify:** You should see the **Login Screen**

---

## Step 3: Sign In with Google

1. **Click "Sign in with Google"**
2. **Browser opens** → Select your Google account
3. **Grant permissions** when prompted:
   - Email
   - Profile
   - Google Drive (file access)
4. **Verify:** Browser shows "Authentication Successful"
5. **Verify:** App shows you're signed in as `conceptualize@launchwith.co`

---

## Step 4: Create Your First Team

1. **Click "+ Create Team"**
2. **Enter team details:**
   - Name: `Test Team`
   - Description: `Testing team collaboration features`
3. **Click "Create Team"**
4. **Wait for creation...**
5. **Verify success:**
   - ✅ Team appears in sidebar
   - ✅ "1 members" shows under team name
   - ✅ Drive folder ID is displayed
   - ✅ No error messages

### What Just Happened:
- A Google Drive folder was created in your `conceptualize@launchwith.co` account
- The folder is named "Conceptualize - Test Team"
- Team metadata saved to Firestore
- You are the owner of this team

---

## Step 5: Create Team Notes

1. **Click "+ New Note"**
2. **Enter note name:** `Meeting Notes`
3. **Click "Create"**
4. **Verify:**
   - ✅ Note appears in the list
   - ✅ "Just now" timestamp
   - ✅ Preview text shows
5. **Click "View"** to open in Google Drive
6. **Verify:** Note opens in Drive with markdown content

---

## Step 6: Verify in Google Drive

1. **Open Google Drive** in a new tab
2. **Sign in** as `conceptualize@launchwith.co`
3. **Find the folder:** "Conceptualize - Test Team"
4. **Verify:**
   - ✅ Folder exists
   - ✅ Contains `Meeting Notes.md`
   - ✅ File has content

---

## Step 7: Invite a Team Member (Optional)

1. **Click "+ Invite Member"**
2. **Enter email** of another Google account you have
3. **Select role:** Writer
4. **Click "Send Invite"**
5. **Check the invited email** for Drive share notification
6. **Sign in** with that account
7. **Accept the invitation** link
8. **Verify:** Both accounts can see the team folder

---

## Step 8: Test Multiple Teams

1. **Click "+ Create Team"** again
2. **Create:** `Another Team`
3. **Verify:**
   - ✅ Both teams show in sidebar
   - ✅ Clicking switches between teams
   - ✅ Each team has its own notes

---

## Common Issues & Solutions

### Error: "Google Drive API has not been used in project..."
**Solution:** Enable the API at:
https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=295348593042

### Error: "Not authenticated with Google Drive"
**Solution:**
1. Sign out
2. Sign in again
3. Make sure you grant Drive permissions

### Error: "Failed to create folder: 401"
**Solution:**
1. Check if access token expired
2. Run `resetAuthOnly()` in console
3. Sign in again

### Notes don't appear
**Solution:**
1. Check browser console for errors
2. Verify you're signed in to the correct Google account
3. Check Google Drive manually to see if files were created

---

## Debugging Commands

Open browser console (F12) and use these commands:

```javascript
// Show what's currently stored
showStoredData()

// Clear auth only (keeps app in team mode)
resetAuthOnly()

// Complete reset (back to mode selection)
resetForTesting()

// Check if Drive access is available
localStorage.getItem('google_access_token')
```

---

## Success Criteria

✅ Can select Team Mode
✅ Can sign in with Google (OAuth flow works)
✅ Can create a team (Drive folder created)
✅ Can create notes (files uploaded to Drive)
✅ Can view notes (opens in Drive)
✅ Can delete notes (removed from Drive)
✅ Can invite members (Drive share works)
✅ Can switch between multiple teams

---

## Next Steps After Testing

Once basic workflow is confirmed:
1. Enhance team UI to match local mode UI
2. Add in-app editor (instead of opening Drive)
3. Add file tree view
4. Add graph view for team notes
5. Add real-time sync between team members

---

## Notes

- All team data is stored in the **team owner's** Google Drive
- OAuth uses **your app's** Google Cloud project credentials
- Users only need to sign in with Google - no additional setup
- Each team is a separate folder in Drive
- Notes are stored as `.md` files in those folders
