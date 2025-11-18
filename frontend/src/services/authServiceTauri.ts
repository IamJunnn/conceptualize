// Tauri-specific Authentication Service using localhost callback server
import {
  signInWithCredential,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser
} from "firebase/auth";
import { doc, getDoc, setDoc, Timestamp, collection, query, where, getDocs, updateDoc, arrayUnion } from "firebase/firestore";
import { auth, db } from "./firebase";
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { storeTokens, getTokenDebugInfo, clearTokens } from './tokenStorage';

// User roles
export type UserRole = "employee" | "leader" | "admin";

// User interface
export interface User {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: Date;
  lastLogin: Date;
}

// OAuth callback data from Tauri
interface OAuthCallbackData {
  code?: string;
  state?: string;
  error?: string;
}

// Firebase config (from your firebase.ts)
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA2OtESM8gTDehgXdt1OKfjsA40dDYCH6g",
  authDomain: "conceptualize-c9a41.firebaseapp.com",
  projectId: "conceptualize-c9a41",
};

/**
 * Sign in with Google using system browser and localhost callback
 */
export const signInWithGoogle = async (): Promise<User> => {
  try {
    console.log('🚀 Starting Google sign-in flow...');
    console.log('🔑 Client ID:', import.meta.env.VITE_GOOGLE_CLIENT_ID ? 'EXISTS' : 'MISSING');
    console.log('🔑 Client Secret:', import.meta.env.VITE_GOOGLE_CLIENT_SECRET ? 'EXISTS' : 'MISSING');

    // Set up listener for OAuth callback FIRST, before starting server
    let unlistenFn: (() => void) | null = null;
    const callbackPromise = new Promise<OAuthCallbackData>((resolve, reject) => {
      listen<OAuthCallbackData>('oauth-callback', (event) => {
        console.log('✅ Frontend received OAuth callback event!', event.payload);
        if (unlistenFn) unlistenFn();

        if (event.payload.error) {
          reject(new Error(event.payload.error));
        } else {
          resolve(event.payload);
        }
      }).then(fn => {
        unlistenFn = fn;
        console.log('👂 OAuth callback listener registered in frontend');
      }).catch(err => {
        console.error('❌ Failed to register OAuth callback listener:', err);
        reject(err);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        console.log('⏱️ OAuth timeout reached');
        if (unlistenFn) unlistenFn();
        reject(new Error('OAuth timeout'));
      }, 300000);
    });

    // Wait a bit to ensure listener is registered
    await new Promise(resolve => setTimeout(resolve, 100));

    // Start the OAuth callback server on localhost
    const port = await invoke<number>('start_oauth_callback_server');
    console.log('🌐 OAuth callback server started on port:', port);

    // Build the OAuth URL
    const redirectUri = `http://localhost:${port}/auth/callback`;
    const state = Math.random().toString(36).substring(7); // Random state for CSRF protection

    // Using Firebase's OAuth endpoint
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', import.meta.env.VITE_GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'email profile openid https://www.googleapis.com/auth/drive.file');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent'); // Force consent screen to get refresh token every time

    // Open the OAuth URL in system browser
    await invoke('open_oauth_url', { url: authUrl.toString() });
    console.log('🌍 Opened OAuth URL in system browser, waiting for callback...');

    // Wait for the callback
    const callbackData = await callbackPromise;

    if (!callbackData.code) {
      throw new Error('No authorization code received');
    }

    console.log('Received authorization code, exchanging for tokens...');

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code: callbackData.code,
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        client_secret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokens = await tokenResponse.json();
    console.log('Received tokens, signing in to Firebase...');
    console.log('🔍 Token details:', {
      has_access_token: !!tokens.access_token,
      has_refresh_token: !!tokens.refresh_token,
      has_id_token: !!tokens.id_token,
      expires_in: tokens.expires_in,
      token_type: tokens.token_type
    });

    // Store Google Drive tokens for later use
    if (tokens.access_token) {
      // If we have a refresh token (first auth or consent screen), store it
      // Otherwise, try to keep existing refresh token from storage
      const existingTokens = await import('./tokenStorage').then(m => m.getTokens());
      const refreshToken = tokens.refresh_token || existingTokens?.refreshToken || '';

      if (tokens.refresh_token) {
        console.log('✅ Received new refresh token from Google');
      } else if (existingTokens?.refreshToken) {
        console.log('⚠️ No new refresh token - using existing one from storage');
      } else {
        console.warn('⚠️ No refresh token available - Google Drive operations may fail when token expires');
        console.log('💡 To get a refresh token: Sign out and sign in again (consent screen will appear)');
      }

      storeTokens({
        accessToken: tokens.access_token,
        refreshToken: refreshToken,
        expiresAt: Date.now() + (tokens.expires_in * 1000),
      });

      // Debug: verify tokens were stored
      const debugInfo = getTokenDebugInfo();
      console.log('📊 Token storage debug:', debugInfo);
    }

    // Create Firebase credential from Google token
    const credential = GoogleAuthProvider.credential(tokens.id_token);
    const result = await signInWithCredential(auth, credential);
    const firebaseUser = result.user;

    // Check if user exists in Firestore
    const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));

    let userData;

    if (!userDoc.exists()) {
      // New user - create their account automatically
      console.log('📝 Creating new user account in Firestore...');

      const newUserData = {
        email: firebaseUser.email || "",
        displayName: firebaseUser.displayName || "",
        role: "employee" as UserRole, // Default role for new users
        createdAt: Timestamp.now(),
        lastLogin: Timestamp.now()
      };

      await setDoc(doc(db, "users", firebaseUser.uid), newUserData);
      console.log('✅ New user account created successfully!');

      // Check for pending team invitations
      await checkAndAcceptPendingInvitations(firebaseUser.email || "", firebaseUser.displayName || "");

      userData = newUserData;
    } else {
      // Existing user - get their data and update last login
      userData = userDoc.data();

      await setDoc(doc(db, "users", firebaseUser.uid), {
        ...userData,
        lastLogin: Timestamp.now()
      });
    }

    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email || "",
      displayName: firebaseUser.displayName || userData.displayName || "",
      role: userData.role as UserRole,
      createdAt: userData.createdAt?.toDate() || new Date(),
      lastLogin: new Date()
    };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw new Error(`Sign in failed: ${error.message}`);
  }
};

/**
 * Sign out current user
 */
export const signOut = async (): Promise<void> => {
  try {
    // Clear Google Drive tokens
    clearTokens();
    // Sign out from Firebase
    await firebaseSignOut(auth);
  } catch (error: any) {
    throw new Error(`Sign out failed: ${error.message}`);
  }
};

/**
 * Get current user from Firestore
 */
export const getCurrentUser = async (firebaseUser: FirebaseUser, retryCount = 0): Promise<User | null> => {
  try {
    const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));

    if (!userDoc.exists()) {
      // Retry up to 3 times with 1 second delay (for new user creation race condition)
      if (retryCount < 3) {
        console.log(`⏳ User document not found, retrying in 1 second... (attempt ${retryCount + 1}/3)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return getCurrentUser(firebaseUser, retryCount + 1);
      }
      console.error('❌ User document not found after 3 retries');
      return null;
    }

    const userData = userDoc.data();

    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email || "",
      displayName: firebaseUser.displayName || userData.displayName || "",
      role: userData.role as UserRole,
      createdAt: userData.createdAt?.toDate() || new Date(),
      lastLogin: userData.lastLogin?.toDate() || new Date()
    };
  } catch (error) {
    console.error("Error getting current user:", error);
    return null;
  }
};

/**
 * Listen to authentication state changes
 */
export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    console.log('🔥 Firebase auth state changed:', firebaseUser ? `UID: ${firebaseUser.uid}, Email: ${firebaseUser.email}` : 'No user');
    if (firebaseUser) {
      const user = await getCurrentUser(firebaseUser);
      console.log('👤 getCurrentUser result:', user ? `Email: ${user.email}, Role: ${user.role}` : 'null');
      callback(user);
    } else {
      callback(null);
    }
  });
};

/**
 * Check if current user has admin role
 */
export const isAdmin = (user: User | null): boolean => {
  return user?.role === "admin";
};

/**
 * Check if current user has leader or admin role
 */
export const isLeaderOrAdmin = (user: User | null): boolean => {
  return user?.role === "leader" || user?.role === "admin";
};

/**
 * Check for pending team invitations and auto-accept them
 */
async function checkAndAcceptPendingInvitations(email: string, displayName: string): Promise<void> {
  try {
    console.log(`🔍 Checking for pending invitations for ${email}...`);

    // Query for pending invitations with this email
    const invitesQuery = query(
      collection(db, 'team_invites'),
      where('memberEmail', '==', email),
      where('status', '==', 'pending')
    );

    const invitesSnapshot = await getDocs(invitesQuery);

    if (invitesSnapshot.empty) {
      console.log('📭 No pending invitations found');
      return;
    }

    console.log(`📬 Found ${invitesSnapshot.size} pending invitation(s)`);

    // Auto-accept all pending invitations
    for (const inviteDoc of invitesSnapshot.docs) {
      const invite = inviteDoc.data();
      console.log(`✅ Auto-accepting invitation to team: ${invite.teamName}`);

      try {
        // Get the role from the invitation, default to 'member' if not specified
        const role = invite.role || 'member';

        // Add member to team with correct role
        await updateDoc(doc(db, 'teams', invite.teamId), {
          [`members.${email}`]: {
            email: email,
            role: role,
            joinedAt: Timestamp.now(),
            displayName: displayName,
          },
          memberEmails: arrayUnion(email),
        });

        // Update invitation status
        await updateDoc(inviteDoc.ref, {
          status: 'accepted',
          acceptedAt: Timestamp.now(),
        });

        console.log(`✅ Successfully joined team: ${invite.teamName} as ${role}`);
      } catch (error) {
        console.error(`❌ Failed to accept invitation to ${invite.teamName}:`, error);
      }
    }
  } catch (error) {
    console.error('❌ Error checking pending invitations:', error);
  }
}

// Dummy function for compatibility - not needed with localhost callback approach
export const checkRedirectResult = async (): Promise<User | null> => {
  return null;
};
