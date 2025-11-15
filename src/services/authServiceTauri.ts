// Tauri-specific Authentication Service using localhost callback server
import {
  signInWithCredential,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser
} from "firebase/auth";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

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
    authUrl.searchParams.set('prompt', 'select_account');

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

    // Store Google Drive tokens for later use
    if (tokens.access_token && tokens.refresh_token) {
      localStorage.setItem('google_access_token', tokens.access_token);
      localStorage.setItem('google_refresh_token', tokens.refresh_token);
      localStorage.setItem('google_token_expires_at', (Date.now() + (tokens.expires_in * 1000)).toString());
      console.log('✅ Stored Google Drive tokens');
    }

    // Create Firebase credential from Google token
    const credential = GoogleAuthProvider.credential(tokens.id_token);
    const result = await signInWithCredential(auth, credential);
    const firebaseUser = result.user;

    // Check if user exists and is authorized in Firestore
    const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));

    if (!userDoc.exists()) {
      // User not authorized - sign them out
      await firebaseSignOut(auth);
      throw new Error("UNAUTHORIZED: Contact your administrator to get access.");
    }

    // Get user data from Firestore
    const userData = userDoc.data();

    // Update last login
    await setDoc(doc(db, "users", firebaseUser.uid), {
      ...userData,
      lastLogin: Timestamp.now()
    });

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
    if (error.message?.includes("UNAUTHORIZED")) {
      throw error;
    }
    throw new Error(`Sign in failed: ${error.message}`);
  }
};

/**
 * Sign out current user
 */
export const signOut = async (): Promise<void> => {
  try {
    await firebaseSignOut(auth);
  } catch (error: any) {
    throw new Error(`Sign out failed: ${error.message}`);
  }
};

/**
 * Get current user from Firestore
 */
export const getCurrentUser = async (firebaseUser: FirebaseUser): Promise<User | null> => {
  try {
    const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));

    if (!userDoc.exists()) {
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
    if (firebaseUser) {
      const user = await getCurrentUser(firebaseUser);
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

// Dummy function for compatibility - not needed with localhost callback approach
export const checkRedirectResult = async (): Promise<User | null> => {
  return null;
};
