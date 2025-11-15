// Authentication Service
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser
} from "firebase/auth";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase";

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

/**
 * Sign in with Google
 * Checks if user is authorized in Firestore
 */
export const signInWithGoogle = async (): Promise<User> => {
  try {
    // Sign in with Google popup
    const result = await signInWithPopup(auth, googleProvider);
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
