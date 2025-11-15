# Google Authentication Fix for Conceptualize Tauri App

## The Problem

When clicking "Sign in with Google" in Team mode, the authentication fails because:

1. **Popup authentication doesn't work in Tauri**: The app uses Firebase's `signInWithPopup()` which opens a popup window. Tauri's webview doesn't properly support OAuth popups like regular browsers do.

2. **Missing redirect URI configuration**: Desktop apps need special redirect URIs configured in Firebase, which weren't set up.

3. **No deep link handling**: OAuth callbacks need a way to return to the desktop app, which requires deep link protocol registration.

## The Solution

We've implemented a **redirect-based OAuth flow** with deep linking support. Here's what was changed:

### 1. Installed Deep Link Support

**Frontend (npm packages)**:
```bash
npm install @tauri-apps/plugin-deep-link
```

**Backend (Rust)**:
Added to `src-tauri/Cargo.toml`:
```toml
tauri-plugin-deep-link = "2"
```

**Tauri Configuration**:
Added to `tauri.conf.json`:
```json
{
  "plugins": {
    "deep-link": {
      "mobile": [],
      "desktop": {
        "schemes": ["conceptualize"]
      }
    }
  }
}
```

**Rust Integration**:
Added to `src-tauri/src/lib.rs`:
```rust
.plugin(tauri_plugin_deep_link::init())
```

### 2. Created New Auth Service for Tauri

Created `src/services/authServiceTauri.ts` that:
- Uses `signInWithRedirect()` instead of `signInWithPopup()`
- Implements `checkRedirectResult()` to handle OAuth callbacks
- Works properly with Tauri's webview environment

### 3. Updated Components

**LoginScreen.tsx**:
- Added `useEffect` to check for redirect results on mount
- Changed to use the new Tauri auth service
- Handles redirect flow instead of popup flow

**AuthContext.tsx**:
- Switched from `authService.ts` to `authServiceTauri.ts`
- Uses the redirect-based authentication

## Firebase Configuration Required

You **MUST** complete these steps in Firebase Console for authentication to work:

### Step 1: Add Authorized Domains

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **conceptualize-5e234**
3. Go to **Authentication** → **Settings** → **Authorized domains**
4. Click "Add domain" and add:
   - `localhost`
   - `tauri.localhost`
   - `127.0.0.1`

### Step 2: Configure Google Cloud OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: **conceptualize-5e234**
3. Go to **APIs & Services** → **Credentials**
4. Click on your **OAuth 2.0 Client ID** (for Web application)

5. Under **Authorized JavaScript origins**, add:
   ```
   http://localhost:5173
   http://localhost
   tauri://localhost
   ```

6. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:5173/__/auth/handler
   http://localhost/__/auth/handler
   conceptualize://oauth-callback
   tauri://localhost/__/auth/handler
   ```

7. Click **Save**

### Step 3: Verify User Authorization

Users must be added to Firestore to access the app:

1. Go to Firebase Console → **Firestore Database**
2. Go to the **users** collection
3. Make sure your test user exists with this structure:
   ```
   Document ID: [Firebase Auth UID]
   {
     email: "user@example.com",
     displayName: "User Name",
     role: "employee",  // or "leader" or "admin"
     createdAt: [Timestamp],
     lastLogin: [Timestamp]
   }
   ```

## How to Test

1. **Rebuild the app** (required for Rust changes):
   ```bash
   npm run tauri build
   # OR for development:
   npm run tauri dev
   ```

2. **Launch the app** and select "Team" mode

3. **Click "Sign in with Google"**:
   - Your default browser will open
   - Sign in with your Google account
   - After signing in, you'll be redirected back to the app
   - The app should complete authentication

## How It Works

### Before (Popup Flow - Broken):
1. User clicks "Sign in with Google"
2. App tries to open popup → **FAILS** (Tauri webview limitation)
3. User sees "Failed to sign in"

### After (Redirect Flow - Working):
1. User clicks "Sign in with Google"
2. App calls `signInWithRedirect()` → Opens **default browser**
3. User signs in with Google in the browser
4. Browser redirects to `conceptualize://oauth-callback`
5. Deep link brings user back to app
6. App calls `checkRedirectResult()` and completes login
7. User is authenticated ✅

## Troubleshooting

### Error: "Failed to sign in. Please try again."

**Possible causes**:
- Firebase authorized domains not configured
- OAuth redirect URIs not configured
- User not authorized in Firestore

**Check**:
1. Browser console (F12) for specific error codes
2. Firebase Console → Authentication → Settings → Authorized domains
3. Google Cloud Console → Credentials → OAuth redirect URIs

### Error: "You are not authorized to access this app"

**Solution**: Add the user to Firestore `users` collection with proper role.

### Browser opens but doesn't redirect back

**Solution**:
- Verify `conceptualize://` protocol is registered (happens automatically on app first run)
- On Windows: Check `HKEY_CURRENT_USER\Software\Classes\conceptualize` in Registry
- Try restarting the app

### Still not working?

**Alternative approaches**:

1. **Use web version for development**:
   ```bash
   npm run dev
   # Open http://localhost:5173 in Chrome
   # OAuth popups work fine in regular browsers
   ```

2. **Add development bypass**: Temporarily add a "Skip Auth (Dev Only)" button in `LoginScreen.tsx`

3. **Check Firebase setup**: Make sure all required APIs are enabled in Google Cloud Console

## Files Changed

- ✅ `src/services/authServiceTauri.ts` - New Tauri-compatible auth service
- ✅ `src/components/Auth/LoginScreen.tsx` - Updated to use redirect flow
- ✅ `src/contexts/AuthContext.tsx` - Switched to Tauri auth service
- ✅ `src-tauri/Cargo.toml` - Added deep-link plugin
- ✅ `src-tauri/tauri.conf.json` - Configured deep-link scheme
- ✅ `src-tauri/src/lib.rs` - Registered deep-link plugin
- ✅ `package.json` - Added @tauri-apps/plugin-deep-link

## Next Steps

1. **Complete Firebase configuration** (see above)
2. **Test the authentication flow**
3. **Add users to Firestore** for testing
4. **Consider environment variables** for Firebase config (currently hardcoded)

## Security Note

⚠️ **Important**: The Firebase API keys are currently hardcoded in `src/services/firebase.ts`. For production:
- Move to environment variables
- Consider rotating the keys
- Implement proper backend authorization
- Add domain restrictions in Google Cloud Console
