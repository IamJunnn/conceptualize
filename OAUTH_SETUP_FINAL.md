# Google OAuth Setup - Final Configuration Guide

## Overview

The app now uses a **localhost callback server** approach for OAuth authentication:

1. User clicks "Sign in with Google"
2. App starts a local HTTP server on `http://localhost:8080`
3. App opens the **system browser** with Google OAuth URL
4. User signs in with Google in the browser
5. Google redirects back to `http://localhost:8080/auth/callback`
6. App receives the authorization code and exchanges it for tokens
7. App completes Firebase authentication
8. Browser shows success message and closes automatically ✅

## Required: Google Cloud Console Configuration

### Step 1: Get Your OAuth Client Secret

You need to get the **OAuth client secret** from Google Cloud Console:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: **conceptualize-5e234**
3. Navigate to **APIs & Services** → **Credentials**
4. Click on your **OAuth 2.0 Client ID**
5. Copy the **Client secret** (it looks like `GOCSPX-xxxxxxxxxxxxxxxxxxxxx`)
6. Save this - you'll need to add it to the code (see below)

### Step 2: Configure Authorized Redirect URIs

In the same OAuth 2.0 Client ID settings:

1. Under **Authorized JavaScript origins**, add:
   ```
   http://localhost:5173
   http://localhost
   http://localhost:8080
   ```

2. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:8080/auth/callback
   http://localhost:5173/__/auth/handler
   ```

3. Click **Save**

### Step 3: Firebase Console - Authorized Domains

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **conceptualize-5e234**
3. Navigate to **Authentication** → **Settings** → **Authorized domains**
4. Make sure these are added:
   - `localhost`
   - `127.0.0.1`

## Required: Add OAuth Client Secret to Code

⚠️ **Important**: You must add the OAuth client secret to the code:

1. Open `src/services/authServiceTauri.ts`
2. Find line 106: `client_secret: 'GOCSPX-your-client-secret',`
3. Replace `'GOCSPX-your-client-secret'` with your actual client secret from Step 1

Example:
```typescript
client_secret: 'GOCSPX-AbCdEf123456789',  // Replace with your actual secret
```

### Better: Use Environment Variables (Recommended)

Instead of hardcoding the secret:

1. Create a `.env` file in the project root:
   ```env
   VITE_GOOGLE_CLIENT_SECRET=GOCSPX-your-actual-secret-here
   ```

2. Update `src/services/authServiceTauri.ts` line 106:
   ```typescript
   client_secret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
   ```

3. Add `.env` to `.gitignore` (don't commit secrets!)

## How It Works

### The OAuth Flow:

```
┌─────────────┐
│   Desktop   │
│     App     │
└──────┬──────┘
       │ 1. Click "Sign in"
       ▼
┌──────────────────┐
│ Start localhost  │
│ server :8080     │
└──────┬───────────┘
       │ 2. Open browser
       ▼
┌──────────────────┐
│ System Browser   │
│ (Chrome/Edge)    │
└──────┬───────────┘
       │ 3. User signs in
       ▼
┌──────────────────┐
│ Google OAuth     │
│ Redirect to      │
│ localhost:8080   │
└──────┬───────────┘
       │ 4. Send auth code
       ▼
┌──────────────────┐
│ Localhost server │
│ receives code    │
└──────┬───────────┘
       │ 5. Exchange for tokens
       ▼
┌──────────────────┐
│ Firebase Auth    │
│ Complete sign-in │
└──────────────────┘
```

### Files Changed:

1. **Backend (Rust)**:
   - `src-tauri/Cargo.toml` - Added `warp`, `opener`, `url` dependencies
   - `src-tauri/src/oauth.rs` - New module for OAuth callback server
   - `src-tauri/src/lib.rs` - Registered OAuth commands

2. **Frontend (TypeScript)**:
   - `src/services/authServiceTauri.ts` - Complete rewrite using localhost approach
   - `src/components/Auth/LoginScreen.tsx` - Simplified, removed redirect check

## Testing

### Prerequisites:
1. ✅ Google Cloud OAuth redirect URIs configured
2. ✅ OAuth client secret added to code
3. ✅ Firebase authorized domains configured
4. ✅ Test user added to Firestore `users` collection

### Steps:

1. **Rebuild the app** (required for Rust changes):
   ```bash
   npm run tauri dev
   ```

2. **Switch to Team mode** in the app

3. **Click "Sign in with Google"**:
   - Your default browser should open
   - You'll see Google's sign-in page
   - Sign in with your Google account
   - Browser will show "Authentication Successful!"
   - Browser tab closes automatically after 3 seconds
   - App completes authentication

4. **Check console logs** for any errors

### Expected Behavior:

✅ Browser opens to Google OAuth
✅ After signing in, see success page
✅ Browser closes automatically
✅ App shows authenticated state

### Troubleshooting:

**Error: "Token exchange failed"**
- Make sure you added the OAuth client secret (see Step 3 above)
- Verify the client secret is correct

**Error: "redirect_uri_mismatch"**
- Check that `http://localhost:8080/auth/callback` is in Google Cloud Console
- Make sure you clicked "Save" after adding it

**Error: "User not authorized"**
- Add the user to Firestore `users` collection
- Make sure the document ID matches the Firebase Auth UID

**Browser doesn't open**
- Check console for errors
- Make sure `opener` crate is installed (should be automatic)

**Timeout error**
- The OAuth flow times out after 5 minutes
- Try again and complete sign-in faster

## Security Considerations

### Current Issues:
⚠️ OAuth client secret is in frontend code (can be extracted)
⚠️ Firebase API keys are hardcoded

### Recommendations for Production:

1. **Use a backend server** to handle token exchange
   - Keep client secret on the server
   - Frontend only receives the final Firebase token

2. **Implement PKCE** (Proof Key for Code Exchange)
   - More secure for public clients
   - Doesn't require client secret

3. **Use environment variables** for all secrets
   - Never commit secrets to git
   - Use different credentials for dev/prod

4. **Add domain restrictions** in Google Cloud Console
   - Restrict which domains can use your OAuth client
   - Add email domain restrictions if needed

5. **Rotate credentials** if they've been exposed
   - The current Firebase keys are in the git history
   - Consider creating a new Firebase project for production

## Alternative: Development-Only Bypass

If OAuth setup is too complex for development, you can add a development bypass:

```typescript
// In LoginScreen.tsx
const handleDevBypass = async () => {
  if (import.meta.env.DEV) {
    // Create a mock user for development
    onLoginSuccess();
  }
};
```

## Next Steps

1. ✅ Get OAuth client secret from Google Cloud Console
2. ✅ Add client secret to `authServiceTauri.ts`
3. ✅ Configure redirect URIs in Google Cloud Console
4. ✅ Test the OAuth flow
5. ⚠️ Consider security improvements for production
6. ⚠️ Move secrets to environment variables

## Support

If you encounter issues:
1. Check browser console (F12) for detailed errors
2. Check app console for backend errors
3. Verify all configuration steps are complete
4. Review the OAuth flow diagram to understand where it's failing
