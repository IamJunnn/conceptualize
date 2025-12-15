/**
 * Background Service
 * Manages team and user video call backgrounds
 * Stores backgrounds in Firebase Storage and metadata in Firestore
 */

import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db, storage } from './firebase';
import { invalidateStorageCache } from './storageTrackingService';

export interface UserBackground {
  id: string;
  name: string;
  url: string;
  size: number;
  createdAt: Date;
}

export interface TeamBackgroundSettings {
  backgroundUrl: string | null;
  backgroundName: string | null;
  updatedAt: Date;
  updatedBy: string;
}

// ============================================================================
// TEAM BACKGROUNDS (Admin/Owner only)
// ============================================================================

/**
 * Get the team's brand background URL
 */
export async function getTeamBackground(teamId: string): Promise<string | null> {
  try {
    const teamDoc = await getDoc(doc(db, 'teams', teamId));
    if (!teamDoc.exists()) return null;

    const data = teamDoc.data();
    return data?.brandBackground?.url || null;
  } catch (error) {
    console.error('Failed to get team background:', error);
    return null;
  }
}

/**
 * Upload a team brand background (Admin/Owner only)
 */
export async function uploadTeamBackground(
  teamId: string,
  file: File,
  uploaderEmail: string
): Promise<string> {
  try {
    // Validate file
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      throw new Error('Only PNG and JPG files are allowed');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File size must be less than 10MB');
    }

    // Delete existing background if any
    const existingUrl = await getTeamBackground(teamId);
    if (existingUrl) {
      try {
        // Try to delete old file from storage
        const existingRef = ref(storage, `teams/${teamId}/brand-background`);
        await deleteObject(existingRef);
      } catch {
        // Ignore if file doesn't exist
      }
    }

    // Upload new background
    const storageRef = ref(storage, `teams/${teamId}/brand-background`);
    const snapshot = await uploadBytes(storageRef, file);
    const url = await getDownloadURL(snapshot.ref);

    // Update team document
    await updateDoc(doc(db, 'teams', teamId), {
      brandBackground: {
        url,
        name: file.name,
        size: file.size,
        updatedAt: Timestamp.now(),
        updatedBy: uploaderEmail,
      },
    });

    // Invalidate storage cache so it recalculates
    invalidateStorageCache(teamId);

    return url;
  } catch (error) {
    console.error('Failed to upload team background:', error);
    throw error;
  }
}

/**
 * Delete the team's brand background (Admin/Owner only)
 */
export async function deleteTeamBackground(teamId: string): Promise<void> {
  try {
    // Delete from storage
    const storageRef = ref(storage, `teams/${teamId}/brand-background`);
    try {
      await deleteObject(storageRef);
    } catch {
      // Ignore if file doesn't exist
    }

    // Update team document
    await updateDoc(doc(db, 'teams', teamId), {
      brandBackground: null,
    });

    // Invalidate storage cache so it recalculates
    invalidateStorageCache(teamId);
  } catch (error) {
    console.error('Failed to delete team background:', error);
    throw error;
  }
}

// ============================================================================
// USER BACKGROUNDS (Individual)
// ============================================================================

/**
 * Get all backgrounds uploaded by a user
 */
export async function getUserBackgrounds(
  teamId: string,
  userEmail: string
): Promise<UserBackground[]> {
  try {
    const encodedEmail = encodeEmailForPath(userEmail);
    const bgCollection = collection(db, 'teams', teamId, 'userBackgrounds', encodedEmail, 'backgrounds');
    const snapshot = await getDocs(bgCollection);

    const backgrounds: UserBackground[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      backgrounds.push({
        id: doc.id,
        name: data.name,
        url: data.url,
        size: data.size,
        createdAt: data.createdAt?.toDate() || new Date(),
      });
    });

    // Sort by newest first
    backgrounds.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return backgrounds;
  } catch (error) {
    console.error('Failed to get user backgrounds:', error);
    return [];
  }
}

/**
 * Upload a user's personal background
 */
export async function uploadUserBackground(
  teamId: string,
  userEmail: string,
  file: File
): Promise<UserBackground> {
  try {
    // Validate file
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      throw new Error('Only PNG and JPG files are allowed');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File size must be less than 10MB');
    }

    const encodedEmail = encodeEmailForPath(userEmail);
    const backgroundId = generateId();

    // Upload to storage
    const storageRef = ref(storage, `teams/${teamId}/userBackgrounds/${encodedEmail}/${backgroundId}`);
    const snapshot = await uploadBytes(storageRef, file);
    const url = await getDownloadURL(snapshot.ref);

    // Save metadata to Firestore
    const bgDoc = doc(db, 'teams', teamId, 'userBackgrounds', encodedEmail, 'backgrounds', backgroundId);
    const backgroundData = {
      name: file.name,
      url,
      size: file.size,
      createdAt: Timestamp.now(),
    };
    await setDoc(bgDoc, backgroundData);

    // Invalidate storage cache so it recalculates
    invalidateStorageCache(teamId);

    return {
      id: backgroundId,
      name: file.name,
      url,
      size: file.size,
      createdAt: new Date(),
    };
  } catch (error) {
    console.error('Failed to upload user background:', error);
    throw error;
  }
}

/**
 * Delete a user's personal background
 */
export async function deleteUserBackground(
  teamId: string,
  userEmail: string,
  backgroundId: string
): Promise<void> {
  try {
    const encodedEmail = encodeEmailForPath(userEmail);
    const bgDocRef = doc(db, 'teams', teamId, 'userBackgrounds', encodedEmail, 'backgrounds', backgroundId);

    // Delete from storage
    const storageRef = ref(storage, `teams/${teamId}/userBackgrounds/${encodedEmail}/${backgroundId}`);
    try {
      await deleteObject(storageRef);
    } catch {
      // Ignore if file doesn't exist
    }

    // Delete from Firestore
    await deleteDoc(bgDocRef);

    // Invalidate storage cache so it recalculates
    invalidateStorageCache(teamId);
  } catch (error) {
    console.error('Failed to delete user background:', error);
    throw error;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Encode email for use in storage paths
 */
function encodeEmailForPath(email: string): string {
  return email.replace(/[.@]/g, '_');
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
