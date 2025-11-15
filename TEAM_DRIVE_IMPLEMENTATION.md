# Team Collaboration with Google Drive - Implementation Guide

## 🔑 How User A Creates a Folder in Their Google Drive

### The Key Concept
**The app uses User A's Google access token to create folders in User A's Drive on their behalf.**

---

## 📋 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: User A Opens Conceptualize                          │
│ - Already signed in with Firebase (userA@example.com)       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 2: User A Clicks "Create Team"                         │
│ - Enters team name: "Marketing Team"                        │
│ - Clicks "Create"                                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 3: App Checks for Google Drive Token                   │
│                                                              │
│ Query PostgreSQL:                                            │
│   SELECT google_access_token, token_expires_at              │
│   FROM user_tokens                                           │
│   WHERE email = 'userA@example.com'                         │
│                                                              │
│ Result: NO TOKEN FOUND (first time)                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 4: Show "Connect Google Drive" Dialog                  │
│                                                              │
│ ╔════════════════════════════════════════════╗              │
│ ║  Connect Your Google Drive                 ║              │
│ ║                                            ║              │
│ ║  To create teams and sync notes, you need ║              │
│ ║  to connect your Google Drive account.    ║              │
│ ║                                            ║              │
│ ║  We'll create a team folder in your Drive. ║              │
│ ║                                            ║              │
│ ║  [Connect Google Drive] [Cancel]          ║              │
│ ╚════════════════════════════════════════════╝              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 5: User A Clicks "Connect Google Drive"                │
│                                                              │
│ App starts OAuth flow with Drive scope:                     │
│                                                              │
│ const authUrl = 'https://accounts.google.com/o/oauth2/auth' │
│ Params:                                                      │
│   - client_id: YOUR_GOOGLE_CLIENT_ID                        │
│   - redirect_uri: http://localhost:8080/callback            │
│   - scope: email profile openid                             │
│            https://www.googleapis.com/auth/drive.file       │
│   - response_type: code                                     │
│   - access_type: offline (gets refresh_token)               │
│                                                              │
│ Opens system browser with this URL                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 6: Google Shows Consent Screen                         │
│                                                              │
│ ╔════════════════════════════════════════════╗              │
│ ║  Conceptualize wants to access:            ║              │
│ ║                                            ║              │
│ ║  ✓ See your email address                 ║              │
│ ║  ✓ See your personal info                 ║              │
│ ║  ✓ See, create, and delete files it       ║              │
│ ║    created in Google Drive                 ║              │
│ ║                                            ║              │
│ ║  Signed in as: userA@example.com          ║              │
│ ║                                            ║              │
│ ║  [Cancel]           [Allow]                ║              │
│ ╚════════════════════════════════════════════╝              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 7: User A Clicks "Allow"                               │
│                                                              │
│ Google redirects to:                                         │
│ http://localhost:8080/callback?code=4/0AY0e-g7X...         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 8: App Exchanges Code for Tokens                       │
│                                                              │
│ POST https://oauth2.googleapis.com/token                    │
│ Body:                                                        │
│   code: "4/0AY0e-g7X..."                                    │
│   client_id: YOUR_CLIENT_ID                                 │
│   client_secret: YOUR_CLIENT_SECRET                         │
│   grant_type: authorization_code                            │
│                                                              │
│ Response:                                                    │
│ {                                                            │
│   "access_token": "ya29.a0AfH6SMB...",  ← USE THIS!        │
│   "refresh_token": "1//0gXY...",        ← SAVE THIS!       │
│   "expires_in": 3600,                                       │
│   "scope": "email profile drive.file",                      │
│   "token_type": "Bearer"                                    │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 9: Save Tokens to PostgreSQL                           │
│                                                              │
│ INSERT INTO user_tokens (                                   │
│   email,                                                     │
│   google_access_token,                                      │
│   google_refresh_token,                                     │
│   token_expires_at,                                         │
│   scopes                                                     │
│ ) VALUES (                                                   │
│   'userA@example.com',                                      │
│   'ya29.a0AfH6SMB...',                                      │
│   '1//0gXY...',                                             │
│   NOW() + INTERVAL '1 hour',                                │
│   ARRAY['email', 'profile', 'drive.file']                   │
│ )                                                            │
│                                                              │
│ ✅ Now we can act on behalf of User A!                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 10: Create Folder in User A's Google Drive             │
│                                                              │
│ 1. Get User A's access token from database                  │
│                                                              │
│ 2. Call Google Drive API:                                   │
│                                                              │
│    POST https://www.googleapis.com/drive/v3/files           │
│    Headers:                                                  │
│      Authorization: Bearer ya29.a0AfH6SMB...  ← USER A's!  │
│      Content-Type: application/json                         │
│                                                              │
│    Body:                                                     │
│    {                                                         │
│      "name": "Conceptualize - Marketing Team",             │
│      "mimeType": "application/vnd.google-apps.folder"      │
│    }                                                         │
│                                                              │
│ 3. Google creates folder in User A's Drive!                 │
│                                                              │
│ 4. Response:                                                 │
│    {                                                         │
│      "id": "1aB2cD3eF4gH5iJ6kL",  ← SAVE THIS!            │
│      "name": "Conceptualize - Marketing Team",             │
│      "mimeType": "application/vnd.google-apps.folder",     │
│      "webViewLink": "https://drive.google.com/..."         │
│    }                                                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 11: Save Team to PostgreSQL                            │
│                                                              │
│ INSERT INTO teams (                                          │
│   team_id,                                                   │
│   name,                                                      │
│   drive_folder_id,                                          │
│   drive_owner_email,                                        │
│   owner_user_id                                             │
│ ) VALUES (                                                   │
│   'team_abc123',                                            │
│   'Marketing Team',                                         │
│   '1aB2cD3eF4gH5iJ6kL',  ← Links to Drive folder!         │
│   'userA@example.com',                                      │
│   123                                                        │
│ )                                                            │
│                                                              │
│ INSERT INTO team_members (                                  │
│   team_id, user_id, email, role                            │
│ ) VALUES (                                                   │
│   (SELECT id FROM teams WHERE team_id='team_abc123'),      │
│   123,                                                      │
│   'userA@example.com',                                     │
│   'owner'                                                   │
│ )                                                            │
│                                                              │
│ ✅ Team created successfully!                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 12: Show Success to User A                             │
│                                                              │
│ ╔════════════════════════════════════════════╗              │
│ ║  ✅ Team Created!                          ║              │
│ ║                                            ║              │
│ ║  "Marketing Team" has been created.       ║              │
│ ║                                            ║              │
│ ║  Folder location:                          ║              │
│ ║  My Drive / Conceptualize - Marketing Team ║              │
│ ║                                            ║              │
│ ║  [Invite Members] [Open Team]             ║              │
│ ╚════════════════════════════════════════════╝              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 When User A Invites User B

```
User A clicks "Invite Member" → Enters userB@example.com
                            ↓
App gets User A's token from PostgreSQL
                            ↓
App calls Google Drive API to share folder:

POST https://www.googleapis.com/drive/v3/files/{folderId}/permissions
Headers:
  Authorization: Bearer ya29.a0AfH6SMB...  ← USER A's token!

Body:
{
  "type": "user",
  "role": "writer",
  "emailAddress": "userB@example.com",
  "sendNotificationEmail": true
}
                            ↓
Google shares folder with userB@example.com
Google sends email to User B: "userA@example.com shared a folder with you"
                            ↓
App creates invitation in PostgreSQL:

INSERT INTO team_invitations (
  team_id, invitee_email, invited_by_user_id, status
) VALUES (
  (SELECT id FROM teams WHERE team_id='team_abc123'),
  'userB@example.com',
  123,
  'pending'
)
                            ↓
✅ User B can now see the folder in their Google Drive!
```

---

## 🔄 When User B Accepts Invite

```
User B opens Conceptualize
                            ↓
User B signs in with Firebase (userB@example.com)
                            ↓
App checks for pending invites:

SELECT * FROM team_invitations
WHERE invitee_email = 'userB@example.com'
  AND status = 'pending'
                            ↓
App shows: "You have 1 team invitation!"
                            ↓
User B clicks "Accept"
                            ↓
App prompts: "Connect your Google Drive to access team files"
                            ↓
User B goes through OAuth flow (Steps 4-9 above)
                            ↓
Now User B has their own access_token stored
                            ↓
App checks if User B can access the shared folder:

GET https://www.googleapis.com/drive/v3/files/{folderId}
Headers:
  Authorization: Bearer <USER B's token>

Response: ✅ 200 OK (User B has access!)
                            ↓
App adds User B to team members:

INSERT INTO team_members (
  team_id, user_id, email, role
) VALUES (
  (SELECT id FROM teams WHERE team_id='team_abc123'),
  456,  ← User B's ID
  'userB@example.com',
  'member'
)
                            ↓
Update invitation status:

UPDATE team_invitations
SET status = 'accepted', responded_at = NOW()
WHERE team_id = (SELECT id FROM teams WHERE team_id='team_abc123')
  AND invitee_email = 'userB@example.com'
                            ↓
✅ User B is now a team member!
✅ User B can see "Marketing Team" in their app
✅ When User B creates notes, app uses User B's token to read/write to User A's folder
```

---

## 🔐 Security: How Tokens Work

### Access Token (Short-lived)
- **Lifespan**: 1 hour
- **Purpose**: Actually makes API calls to Drive
- **Storage**: PostgreSQL (encrypted recommended)
- **Usage**: Include in `Authorization: Bearer <token>` header

### Refresh Token (Long-lived)
- **Lifespan**: Doesn't expire (unless revoked)
- **Purpose**: Get new access tokens when they expire
- **Storage**: PostgreSQL (encrypted!)
- **Usage**: Exchange for new access_token when old one expires

### Token Refresh Flow
```typescript
// When making Drive API call
async function callDriveAPI(userEmail: string) {
  // 1. Get stored token
  let token = await getAccessToken(userEmail);

  // 2. Check if expired
  if (isTokenExpired(token)) {
    // 3. Refresh it
    token = await refreshAccessToken(userEmail);
  }

  // 4. Use it
  return fetch('https://www.googleapis.com/drive/v3/files', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

async function refreshAccessToken(userEmail: string) {
  const refreshToken = await getRefreshToken(userEmail);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: YOUR_CLIENT_ID,
      client_secret: YOUR_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  const { access_token, expires_in } = await response.json();

  // Save new access token
  await updateAccessToken(userEmail, access_token, expires_in);

  return access_token;
}
```

---

## 📊 Database State Example

### After User A creates team:

**user_tokens**
| id | email | google_access_token | google_refresh_token | token_expires_at |
|----|-------|---------------------|---------------------|------------------|
| 1 | userA@example.com | ya29.a0AfH6... | 1//0gXY... | 2025-01-15 14:30 |

**teams**
| id | team_id | name | drive_folder_id | drive_owner_email | owner_user_id |
|----|---------|------|----------------|------------------|--------------|
| 1 | team_abc123 | Marketing Team | 1aB2cD3eF4gH | userA@example.com | 123 |

**team_members**
| id | team_id | user_id | email | role |
|----|---------|---------|-------|------|
| 1 | 1 | 123 | userA@example.com | owner |

### After User B accepts:

**user_tokens**
| id | email | google_access_token | google_refresh_token | token_expires_at |
|----|-------|---------------------|---------------------|------------------|
| 1 | userA@example.com | ya29.a0AfH6... | 1//0gXY... | 2025-01-15 14:30 |
| 2 | userB@example.com | ya29.a0AfB8... | 1//0pQR... | 2025-01-15 15:00 |

**team_members**
| id | team_id | user_id | email | role |
|----|---------|---------|-------|------|
| 1 | 1 | 123 | userA@example.com | owner |
| 2 | 1 | 456 | userB@example.com | member |

---

## 💡 Key Insights

1. **Each user has their own access token** - stored in `user_tokens` table
2. **The folder lives in User A's Drive** - but User B can access it because it's shared
3. **When User B uploads a file**, the app uses **User B's token** to write to **User A's folder**
4. **Google handles permissions** - You just manage tokens and folder IDs
5. **PostgreSQL is the source of truth** - Maps teams → Drive folders → Tokens

---

## 🚀 Next Steps

1. **Implement OAuth flow** in Tauri (extend existing authServiceTauri.ts)
2. **Create token management** (store, refresh, retrieve from PostgreSQL)
3. **Build Google Drive service** (create folder, share, upload/download)
4. **Create team UI** (create team modal, invite members, team list)
5. **Build sync engine** (watch local changes, sync to Drive)

Would you like me to start implementing any of these?
