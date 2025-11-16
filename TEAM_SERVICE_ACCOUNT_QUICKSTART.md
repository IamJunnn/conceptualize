# Team Collaboration with Service Account - Quick Start Guide

This guide will help you set up automatic team collaboration where **any user can sign in with any email** and access their team's Google Drive storage automatically.

## 🎯 What's Changed?

### Before (Old System):
- ❌ Each user needed to sign in with Google Drive OAuth
- ❌ Only the Drive owner could access team files
- ❌ Manual sharing required for each team member
- ❌ Token management complexity on frontend

### After (New System):
- ✅ Users sign in with **any email** (Firebase Auth only)
- ✅ **No Google OAuth required** for individual users
- ✅ **Automatic access** to team files via service account
- ✅ Backend handles all Drive operations securely
- ✅ Centralized control and better security

## 📋 Prerequisites

1. Google Cloud Console access for `conceptualize-c9a41` project
2. Firebase CLI installed (`npm install -g firebase-tools`)
3. Access to create service accounts

## 🚀 Setup Steps

### Step 1: Create Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: **conceptualize-c9a41**
3. Navigate to **IAM & Admin** → **Service Accounts**
4. Click **"+ CREATE SERVICE ACCOUNT"**
5. Enter details:
   ```
   Name: conceptualize-team-storage
   ID: conceptualize-team-storage
   Description: Manages team file storage in Google Drive
   ```
6. Click **"CREATE AND CONTINUE"** → Skip role assignment → **"DONE"**

### Step 2: Create Service Account Key

1. Click on the service account you just created
2. Go to **"KEYS"** tab → **"ADD KEY"** → **"Create new key"**
3. Select **JSON** format → Click **"CREATE"**
4. Save the downloaded JSON file securely (e.g., `service-account-key.json`)

⚠️ **IMPORTANT**: Never commit this file to git! It contains sensitive credentials.

### Step 3: Enable Google Drive API

1. In Google Cloud Console, go to **APIs & Services** → **Library**
2. Search for **"Google Drive API"**
3. Click **"ENABLE"**

### Step 4: Share Team Folders with Service Account

For each team's Google Drive folder:

1. Open [Google Drive](https://drive.google.com)
2. Find/create the team folder
3. Right-click → **"Share"**
4. Add service account email:
   ```
   conceptualize-team-storage@conceptualize-c9a41.iam.gserviceaccount.com
   ```
5. Grant **"Editor"** permissions
6. Uncheck "Notify people" → Click **"Share"**

### Step 5: Configure Firebase Functions

#### Option A: For Production

```bash
# Navigate to project root
cd c:\Users\Owner\Desktop\project\conceptualize

# Login to Firebase
firebase login

# Set the service account key as environment variable
firebase functions:config:set google.service_account_key="$(cat path/to/service-account-key.json)"
```

#### Option B: For Local Development

Create a `.env` file in the `functions` directory:

```bash
cd functions
```

Create `functions/.env`:
```env
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"conceptualize-c9a41",...}
```

Paste the entire content of your service account JSON file as the value.

### Step 6: Deploy Cloud Functions

```bash
# Make sure you're in the project root
cd c:\Users\Owner\Desktop\project\conceptualize

# Deploy all functions
firebase deploy --only functions
```

Wait for deployment to complete. You'll see URLs like:
```
✔  functions[listTeamFiles(us-central1)] https://us-central1-conceptualize-c9a41.cloudfunctions.net/listTeamFiles
✔  functions[getTeamFile(us-central1)] https://us-central1-conceptualize-c9a41.cloudfunctions.net/getTeamFile
...
```

### Step 7: Update Frontend Configuration

The `.env` file is already configured with:
```env
VITE_FUNCTIONS_URL=https://us-central1-conceptualize-c9a41.cloudfunctions.net
```

For local testing with emulators:
```env
VITE_FUNCTIONS_URL=http://127.0.0.1:5001/conceptualize-c9a41/us-central1
```

### Step 8: Test the Setup

1. **Start the app**:
   ```bash
   npm run dev
   ```

2. **Sign in** with ANY email (e.g., `iamjunson@gmail.com`, `alice@company.com`)

3. **Select/Join a team**

4. **Verify automatic access**:
   - File tree should load automatically
   - No Google OAuth prompts
   - No token errors in console

## 🧪 Testing Scenario

Test with two different users:

**User 1**: `iamjunson@gmail.com`
1. Sign in with Firebase Auth
2. Join team "Engineering"
3. Create a note "Project Plan.md"
4. See the note appear in the file tree

**User 2**: `alice@company.com`
1. Sign in with Firebase Auth (different email!)
2. Join the same team "Engineering"
3. See "Project Plan.md" in the file tree
4. Edit and save the note
5. User 1 should see the changes when refreshing

## 🔒 Security Model

```
┌─────────────────────────────────────────────────────┐
│  Frontend (Any User Email)                          │
│  - Firebase Auth Token                              │
└────────────────┬────────────────────────────────────┘
                 │
                 │ HTTPS + Auth Token
                 ▼
┌─────────────────────────────────────────────────────┐
│  Cloud Functions (Security Layer)                   │
│  1. Verify Firebase Auth token                      │
│  2. Check user is team member (Firestore)           │
│  3. Proceed only if authorized                      │
└────────────────┬────────────────────────────────────┘
                 │
                 │ Service Account Credentials
                 ▼
┌─────────────────────────────────────────────────────┐
│  Google Drive (Team Folders)                        │
│  - Service account has access                       │
│  - Users never directly access Drive                │
└─────────────────────────────────────────────────────┘
```

## 📝 Code Changes Summary

### New Files:
- `functions/index.js` - Cloud Functions API
- `functions/package.json` - Functions dependencies
- `src/services/driveStorageBackendV2.ts` - New backend using API

### Modified Files:
- `src/components/Team/TeamMainUI.tsx` - Uses V2 backend, no token checks
- `.env` - Added `VITE_FUNCTIONS_URL`

### Removed Dependencies:
- ❌ Client-side Google Drive OAuth tokens
- ❌ `tokenStorage.ts` import in TeamMainUI
- ❌ Token validation checks

## 🎉 Benefits

1. **Simplified User Experience**: Users just sign in once with Firebase
2. **Automatic Team Access**: No manual Drive sharing needed
3. **Better Security**: Service account credentials never exposed to frontend
4. **Centralized Control**: All Drive operations audited through Cloud Functions
5. **Scalable**: Works for unlimited teams and users

## 🐛 Troubleshooting

### "Unauthorized: Invalid token"
- Make sure user is signed in with Firebase Auth
- Check that Firebase Auth token is being sent correctly

### "User is not a member of this team"
- Verify user is added to team members in Firestore
- Check team document in Firebase Console

### "Failed to list files"
- Verify service account has Editor access to the team folder
- Check service account key is configured correctly in Firebase Functions

### Functions not deploying
```bash
# Check Firebase project
firebase use

# Should show: conceptualize-c9a41

# If not, set it:
firebase use conceptualize-c9a41
```

## 📚 Next Steps

1. ✅ Complete service account setup
2. ✅ Deploy Cloud Functions
3. ✅ Test with multiple users
4. 🔄 Monitor function logs: `firebase functions:log`
5. 🔄 Set up billing alerts for Cloud Functions usage

## 💡 Local Development with Emulators

To test locally without deploying:

```bash
# Start Firebase emulators
firebase emulators:start

# Update .env
VITE_FUNCTIONS_URL=http://127.0.0.1:5001/conceptualize-c9a41/us-central1

# Run app
npm run dev
```

This allows you to test the full flow locally before deploying to production!
