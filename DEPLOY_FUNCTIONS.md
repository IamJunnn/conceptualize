# Deploy Firebase Functions

## Prerequisites
1. Firebase CLI installed
2. Logged in to Firebase

## Login to Firebase
If you haven't logged in yet:
```bash
firebase login
```

## Deploy Functions

1. Navigate to the functions directory:
```bash
cd functions
```

2. Install dependencies (if not already done):
```bash
npm install
```

3. Deploy the functions:
```bash
firebase deploy --only functions
```

Or deploy specific functions:
```bash
# Deploy team storage functions
firebase deploy --only functions:createTeamStorage,functions:listTeamFiles,functions:getTeamFile,functions:saveTeamFile,functions:deleteTeamFile,functions:getTeamFileTree,functions:createTeamFolder
```

## Verify Deployment

After deployment, you should see output like:
```
✔ functions: Successfully deployed functions:
- createTeamStorage
- listTeamFiles
- getTeamFile
- saveTeamFile
- deleteTeamFile
- getTeamFileTree
- createTeamFolder
```

## Test the Functions

1. The functions URL will be:
```
https://us-central1-conceptualize-c9a41.cloudfunctions.net/{functionName}
```

2. Test team creation in the app to verify everything works

## Troubleshooting

If you encounter issues:

1. Check Firebase Console for function logs:
   - Go to https://console.firebase.google.com
   - Select your project (conceptualize-c9a41)
   - Go to Functions section
   - Check the logs

2. Common issues:
   - **Authentication errors**: Make sure Firebase Auth is properly configured
   - **Storage bucket not found**: Verify storage bucket name in Firebase Console
   - **Permission denied**: Check Firebase Security Rules for Cloud Storage

## Firebase Security Rules

Make sure your Cloud Storage security rules allow authenticated users to access team files:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Allow authenticated users to read/write their team files
    match /teams/{teamId}/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

You can update these rules in the Firebase Console under Storage > Rules.