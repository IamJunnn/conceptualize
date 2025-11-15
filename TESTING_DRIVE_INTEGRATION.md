# Testing Google Drive Integration

## 🧹 How to Clear Data and Start Fresh

### Method 1: Using Dev Console (Recommended)

1. **Open the app** in development mode:
   ```bash
   npm run dev
   ```

2. **Open DevTools**:
   - Press `F12` or `Ctrl+Shift+I` (Windows/Linux)
   - Press `Cmd+Option+I` (Mac)

3. **In the Console tab, run**:
   ```javascript
   // See what's currently stored
   showStoredData()

   // Clear all auth data (signs you out)
   await clearAllAuthData()

   // OR nuclear option (clears EVERYTHING)
   clearEverything()
   ```

### Method 2: Manual Clear

In the DevTools Console:
```javascript
// Clear localStorage
localStorage.clear()

// Reload the page
location.reload()
```

### Method 3: Clear Specific Tokens Only

```javascript
localStorage.removeItem('google_access_token')
localStorage.removeItem('google_refresh_token')
localStorage.removeItem('google_token_expires_at')
```

---

## 🧪 Testing the Google Drive Integration

### Prerequisites

1. **Google Cloud Console Setup**:
   - Ensure your OAuth client has the correct redirect URI: `http://localhost:8080/auth/callback` (or whichever port Tauri uses)
   - Verify the client ID and secret in your `.env` file

2. **Firebase Setup**:
   - Google sign-in method enabled
   - Firestore database created

### Test Flow

#### 1. **Test OAuth with Drive Scope**

1. Clear all data (see above)
2. Click "Sign in with Google"
3. **Verify**: Google consent screen should show:
   ```
   Conceptualize wants to access:
   ✓ See your email address
   ✓ See your personal info
   ✓ See, create, and delete files it created in Google Drive
   ```
4. Click "Allow"
5. **Check in console**:
   ```javascript
   showStoredData()
   ```
   Should show:
   - `google_access_token: SET ✓`
   - `google_refresh_token: SET ✓`
   - `google_token_expires_at: [timestamp] (VALID)`

#### 2. **Test Team Creation**

Open console and test the team service:

```javascript
import { createTeam } from './src/services/teamService'

// Create a test team
const team = await createTeam(
  'Test Marketing Team',
  'This is a test team',
  'your-email@gmail.com',
  'Your Name',
  'your-firebase-uid'
)

console.log('Team created:', team)
```

**Expected result**:
- ✅ Folder created in your Google Drive: "Conceptualize - Test Marketing Team"
- ✅ Team document created in Firestore `teams` collection
- ✅ Console shows: `✅ Team "Test Marketing Team" created successfully`

**Check Google Drive**:
1. Go to https://drive.google.com
2. You should see the folder "Conceptualize - Test Marketing Team"

#### 3. **Test Folder Sharing**

```javascript
import { inviteTeamMember } from './src/services/teamService'

// Invite a team member (use another email you have access to)
await inviteTeamMember(
  team.id,
  'teammate@gmail.com',
  'your-email@gmail.com',
  'Your Name'
)
```

**Expected result**:
- ✅ Drive folder shared with `teammate@gmail.com`
- ✅ Email sent to teammate (by Google)
- ✅ Invitation document created in Firestore `team_invites` collection

**Verify**:
1. Check `teammate@gmail.com` inbox for sharing notification
2. Check their Google Drive - folder should appear in "Shared with me"

#### 4. **Test File Upload**

```javascript
import { uploadNote } from './src/services/googleDriveService'

// Upload a test note
const file = await uploadNote(
  team.driveFolderId,
  'test-note.md',
  '# Test Note\n\nThis is a test note from Conceptualize!'
)

console.log('File uploaded:', file)
```

**Verify in Google Drive**:
1. Open the team folder
2. You should see `test-note.md`
3. Open it - should contain the test content

#### 5. **Test File Download**

```javascript
import { downloadNote } from './src/services/googleDriveService'

// Download the note
const content = await downloadNote(file.id)
console.log('Downloaded content:', content)
```

**Expected**: Console shows the markdown content

#### 6. **Test Token Refresh**

```javascript
// Force token expiration
localStorage.setItem('google_token_expires_at', '0')

// Now try any Drive operation - should auto-refresh
import { listFolderFiles } from './src/services/googleDriveService'
const files = await listFolderFiles(team.driveFolderId)

// Check if token was refreshed
showStoredData()
```

**Expected**:
- Operation succeeds
- Console shows: `Access token expired, refreshing...`
- New `expires_at` timestamp shows future date

---

## 🐛 Troubleshooting

### Error: "Not authenticated with Google Drive"

**Cause**: No access token stored

**Fix**:
1. Sign out and sign in again
2. Make sure you click "Allow" on the Google consent screen
3. Check console for error messages during OAuth flow

### Error: "Token exchange failed"

**Cause**: Invalid client secret or redirect URI mismatch

**Fix**:
1. Verify `.env` has correct `VITE_GOOGLE_CLIENT_SECRET`
2. Check Google Cloud Console → Credentials → OAuth 2.0 Client IDs
3. Ensure redirect URI matches: `http://localhost:[PORT]/auth/callback`

### Error: "Failed to create folder"

**Cause**: Token doesn't have Drive scope

**Fix**:
1. Revoke app access: https://myaccount.google.com/permissions
2. Clear all data: `clearAllAuthData()`
3. Sign in again - verify Drive permission is requested

### Folder not appearing in Google Drive

**Check**:
1. Console shows folder ID
2. Go to Drive and search for "Conceptualize"
3. Check if folder is in Trash

### Sharing not working

**Check**:
1. Team member's email is correct
2. Team member has a Google account
3. Check Google Drive sharing settings (sometimes requires accepting invite)

---

## 📊 Verify Everything Works

Run this complete test:

```javascript
// 1. Check auth
showStoredData()

// 2. Create team
import { createTeam } from './src/services/teamService'
const team = await createTeam('Complete Test', 'Full test', 'you@gmail.com', 'You', 'uid')

// 3. Upload file
import { uploadNote } from './src/services/googleDriveService'
await uploadNote(team.driveFolderId, 'test.md', '# Works!')

// 4. List files
import { listFolderFiles } from './src/services/googleDriveService'
const files = await listFolderFiles(team.driveFolderId)
console.log('Files:', files)

// 5. Verify in Firestore
// Go to Firebase Console → Firestore → teams collection
// Should see your team document

// 6. Verify in Google Drive
// Go to https://drive.google.com
// Search for "Conceptualize - Complete Test"
// Should see folder with test.md inside
```

**All green ✅?** You're ready to build the UI!

---

## 🔐 Security Notes

- Tokens are stored in `localStorage` (not ideal for production)
- For production, consider:
  - Encrypting tokens before storing
  - Using IndexedDB instead of localStorage
  - Implementing token rotation
  - Adding PKCE to OAuth flow

---

## 🧪 Reset Everything

After testing, clean up:

```javascript
// Clear all data
clearEverything()

// Delete test team from Firestore manually (Firebase Console)
// Delete test folder from Google Drive manually
```

---

## Next Steps

Once testing is complete:
1. ✅ Build team creation UI
2. ✅ Build team invitation UI
3. ✅ Implement sync engine
4. ✅ Add conflict resolution
