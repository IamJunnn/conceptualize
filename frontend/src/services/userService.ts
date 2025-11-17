// User Management Service (Admin only)
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp
} from "firebase/firestore";
import { db } from "./firebase";
import { User, UserRole } from "./authServiceTauri";

export interface UserData {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: Date;
  createdBy: string;
  lastLogin?: Date;
}

/**
 * Get all users (Admin only)
 */
export const getAllUsers = async (): Promise<UserData[]> => {
  try {
    const usersQuery = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(usersQuery);

    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        uid: doc.id,
        email: data.email,
        displayName: data.displayName,
        role: data.role as UserRole,
        createdAt: data.createdAt?.toDate() || new Date(),
        createdBy: data.createdBy,
        lastLogin: data.lastLogin?.toDate()
      };
    });
  } catch (error: any) {
    throw new Error(`Failed to get users: ${error.message}`);
  }
};

/**
 * Add a new user (Admin only)
 * Note: User must sign in with Google first to get their UID
 * This function authorizes them in the system
 */
export const addUser = async (
  email: string,
  displayName: string,
  role: UserRole,
  createdByUid: string
): Promise<void> => {
  try {
    // Generate a temporary UID based on email
    // The real UID will be set when user signs in with Google
    const tempUid = email.replace(/[^a-zA-Z0-9]/g, '_');

    await setDoc(doc(db, "users", tempUid), {
      email,
      displayName,
      role,
      createdAt: Timestamp.now(),
      createdBy: createdByUid,
      isTemporary: true // Flag to identify pre-authorized users
    });
  } catch (error: any) {
    throw new Error(`Failed to add user: ${error.message}`);
  }
};

/**
 * Update user role (Admin only)
 */
export const updateUserRole = async (uid: string, role: UserRole): Promise<void> => {
  try {
    const userRef = doc(db, "users", uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      throw new Error("User not found");
    }

    await setDoc(userRef, {
      ...userDoc.data(),
      role,
      updatedAt: Timestamp.now()
    });
  } catch (error: any) {
    throw new Error(`Failed to update user role: ${error.message}`);
  }
};

/**
 * Remove user (Admin only)
 */
export const removeUser = async (uid: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, "users", uid));
  } catch (error: any) {
    throw new Error(`Failed to remove user: ${error.message}`);
  }
};

/**
 * Check if user exists by email
 */
export const getUserByEmail = async (email: string): Promise<UserData | null> => {
  try {
    const usersQuery = query(collection(db, "users"));
    const querySnapshot = await getDocs(usersQuery);

    const userDoc = querySnapshot.docs.find(doc => doc.data().email === email);

    if (!userDoc) {
      return null;
    }

    const data = userDoc.data();
    return {
      uid: userDoc.id,
      email: data.email,
      displayName: data.displayName,
      role: data.role as UserRole,
      createdAt: data.createdAt?.toDate() || new Date(),
      createdBy: data.createdBy,
      lastLogin: data.lastLogin?.toDate()
    };
  } catch (error) {
    console.error("Error getting user by email:", error);
    return null;
  }
};
