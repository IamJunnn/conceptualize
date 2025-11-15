# Authentication Fix Checklist

## ✅ Fixed Issues

1. **Firebase Project Configuration Mismatch** - FIXED
   - Updated `authServiceTauri.ts` to use correct project: `conceptualize-c9a41`
   - Now matches `firebase.ts` configuration

2. **Google Cloud OAuth Configuration** - CONFIRMED CORRECT
   - Client ID: `549066711560-lnsaqugfnbldudoilvmkl0r4dqjogjes.apps.googleusercontent.com`
   - Authorized JavaScript origins: ✅ `http://localhost:5173`, `http://localhost:8080`
   - Authorized redirect URIs: ✅ `http://localhost:8080/auth/callback`, `http://localhost:5173/__/auth/handler`

3. **Environment Variables** - CONFIRMED CORRECT
   - `.env` file has matching Client ID and Client Secret

## 🔍 Things to Verify in Firebase Console

Go to Firebase Console: https://console.firebase.google.com/project/conceptualize-c9a41

### 1. Enable Google Sign-In Method
   - Go to **Authentication** → **Sign-in method**
   - Ensure **Google** is **ENABLED**
   - Should show as "Enabled" with a green checkmark

### 2. Add Authorized Domains
   - Go to **Authentication** → **Settings** → **Authorized domains**
   - Verify these domains are added:
     - ✅ `localhost`
     - ✅ `127.0.0.1`
     - Add if missing: `tauri.localhost`

### 3. Create Test User in Firestore (CRITICAL!)

   The app checks if users exist in Firestore before allowing login. You need to manually add your test user:

   **Steps:**
   1. Go to **Firestore Database**
   2. Start collection (if not exists): `users`
   3. Add document with **Document ID = Your Firebase Auth UID**
   4. Add fields:
      ```
      email: "your-email@gmail.com"
      displayName: "Your Name"
      role: "admin"
      createdAt: [Current timestamp]
      lastLogin: [Current timestamp]
      ```

   **To get your Firebase Auth UID:**
   - First, try signing in (it will fail with "UNAUTHORIZED")
   - Go to Firebase Console → **Authentication** → **Users** tab
   - Copy the **User UID** of your account
   - Then create the Firestore document with that UID

## 🧪 Testing the Fix

1. **Rebuild the app** (required for Rust changes if any):
   ```bash
   npm run tauri dev
   ```

2. **Test sign-in flow**:
   - Switch to "Team" mode in the app
   - Click "Sign in with Google"
   - Your default browser should open
   - Sign in with your Google account
   - Browser should show "Authentication Successful!" page
   - Browser should redirect back to the app
   - App should complete sign-in

## 🐛 Troubleshooting

### Issue: "Failed to sign in"
- Check browser console (F12) for error messages
- Check the Tauri app console output for logs starting with 🚀, 🌐, ✅, or ❌

### Issue: "UNAUTHORIZED: Contact your administrator"
- This means you signed in successfully but aren't in the Firestore `users` collection
- Add yourself following step 3 above

### Issue: Browser doesn't redirect back to app
- Verify the OAuth callback server started (look for log: "🌐 OAuth callback server started on port: 8080")
- Try manually closing the browser tab and checking if the app updated

### Issue: "Token exchange failed"
- Your Google Client Secret might be incorrect
- Verify `.env` file has the correct `VITE_GOOGLE_CLIENT_SECRET`
- Check Google Cloud Console → Credentials → Your OAuth Client → Client Secret

## 📋 Quick Debug Commands

Check if deep-link plugin is working:
```bash
npm ls @tauri-apps/plugin-deep-link
```

Check Rust OAuth module compiles:
```bash
cd src-tauri && cargo check
```

## 🔐 Security Notes

- The Firebase API key in `firebase.ts` is public and safe to commit
- The Google Client Secret in `.env` should NOT be committed (add to .gitignore)
- For production, use environment variables instead of hardcoded credentials
- Consider rotating your Google Client Secret if it was exposed publicly

## ✨ What Changed

**File: `src/services/authServiceTauri.ts`**
- Line 36-38: Updated Firebase config to match `conceptualize-c9a41` project
- This ensures OAuth tokens are validated against the correct Firebase project

## 📞 Need Help?

If authentication still doesn't work after following this checklist:

1. Check Tauri console logs for error messages
2. Check browser console (F12) for network errors
3. Verify Google Cloud Console settings match this document
4. Check Firebase Console Authentication logs for failed attempts
5. Ensure your Google account email is authorized in Firestore
