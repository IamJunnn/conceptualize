# Google Service Account Setup Guide

This guide will help you set up a Google Service Account for automatic team storage management.

## Step 1: Create a Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project: **conceptualize-c9a41**
3. Navigate to **IAM & Admin** → **Service Accounts**
4. Click **"+ CREATE SERVICE ACCOUNT"**
5. Fill in details:
   - **Service account name**: `conceptualize-team-storage`
   - **Service account ID**: `conceptualize-team-storage`
   - **Description**: Service account for managing team file storage in Google Drive
6. Click **"CREATE AND CONTINUE"**
7. **Grant this service account access to project**: Skip this step (click "CONTINUE")
8. **Grant users access to this service account**: Skip this step (click "DONE")

## Step 2: Create Service Account Key

1. Click on the newly created service account
2. Go to **"KEYS"** tab
3. Click **"ADD KEY"** → **"Create new key"**
4. Select **JSON** format
5. Click **"CREATE"**
6. The JSON key file will be downloaded to your computer
7. **IMPORTANT**: Keep this file secure! It contains credentials to access your Google Drive

## Step 3: Enable Google Drive API

1. In Google Cloud Console, navigate to **APIs & Services** → **Library**
2. Search for **"Google Drive API"**
3. Click on it and click **"ENABLE"**

## Step 4: Share Team Drive Folders with Service Account

For each team's Drive folder that you want the service account to manage:

1. Open Google Drive at [drive.google.com](https://drive.google.com)
2. Navigate to the team folder (or create one if it doesn't exist)
3. Right-click the folder → **"Share"**
4. Add the service account email (looks like: `conceptualize-team-storage@conceptualize-c9a41.iam.gserviceaccount.com`)
5. Give it **"Editor"** permissions
6. Click **"Send"** (uncheck "Notify people" since it's a service account)

## Step 5: Configure Firebase Functions

1. Open the downloaded JSON key file
2. Copy the entire JSON content
3. In your terminal, navigate to the project directory
4. Set the service account key as an environment variable:

```bash
firebase functions:config:set google.service_account_key="$(cat path/to/your-service-account-key.json)"
```

Or for local development, create a `.env` file in the `functions` directory:

```bash
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"conceptualize-c9a41",...}'
```

## Step 6: Deploy Cloud Functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

## Step 7: Update Frontend Configuration

After deploying, you'll get function URLs. Update your frontend to use these URLs:

```
https://us-central1-conceptualize-c9a41.cloudfunctions.net/listTeamFiles
https://us-central1-conceptualize-c9a41.cloudfunctions.net/getTeamFile
https://us-central1-conceptualize-c9a41.cloudfunctions.net/saveTeamFile
https://us-central1-conceptualize-c9a41.cloudfunctions.net/deleteTeamFile
https://us-central1-conceptualize-c9a41.cloudfunctions.net/getTeamFileTree
https://us-central1-conceptualize-c9a41.cloudfunctions.net/createTeamFolder
```

## Security Notes

- ✅ Service account can ONLY access folders explicitly shared with it
- ✅ Users must be authenticated with Firebase to call the functions
- ✅ Functions verify user is a team member before allowing access
- ✅ Service account credentials should NEVER be committed to git
- ✅ Add `*.json` to `.gitignore` to prevent accidental commits

## Testing

Once set up, users can:
1. Sign in with ANY email address
2. Join/create teams
3. Automatically access team files without individual Drive OAuth

The service account handles all Drive operations in the background!
