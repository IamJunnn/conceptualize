// Tauri-specific Authentication Service using localhost callback server
import {
  signInWithCredential,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail as firebaseSendPasswordReset,
  sendEmailVerification as firebaseSendEmailVerification,
} from "firebase/auth";
import { doc, getDoc, setDoc, Timestamp, collection, query, where, getDocs, updateDoc, arrayUnion } from "firebase/firestore";
import { auth, db } from "./firebase";
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { storeTokens, clearTokens, getTokens } from './tokenStorage';
import { getErrorMessage } from '../utils/errorUtils';
import {
  saveAccount,
  removeAccount as removeStoredAccount,
  getAccountById,
  setActiveAccountId,
  updateAccountLastUsed,
  StoredAccount,
} from './accountStorage';

// User roles
export type UserRole = "member" | "leader" | "admin";

// User interface
export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  customAvatar?: string; // DiceBear avatar URL chosen by user
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

// Firebase config (from your firebase.ts) - reserved for future use
const _FIREBASE_CONFIG = {
  apiKey: "AIzaSyA2OtESM8gTDehgXdt1OKfjsA40dDYCH6g",
  authDomain: "conceptualize-c9a41.firebaseapp.com",
  projectId: "conceptualize-c9a41",
};
void _FIREBASE_CONFIG;

/**
 * Sign in with Google using system browser and localhost callback
 */
export const signInWithGoogle = async (): Promise<User> => {
  try {
    // Set up listener for OAuth callback FIRST, before starting server
    let unlistenFn: (() => void) | null = null;
    const callbackPromise = new Promise<OAuthCallbackData>((resolve, reject) => {
      listen<OAuthCallbackData>('oauth-callback', (event) => {
        if (unlistenFn) unlistenFn();

        if (event.payload.error) {
          reject(new Error(event.payload.error));
        } else {
          resolve(event.payload);
        }
      }).then(fn => {
        unlistenFn = fn;
      }).catch(err => {
        console.error('Failed to register OAuth callback listener:', err);
        reject(err);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (unlistenFn) unlistenFn();
        reject(new Error('OAuth timeout'));
      }, 300000);
    });

    // Wait a bit to ensure listener is registered
    await new Promise(resolve => setTimeout(resolve, 100));

    // Start the OAuth callback server on localhost
    const port = await invoke<number>('start_oauth_callback_server');

    // Build the OAuth URL
    const redirectUri = `http://localhost:${port}/auth/callback`;
    const state = Math.random().toString(36).substring(7); // Random state for CSRF protection

    // Using Firebase's OAuth endpoint
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', import.meta.env.VITE_GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    // Basic scopes for Firebase Auth (no sensitive scopes to avoid Google verification)
    // TODO: Add 'https://www.googleapis.com/auth/calendar.events' when app is verified by Google
    authUrl.searchParams.set('scope', 'email profile openid');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent'); // Force consent screen to get refresh token every time

    // Open the OAuth URL in system browser
    await invoke('open_oauth_url', { url: authUrl.toString() });

    // Wait for the callback
    const callbackData = await callbackPromise;

    if (!callbackData.code) {
      throw new Error('No authorization code received');
    }

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

    // Store Google Drive tokens for later use
    if (tokens.access_token) {
      // If we have a refresh token (first auth or consent screen), store it
      // Otherwise, try to keep existing refresh token from storage
      const existingTokens = await import('./tokenStorage').then(m => m.getTokens());
      const refreshToken = tokens.refresh_token || existingTokens?.refreshToken || '';

      storeTokens({
        accessToken: tokens.access_token,
        refreshToken: refreshToken,
        expiresAt: Date.now() + (tokens.expires_in * 1000),
      });
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
      const newUserData = {
        email: firebaseUser.email || "",
        displayName: firebaseUser.displayName || "",
        photoURL: firebaseUser.photoURL || "",
        role: "member" as UserRole, // Default role for new users
        createdAt: Timestamp.now(),
        lastLogin: Timestamp.now()
      };

      await setDoc(doc(db, "users", firebaseUser.uid), newUserData);

      // Check for pending team invitations
      await checkAndAcceptPendingInvitations(firebaseUser.email || "", firebaseUser.displayName || "", firebaseUser.photoURL || "");

      userData = newUserData;
    } else {
      // Existing user - get their data and update last login + photoURL
      userData = userDoc.data();

      await setDoc(doc(db, "users", firebaseUser.uid), {
        ...userData,
        photoURL: firebaseUser.photoURL || userData.photoURL || "",
        lastLogin: Timestamp.now()
      });
    }

    const user: User = {
      uid: firebaseUser.uid,
      email: firebaseUser.email || "",
      displayName: firebaseUser.displayName || userData.displayName || "",
      photoURL: firebaseUser.photoURL || userData.photoURL || "",
      role: userData.role as UserRole,
      createdAt: userData.createdAt?.toDate() || new Date(),
      lastLogin: new Date()
    };

    // Save account for multi-account support
    const refreshToken = tokens.refresh_token || (await getTokens())?.refreshToken || '';
    await saveAccount({
      id: firebaseUser.uid,
      email: firebaseUser.email || "",
      displayName: firebaseUser.displayName || userData.displayName || "",
      photoURL: firebaseUser.photoURL || userData.photoURL || "",
      googleRefreshToken: refreshToken,
      lastUsed: Date.now(),
      authMethod: 'google',
    });
    await setActiveAccountId(firebaseUser.uid);

    return user;
  } catch (error) {
    console.error('Sign in error:', error);
    throw new Error(`Sign in failed: ${getErrorMessage(error)}`);
  }
};

/**
 * Sign out current user
 * @param removeFromSaved - If true, removes the account from saved accounts list
 */
export const signOut = async (removeFromSaved = false): Promise<void> => {
  try {
    // Get current user ID before signing out
    const currentUserId = auth.currentUser?.uid;

    // Clear Google Drive tokens
    clearTokens();

    // Sign out from Firebase
    await firebaseSignOut(auth);

    // Clear active account
    await setActiveAccountId(null);

    // Optionally remove from saved accounts
    if (removeFromSaved && currentUserId) {
      await removeStoredAccount(currentUserId);
    }
  } catch (error) {
    throw new Error(`Sign out failed: ${getErrorMessage(error)}`);
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
        await new Promise(resolve => setTimeout(resolve, 1000));
        return getCurrentUser(firebaseUser, retryCount + 1);
      }
      console.error('User document not found after 3 retries');
      return null;
    }

    const userData = userDoc.data();

    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email || "",
      // Prioritize Firestore displayName (user can edit) over Firebase Auth displayName
      displayName: userData.displayName || firebaseUser.displayName || "",
      photoURL: firebaseUser.photoURL || userData.photoURL || "",
      customAvatar: userData.customAvatar || "",
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

/**
 * Helper function to encode email for Firestore field keys
 * IMPORTANT: Must match the encoding in teamService.ts (_DOT_ and _AT_ uppercase)
 */
const encodeEmailKey = (email: string): string => {
  return email.replace(/\./g, '_DOT_').replace(/@/g, '_AT_');
};

/**
 * Sync profile updates (displayName, customAvatar) to all teams the user is a member of
 */
const syncProfileToTeams = async (
  userEmail: string,
  updates: { displayName?: string; customAvatar?: string }
): Promise<void> => {
  try {
    const normalizedEmail = userEmail.toLowerCase();
    const memberEmailKey = encodeEmailKey(normalizedEmail);

    // Query for all teams where this user is a member
    const teamsQuery = query(
      collection(db, 'teams'),
      where('memberEmails', 'array-contains', normalizedEmail)
    );

    const teamsSnapshot = await getDocs(teamsQuery);

    if (teamsSnapshot.empty) {
      console.log(`No teams found for user ${userEmail}`);
      return;
    }

    // Update profile in each team
    const updatePromises = teamsSnapshot.docs.map(async (teamDoc) => {
      const teamId = teamDoc.id;
      const teamUpdates: Record<string, any> = {};

      if (updates.displayName !== undefined) {
        teamUpdates[`members.${memberEmailKey}.displayName`] = updates.displayName;
      }
      if (updates.customAvatar !== undefined) {
        teamUpdates[`members.${memberEmailKey}.customAvatar`] = updates.customAvatar;
      }

      if (Object.keys(teamUpdates).length > 0) {
        await updateDoc(doc(db, 'teams', teamId), teamUpdates);
        console.log(`✅ Synced profile to team ${teamId}`);
      }
    });

    await Promise.all(updatePromises);
    console.log(`✅ Profile synced to ${teamsSnapshot.size} team(s)`);
  } catch (error) {
    // Don't throw - this is a best-effort sync
    console.warn('Failed to sync profile to teams:', getErrorMessage(error));
  }
};

/**
 * Update user's custom avatar
 */
export const updateUserAvatar = async (uid: string, customAvatar: string): Promise<void> => {
  try {
    const userRef = doc(db, "users", uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      throw new Error("User not found");
    }

    const userData = userDoc.data();
    const userEmail = userData.email;

    await setDoc(userRef, {
      ...userData,
      customAvatar
    });

    // Also update the avatar in all teams the user is a member of
    if (userEmail) {
      await syncProfileToTeams(userEmail, { customAvatar });
    }
  } catch (error) {
    console.error("Error updating avatar:", error);
    throw new Error(`Failed to update avatar: ${getErrorMessage(error)}`);
  }
};

/**
 * Update user's display name
 */
export const updateUserDisplayName = async (uid: string, displayName: string): Promise<void> => {
  try {
    const userRef = doc(db, "users", uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      throw new Error("User not found");
    }

    const userData = userDoc.data();
    const userEmail = userData.email;

    await setDoc(userRef, {
      ...userData,
      displayName
    });

    // Also update the display name in all teams the user is a member of
    if (userEmail) {
      await syncProfileToTeams(userEmail, { displayName });
    }
  } catch (error) {
    console.error("Error updating display name:", error);
    throw new Error(`Failed to update display name: ${getErrorMessage(error)}`);
  }
};

/**
 * Check for pending team invitations and auto-accept them
 */
async function checkAndAcceptPendingInvitations(email: string, displayName: string, photoURL?: string): Promise<void> {
  try {
    // Query for pending invitations with this email
    const invitesQuery = query(
      collection(db, 'team_invites'),
      where('memberEmail', '==', email),
      where('status', '==', 'pending')
    );

    const invitesSnapshot = await getDocs(invitesQuery);

    if (invitesSnapshot.empty) {
      return;
    }

    // Auto-accept all pending invitations
    for (const inviteDoc of invitesSnapshot.docs) {
      const invite = inviteDoc.data();

      try {
        // Get the role from the invitation, default to 'member' if not specified
        const role = invite.role || 'member';

        // IMPORTANT: Use encoded email key for Firestore compatibility
        const normalizedEmail = email.toLowerCase();
        const memberEmailKey = encodeEmailKey(normalizedEmail);

        // Add member to team with correct role
        await updateDoc(doc(db, 'teams', invite.teamId), {
          [`members.${memberEmailKey}`]: {
            email: normalizedEmail,
            role: role,
            joinedAt: Timestamp.now(),
            displayName: displayName,
            photoURL: photoURL,
          },
          memberEmails: arrayUnion(normalizedEmail),
        });

        // Update invitation status
        await updateDoc(inviteDoc.ref, {
          status: 'accepted',
          acceptedAt: Timestamp.now(),
        });
      } catch (error) {
        console.error(`Failed to accept invitation to ${invite.teamName}:`, error);
      }
    }
  } catch (error) {
    console.error('Error checking pending invitations:', error);
  }
}

// Dummy function for compatibility - not needed with localhost callback approach
export const checkRedirectResult = async (): Promise<User | null> => {
  return null;
};

/**
 * Sign up with email and password
 */
export const signUpWithEmail = async (email: string, password: string, displayName: string): Promise<User> => {
  try {
    // Create the user in Firebase Auth
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = result.user;

    // Send email verification
    await firebaseSendEmailVerification(firebaseUser);

    // Create user document in Firestore
    const newUserData = {
      email: firebaseUser.email || email,
      displayName: displayName,
      photoURL: "",
      role: "member" as UserRole,
      createdAt: Timestamp.now(),
      lastLogin: Timestamp.now(),
      emailVerified: false,
    };

    await setDoc(doc(db, "users", firebaseUser.uid), newUserData);

    // Check for pending team invitations
    await checkAndAcceptPendingInvitations(email, displayName, "");

    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email || email,
      displayName: displayName,
      photoURL: "",
      role: "member" as UserRole,
      createdAt: new Date(),
      lastLogin: new Date(),
    };
  } catch (error: any) {
    console.error('Sign up error:', error);

    // Provide user-friendly error messages
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('This email is already registered. Please sign in instead.');
    } else if (error.code === 'auth/weak-password') {
      throw new Error('Password is too weak. Please use at least 6 characters.');
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('Please enter a valid email address.');
    }

    throw new Error(`Sign up failed: ${getErrorMessage(error)}`);
  }
};

/**
 * Sign in with email and password
 */
export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = result.user;

    // Get or create user document
    const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));

    let userData;
    if (!userDoc.exists()) {
      // Create user document if it doesn't exist (edge case)
      userData = {
        email: firebaseUser.email || email,
        displayName: firebaseUser.displayName || email.split('@')[0],
        photoURL: "",
        role: "member" as UserRole,
        createdAt: Timestamp.now(),
        lastLogin: Timestamp.now(),
      };
      await setDoc(doc(db, "users", firebaseUser.uid), userData);
    } else {
      userData = userDoc.data();
      // Update last login
      await updateDoc(doc(db, "users", firebaseUser.uid), {
        lastLogin: Timestamp.now(),
        emailVerified: firebaseUser.emailVerified,
      });
    }

    const user: User = {
      uid: firebaseUser.uid,
      email: firebaseUser.email || email,
      displayName: userData.displayName || firebaseUser.displayName || "",
      photoURL: userData.photoURL || "",
      role: userData.role as UserRole,
      createdAt: userData.createdAt?.toDate() || new Date(),
      lastLogin: new Date(),
    };

    // Save account for multi-account support (email accounts don't have refresh tokens)
    await saveAccount({
      id: firebaseUser.uid,
      email: firebaseUser.email || email,
      displayName: userData.displayName || firebaseUser.displayName || "",
      photoURL: userData.photoURL || "",
      lastUsed: Date.now(),
      authMethod: 'email',
    });
    await setActiveAccountId(firebaseUser.uid);

    return user;
  } catch (error: any) {
    console.error('Sign in error:', error);

    // Provide user-friendly error messages
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      throw new Error('Invalid email or password. Please try again.');
    } else if (error.code === 'auth/too-many-requests') {
      throw new Error('Too many failed attempts. Please try again later.');
    } else if (error.code === 'auth/user-disabled') {
      throw new Error('This account has been disabled. Please contact support.');
    }

    throw new Error(`Sign in failed: ${getErrorMessage(error)}`);
  }
};

/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async (email: string): Promise<void> => {
  try {
    await firebaseSendPasswordReset(auth, email);
  } catch (error: any) {
    console.error('Password reset error:', error);

    if (error.code === 'auth/user-not-found') {
      // Don't reveal if email exists for security
      return; // Silently succeed
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('Please enter a valid email address.');
    }

    throw new Error(`Failed to send reset email: ${getErrorMessage(error)}`);
  }
};

/**
 * Resend email verification
 */
export const resendEmailVerification = async (): Promise<void> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No user is currently signed in.');
    }

    if (currentUser.emailVerified) {
      throw new Error('Email is already verified.');
    }

    await firebaseSendEmailVerification(currentUser);
  } catch (error: any) {
    console.error('Email verification error:', error);
    throw new Error(`Failed to send verification email: ${getErrorMessage(error)}`);
  }
};

/**
 * Switch to a different saved account (Google accounts only - instant switch)
 * For email accounts, this will throw REAUTH_REQUIRED
 */
export const switchToAccount = async (accountId: string): Promise<User> => {
  try {
    // Get stored account data
    const account = await getAccountById(accountId);
    if (!account) {
      throw new Error('Account not found in saved accounts');
    }

    // Email accounts require re-authentication
    if (account.authMethod === 'email') {
      throw new Error('REAUTH_REQUIRED');
    }

    // Google accounts - use refresh token to get new tokens
    if (!account.googleRefreshToken) {
      throw new Error('REAUTH_REQUIRED');
    }

    console.log('Switching to account:', account.email);

    // Use refresh token to get new access_token + id_token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        client_secret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
        refresh_token: account.googleRefreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token refresh failed:', errorText);
      // Token expired/revoked - need full re-auth
      throw new Error('REAUTH_REQUIRED');
    }

    const tokens = await tokenResponse.json();

    // Store new tokens in localStorage
    storeTokens({
      accessToken: tokens.access_token,
      refreshToken: account.googleRefreshToken, // Keep the same refresh token
      expiresAt: Date.now() + (tokens.expires_in * 1000),
    });

    // Create Firebase credential from id_token
    const credential = GoogleAuthProvider.credential(tokens.id_token);

    // Sign into Firebase
    const result = await signInWithCredential(auth, credential);
    const firebaseUser = result.user;

    // Get user data from Firestore
    const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};

    // Update last login
    await updateDoc(doc(db, "users", firebaseUser.uid), {
      lastLogin: Timestamp.now(),
    });

    // Update stored account with fresh data (including photoURL) and set as active
    await saveAccount({
      id: firebaseUser.uid,
      email: firebaseUser.email || account.email,
      displayName: userData.displayName || firebaseUser.displayName || account.displayName,
      photoURL: firebaseUser.photoURL || userData.photoURL || "",
      customAvatar: userData.customAvatar || "",
      googleRefreshToken: account.googleRefreshToken,
      lastUsed: Date.now(),
      authMethod: 'google',
    });
    await setActiveAccountId(accountId);

    console.log('Successfully switched to account:', account.email);

    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email || "",
      displayName: userData.displayName || firebaseUser.displayName || "",
      photoURL: firebaseUser.photoURL || userData.photoURL || "",
      customAvatar: userData.customAvatar || "",
      role: (userData.role as UserRole) || "member",
      createdAt: userData.createdAt?.toDate() || new Date(),
      lastLogin: new Date(),
    };
  } catch (error: any) {
    console.error('Account switch error:', error);

    // Re-throw REAUTH_REQUIRED as-is
    if (error.message === 'REAUTH_REQUIRED') {
      throw error;
    }

    throw new Error(`Failed to switch account: ${getErrorMessage(error)}`);
  }
};

// Re-export StoredAccount type for use in other modules
export type { StoredAccount };
