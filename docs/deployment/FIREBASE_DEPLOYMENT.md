# Firebase Functions Deployment Guide

This guide explains how to deploy Firebase Functions for the Conceptualize team collaboration features.

## Quick Deployment Steps

1. **Open a new terminal** (not in VSCode, use a regular terminal)

2. **Navigate to your project:**
```bash
cd c:\Users\Owner\Desktop\project\conceptualize
```

3. **Login to Firebase (if not already):**
```bash
firebase login
```

4. **Deploy the functions:**
```bash
cd functions
firebase deploy --only functions
```

## Expected Output
You should see something like:
```
✔ functions: Finished running predeploy script.
i functions: ensuring required API cloudfunctions.googleapis.com is enabled...
✔ functions: required API cloudfunctions.googleapis.com is enabled
i functions: preparing functions directory for uploading...
i functions: packaged functions (XX KB) for uploading
✔ functions: functions folder uploaded successfully
i functions: creating Node.js 18 function createTeamStorage(us-central1)...
i functions: creating Node.js 18 function listTeamFiles(us-central1)...
i functions: creating Node.js 18 function getTeamFile(us-central1)...
i functions: creating Node.js 18 function saveTeamFile(us-central1)...
i functions: creating Node.js 18 function deleteTeamFile(us-central1)...
i functions: creating Node.js 18 function getTeamFileTree(us-central1)...
i functions: creating Node.js 18 function createTeamFolder(us-central1)...
✔ Deploy complete!
```

## After Deployment

1. **Test the app** at http://localhost:5174/
2. **Try creating a team** - it should now work!

## If You Get Errors

### "Failed to authenticate"
- Run `firebase login` first

### "Project not found"
- Make sure you're in the right directory
- Check `.firebaserc` has the correct project ID

### "Permission denied"
- Make sure you have owner/editor access to the Firebase project

## Deployment Status Checklist

- [ ] Firebase CLI installed
- [ ] Logged in to Firebase (`firebase login`)
- [ ] Functions deployed (`firebase deploy --only functions`)
- [ ] Storage rules deployed (`firebase deploy --only storage`)
- [ ] App tested with team features

## Notes

- The app uses Firebase Cloud Storage for team file storage
- Authentication is handled via Firebase Auth
- Functions handle all team file operations securely