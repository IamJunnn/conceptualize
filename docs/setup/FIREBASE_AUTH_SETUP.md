# Firebase Authentication Setup for Tauri Desktop App

## Problem
Google OAuth popup authentication doesn't work in Tauri desktop applications because:
- Tauri uses a webview, not a full browser
- OAuth popups require specific browser capabilities
- Redirect URIs need to be properly configured for desktop apps

## Solution
We've switched from popup-based auth to redirect-based auth with deep linking support.

## Firebase Console Configuration

### 1. Add Authorized Domains

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `conceptualize-5e234`
3. Navigate to **Authentication** → **Settings** → **Authorized domains**
4. Add the following domains:
   - `localhost` (for development)
   - `tauri.localhost` (for Tauri apps)
   - `127.0.0.1` (for development)

### 2. Configure OAuth Consent Screen (Google Cloud Console)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project: `conceptualize-5e234`
3. Navigate to **APIs & Services** → **OAuth consent screen**
4. Add authorized domains:
   - `localhost`
   - Any production domains you'll use

### 3. Configure OAuth 2.0 Client ID

1. In Google Cloud Console, go to **APIs & Services** → **Credentials**
2. Find your OAuth 2.0 Client ID (or create one for Web application)
3. Add **Authorized JavaScript origins**:
   ```
   http://localhost:5173
   http://localhost
   https://localhost
   tauri://localhost
   http://tauri.localhost
   ```

4. Add **Authorized redirect URIs**:
   ```
   http://localhost:5173/__/auth/handler
   http://localhost/__/auth/handler
   conceptualize://oauth-callback
   tauri://localhost/__/auth/handler
   ```

### 4. Enable Required APIs

Make sure these are enabled in Google Cloud Console:
- Identity Toolkit API
- Cloud Firestore API
- Firebase Authentication API

## Code Changes Made

### 1. Created Tauri-Specific Auth Service
- New file: `src/services/authServiceTauri.ts`
- Uses `signInWithRedirect()` instead of `signInWithPopup()`
- Handles redirect results with `checkRedirectResult()`

### 2. Updated Components
- `LoginScreen.tsx`: Now checks for redirect results on mount
- `AuthContext.tsx`: Uses the new Tauri auth service

### 3. Added Deep Link Support
- Installed `@tauri-apps/plugin-deep-link`
- Added Rust dependency: `tauri-plugin-deep-link = "2"`
- Configured deep link scheme: `conceptualize://`

### 4. Tauri Configuration
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

## Testing the Fix

1. **Build and run the app**:
   ```bash
   npm run tauri dev
   ```

2. **Switch to Team mode** from the mode selection screen

3. **Click "Sign in with Google"**:
   - The app will open your default browser for Google sign-in
   - After signing in, the browser will redirect back to the app
   - The app should complete the authentication

## Troubleshooting

### Issue: "Failed to sign in" error
**Solution**: Check browser console for specific error codes:
- `auth/unauthorized-domain`: Add your domain to Firebase authorized domains
- `auth/popup-blocked`: Normal - we're using redirect flow now
- `auth/redirect-cancelled-by-user`: User cancelled the sign-in

### Issue: Redirect doesn't return to app
**Solution**:
1. Verify deep link scheme is registered: `conceptualize://`
2. Check that redirect URI matches in Firebase Console
3. On Windows, check registry for protocol handler registration

### Issue: "User not authorized" after signing in
**Solution**: Add the user to Firestore:
1. Go to Firebase Console → Firestore Database
2. Create a document in the `users` collection:
   ```
   Document ID: [user's Firebase UID]
   Fields:
   - email: "user@example.com"
   - displayName: "User Name"
   - role: "employee" (or "leader" or "admin")
   - createdAt: [Timestamp - now]
   - lastLogin: [Timestamp - now]
   ```

## Alternative: Simple Development Workaround

If Firebase setup is too complex for development, consider:

1. **Option A**: Use the web version in a regular browser
   - Run `npm run dev`
   - Open http://localhost:5173 in Chrome/Firefox
   - Google OAuth will work normally

2. **Option B**: Add development bypass
   - Add a "Skip Auth (Dev Only)" button for local testing
   - Only enable in development mode

3. **Option C**: Use Firebase Emulator Suite
   - Run Firebase Authentication locally
   - No cloud configuration needed for development

## Security Notes

- Never commit Firebase credentials to git (they're already in the code, consider rotating)
- Use environment variables for sensitive config in production
- Implement proper user authorization checks on the backend
- Consider adding email domain restrictions in Google OAuth settings
