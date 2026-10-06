# Team Collaboration Service Account Implementation Summary

## 🎯 Problem Solved

**Before**: Users could only access Google Drive team folders if they signed in with the specific Google account that owned the folder (e.g., `conceptualize@launchwith.co`). This prevented collaboration where team members sign in with their own emails.

**After**: Users can sign in with **any email address** and automatically access their team's Google Drive folders through a centralized service account backend.

## 🏗️ Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                       Frontend (React + Tauri)               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  User signs in with Firebase Auth (any email)          │  │
│  │  user-a@example.com, alice@company.com, etc.          │  │
│  └────────────────────────────────────────────────────────┘  │
│                            ↓                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  DriveStorageBackendV2                                 │  │
│  │  - Uses Firebase Auth token                            │  │
│  │  - Calls Cloud Functions API                           │  │
│  │  - No Google OAuth required                            │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                            ↓ HTTPS + Auth Token
┌──────────────────────────────────────────────────────────────┐
│              Cloud Functions (Security Layer)                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  1. Verify Firebase Auth token ✓                       │  │
│  │  2. Check user is team member (Firestore) ✓            │  │
│  │  3. Use service account to access Drive ✓              │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                            ↓ Service Account
┌──────────────────────────────────────────────────────────────┐
│                    Google Drive API                          │
│  Team Folders (shared with service account)                  │
│  - Engineering Team Folder                                   │
│  - Product Team Folder                                       │
│  - Marketing Team Folder                                     │
└──────────────────────────────────────────────────────────────┘
```

## 📦 New Files Created

### Backend (Cloud Functions)
1. **`functions/package.json`** - Dependencies for Cloud Functions
   - firebase-admin
   - firebase-functions
   - googleapis
   - cors

2. **`functions/index.js`** - Main Cloud Functions implementation
   - `listTeamFiles` - List all files in team folder
   - `getTeamFile` - Get file content
   - `saveTeamFile` - Create/update file
   - `deleteTeamFile` - Delete file
   - `getTeamFileTree` - Get complete file tree
   - `createTeamFolder` - Create folder

### Frontend
3. **`src/services/driveStorageBackendV2.ts`** - New storage backend
   - Uses Cloud Functions API instead of direct Drive access
   - Authenticates with Firebase Auth token
   - No Google OAuth token management

### Configuration
4. **`firebase.json`** - Firebase configuration for functions
5. **`.firebaserc`** - Firebase project configuration
6. **`.env`** - Added `VITE_FUNCTIONS_URL` variable

### Documentation
7. **`SERVICE_ACCOUNT_SETUP.md`** - Detailed setup guide
8. **`TEAM_SERVICE_ACCOUNT_QUICKSTART.md`** - Quick start guide
9. **`test-service-account.js`** - Setup verification script
10. **`IMPLEMENTATION_SUMMARY.md`** - This file

## 🔄 Modified Files

### 1. `src/components/Team/TeamMainUI.tsx`
**Changes**:
- Removed import: `hasTokens`, `getTokenDebugInfo` from tokenStorage
- Changed import: `DriveStorageBackend` → `DriveStorageBackendV2`
- Removed token validation check in `useEffect`
- Updated backend initialization to use V2 with teamId parameter

**Before**:
```typescript
if (!hasTokens()) {
  console.error('❌ No Google Drive access token found');
  return;
}
const backend = new DriveStorageBackend(
  selectedTeam.driveFolderId,
  selectedTeam.name
);
```

**After**:
```typescript
console.log('✅ Initializing team storage backend with service account...');
const backend = new DriveStorageBackendV2(
  selectedTeam.id,
  selectedTeam.driveFolderId,
  selectedTeam.name
);
```

### 2. `package.json`
**Added**:
- `test:service-account` script for setup verification

### 3. `.env`
**Added**:
```env
VITE_FUNCTIONS_URL=https://us-central1-conceptualize-c9a41.cloudfunctions.net
```

## 🔐 Security Model

### Authentication Flow
1. **User signs in** → Firebase Auth (email/password, Google, etc.)
2. **Frontend gets** → Firebase ID token (JWT)
3. **API calls include** → Authorization header with ID token
4. **Cloud Function verifies** → Token validity and user identity
5. **Cloud Function checks** → User membership in team (Firestore)
6. **If authorized** → Service account accesses Drive on user's behalf

### Authorization Layers
- ✅ **Layer 1**: Firebase Auth (user identity)
- ✅ **Layer 2**: Cloud Functions (verify token)
- ✅ **Layer 3**: Firestore (verify team membership)
- ✅ **Layer 4**: Google Drive (service account permissions)

### Service Account Permissions
- Service account **only** has access to folders explicitly shared with it
- Cannot access user's personal Drive files
- All operations logged and auditable
- Credentials stored securely in Firebase environment config

## 📊 API Endpoints

### Base URL
Production: `https://us-central1-conceptualize-c9a41.cloudfunctions.net`

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/listTeamFiles/:teamId/files` | List all files in team folder |
| GET | `/getTeamFile/:teamId/files/:fileId` | Get file content |
| POST | `/saveTeamFile/:teamId/files` | Create or update file |
| DELETE | `/deleteTeamFile/:teamId/files/:fileId` | Delete file |
| POST | `/getTeamFileTree/:teamId/files/tree` | Get complete file tree |
| POST | `/createTeamFolder/:teamId/folders` | Create new folder |

### Request Format
All requests must include:
```
Authorization: Bearer <firebase-id-token>
Content-Type: application/json
```

## 🚀 Deployment Checklist

- [ ] Create Google Service Account
- [ ] Download service account key JSON
- [ ] Enable Google Drive API
- [ ] Share team folders with service account email
- [ ] Configure service account key in Firebase:
  ```bash
  firebase functions:config:set google.service_account_key="$(cat key.json)"
  ```
- [ ] Install function dependencies:
  ```bash
  cd functions && npm install
  ```
- [ ] Deploy Cloud Functions:
  ```bash
  firebase deploy --only functions
  ```
- [ ] Update `.env` with functions URL
- [ ] Test with multiple user emails

## ✅ Verification Steps

### 1. Run Setup Test
```bash
npm run test:service-account
```

### 2. Test User Flow
1. Sign in as User A (e.g., `user-a@example.com`)
2. Join/create a team
3. Create a note
4. Sign out

5. Sign in as User B (e.g., `alice@company.com`)
6. Join the same team
7. Verify you can see User A's note
8. Edit the note
9. Sign out

10. Sign in as User A again
11. Verify you can see User B's edits

### 3. Check Logs
```bash
firebase functions:log
```

Look for:
- ✅ Successful auth token verification
- ✅ Team access validation
- ✅ Drive API operations

## 🎉 Benefits Achieved

1. **✅ Automatic Access**: No manual Google Drive sharing needed
2. **✅ Any Email Works**: Users sign in with their own email addresses
3. **✅ Simplified Auth**: Only Firebase Auth required (no Google OAuth)
4. **✅ Better Security**: Service account credentials never exposed to client
5. **✅ Centralized Control**: All Drive operations go through validated API
6. **✅ Scalable**: Add unlimited teams and users without additional setup
7. **✅ Auditable**: All operations logged in Cloud Functions

## 🔧 Maintenance

### Monitoring
- Monitor Cloud Functions usage in Firebase Console
- Set up billing alerts for unexpected usage
- Review function logs regularly

### Updates
- Keep `firebase-admin` and `googleapis` dependencies updated
- Review security rules periodically
- Rotate service account keys annually (security best practice)

### Costs
- Cloud Functions: Pay per invocation + compute time
- Firestore: Pay per read/write operation
- Google Drive API: Free quota, then pay per request

**Estimated costs for small team**: < $5/month

## 📚 Further Reading

- [SERVICE_ACCOUNT_SETUP.md](./SERVICE_ACCOUNT_SETUP.md) - Detailed setup
- [TEAM_SERVICE_ACCOUNT_QUICKSTART.md](./TEAM_SERVICE_ACCOUNT_QUICKSTART.md) - Quick start
- [Firebase Cloud Functions Docs](https://firebase.google.com/docs/functions)
- [Google Drive API Docs](https://developers.google.com/drive/api/guides/about-sdk)

## 🐛 Common Issues

### Issue: "Unauthorized: Invalid token"
**Solution**: User needs to sign in with Firebase Auth

### Issue: "User is not a member of this team"
**Solution**: Check Firestore team document, ensure user is in members array

### Issue: "Failed to list files"
**Solution**: Verify service account has Editor permissions on team folder

### Issue: Functions not deploying
**Solution**:
```bash
firebase login
firebase use conceptualize-c9a41
firebase deploy --only functions
```

---

**Implementation completed**: ✅
**Ready for production**: After service account setup
**Next steps**: Follow [TEAM_SERVICE_ACCOUNT_QUICKSTART.md](./TEAM_SERVICE_ACCOUNT_QUICKSTART.md)
