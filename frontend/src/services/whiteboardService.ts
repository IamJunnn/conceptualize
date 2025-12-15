/**
 * Whiteboard Service
 * Manages whiteboard CRUD operations for team collaboration
 * Uses Firebase Firestore for whiteboard metadata and data storage
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { TLEditorSnapshot } from 'tldraw';
import { db, storage } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  Whiteboard,
  WhiteboardMeta,
  WhiteboardPresence,
  CreateWhiteboardInput,
  UpdateWhiteboardInput,
  getUserPresenceColor,
} from './whiteboardTypes';

// Collection paths
const getWhiteboardsCollection = (teamId: string) =>
  collection(db, 'teams', teamId, 'whiteboards');

const getWhiteboardDoc = (teamId: string, whiteboardId: string) =>
  doc(db, 'teams', teamId, 'whiteboards', whiteboardId);

const getPresenceCollection = (teamId: string, whiteboardId: string) =>
  collection(db, 'teams', teamId, 'whiteboards', whiteboardId, 'presence');

const getPresenceDoc = (teamId: string, whiteboardId: string, userId: string) =>
  doc(db, 'teams', teamId, 'whiteboards', whiteboardId, 'presence', userId);

/**
 * Upload an image to Firebase Storage for a whiteboard
 * Returns the download URL
 */
export async function uploadWhiteboardImage(
  teamId: string,
  whiteboardId: string,
  imageBlob: Blob,
  fileName: string
): Promise<string> {
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `teams/${teamId}/whiteboards/${whiteboardId}/images/${timestamp}_${sanitizedFileName}`;

  console.log('[WHITEBOARD] Uploading image to:', storagePath);
  console.log('[WHITEBOARD] Image blob size:', imageBlob.size, 'bytes, type:', imageBlob.type);

  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, imageBlob);
  console.log('[WHITEBOARD] Upload complete, getting download URL...');

  const downloadURL = await getDownloadURL(storageRef);
  console.log('[WHITEBOARD] Download URL generated:', downloadURL);

  // Verify the URL is accessible
  try {
    const testResponse = await fetch(downloadURL, { method: 'HEAD' });
    console.log('[WHITEBOARD] URL accessibility test:', testResponse.ok ? 'SUCCESS' : `FAILED (${testResponse.status})`);
  } catch (error) {
    console.error('[WHITEBOARD] URL accessibility test failed:', error);
  }

  return downloadURL;
}

/**
 * Download an image from Firebase Storage with authentication
 * Fetches the image with auth tokens and returns a blob URL
 */
export async function downloadWhiteboardImage(firebaseUrl: string): Promise<string> {
  try {
    // Fetch the image from Firebase Storage with credentials
    const response = await fetch(firebaseUrl, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    // Convert to blob
    const blob = await response.blob();

    // Create a temporary object URL
    const objectUrl = URL.createObjectURL(blob);

    return objectUrl;
  } catch (error) {
    console.error('Failed to download image:', error);
    throw error;
  }
}

/**
 * Convert data URL to Blob
 */
export function dataURLtoBlob(dataURL: string): Blob {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Generate a unique "Untitled" name for a new whiteboard
 * Returns "Untitled", "Untitled (1)", "Untitled (2)", etc.
 */
export function generateUntitledName(existingNames: string[]): string {
  const baseName = 'Untitled';

  // Check if "Untitled" is already taken
  if (!existingNames.includes(baseName)) {
    return baseName;
  }

  // Find the next available number
  let counter = 1;
  while (existingNames.includes(`${baseName} (${counter})`)) {
    counter++;
  }

  return `${baseName} (${counter})`;
}

/**
 * Create a new whiteboard with auto-generated "Untitled" name
 */
export async function createUntitledWhiteboard(
  teamId: string,
  createdBy: string,
  createdByName: string
): Promise<Whiteboard> {
  // Get existing whiteboard names
  const existingWhiteboards = await getTeamWhiteboards(teamId);
  const existingNames = existingWhiteboards.map(wb => wb.name);

  // Generate unique name
  const name = generateUntitledName(existingNames);

  return createWhiteboard({
    name,
    teamId,
    createdBy,
    createdByName,
  });
}

/**
 * Create a new whiteboard
 */
export async function createWhiteboard(input: CreateWhiteboardInput): Promise<Whiteboard> {
  const whiteboardRef = doc(getWhiteboardsCollection(input.teamId));
  const now = new Date();

  const whiteboard: Whiteboard = {
    id: whiteboardRef.id,
    teamId: input.teamId,
    name: input.name,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(whiteboardRef, {
    ...whiteboard,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  return whiteboard;
}

/**
 * Get a single whiteboard by ID
 */
export async function getWhiteboard(teamId: string, whiteboardId: string): Promise<Whiteboard | null> {
  const whiteboardRef = getWhiteboardDoc(teamId, whiteboardId);
  const snapshot = await getDoc(whiteboardRef);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  return {
    id: snapshot.id,
    teamId: data.teamId,
    name: data.name,
    createdBy: data.createdBy,
    createdByName: data.createdByName,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    thumbnail: data.thumbnail,
    data: data.data,
  };
}

/**
 * Get all whiteboards for a team (metadata only)
 */
export async function getTeamWhiteboards(teamId: string): Promise<WhiteboardMeta[]> {
  const whiteboardsRef = getWhiteboardsCollection(teamId);
  const q = query(whiteboardsRef, orderBy('updatedAt', 'desc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      teamId: data.teamId,
      name: data.name,
      createdBy: data.createdBy,
      createdByName: data.createdByName,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      thumbnail: data.thumbnail,
    };
  });
}

/**
 * Subscribe to whiteboards list (real-time updates)
 */
export function subscribeToWhiteboards(
  teamId: string,
  callback: (whiteboards: WhiteboardMeta[]) => void
): () => void {
  const whiteboardsRef = getWhiteboardsCollection(teamId);
  const q = query(whiteboardsRef, orderBy('updatedAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const whiteboards = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        teamId: data.teamId,
        name: data.name,
        createdBy: data.createdBy,
        createdByName: data.createdByName,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        thumbnail: data.thumbnail,
      };
    });
    callback(whiteboards);
  });
}

/**
 * Subscribe to a single whiteboard (real-time updates)
 */
export function subscribeToWhiteboard(
  teamId: string,
  whiteboardId: string,
  callback: (whiteboard: Whiteboard | null) => void
): () => void {
  const whiteboardRef = getWhiteboardDoc(teamId, whiteboardId);

  return onSnapshot(whiteboardRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }

    const data = snapshot.data();
    callback({
      id: snapshot.id,
      teamId: data.teamId,
      name: data.name,
      createdBy: data.createdBy,
      createdByName: data.createdByName,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      thumbnail: data.thumbnail,
      data: data.data,
    });
  });
}

/**
 * Update whiteboard metadata or data
 */
export async function updateWhiteboard(
  teamId: string,
  whiteboardId: string,
  updates: UpdateWhiteboardInput
): Promise<void> {
  const whiteboardRef = getWhiteboardDoc(teamId, whiteboardId);

  await updateDoc(whiteboardRef, {
    ...updates,
    updatedAt: Timestamp.fromDate(new Date()),
  });
}

/**
 * Save whiteboard document data (tldraw snapshot)
 */
export async function saveWhiteboardData(
  teamId: string,
  whiteboardId: string,
  data: TLEditorSnapshot,
  thumbnail?: string
): Promise<void> {
  const whiteboardRef = getWhiteboardDoc(teamId, whiteboardId);

  const updates: Record<string, unknown> = {
    data,
    updatedAt: Timestamp.fromDate(new Date()),
  };

  if (thumbnail) {
    updates.thumbnail = thumbnail;
  }

  await updateDoc(whiteboardRef, updates);
}

/**
 * Rename whiteboard
 */
export async function renameWhiteboard(
  teamId: string,
  whiteboardId: string,
  newName: string
): Promise<void> {
  const whiteboardRef = getWhiteboardDoc(teamId, whiteboardId);

  await updateDoc(whiteboardRef, {
    name: newName,
    updatedAt: Timestamp.fromDate(new Date()),
  });
}

/**
 * Delete whiteboard
 */
export async function deleteWhiteboard(teamId: string, whiteboardId: string): Promise<void> {
  const batch = writeBatch(db);

  // Delete presence subcollection first
  const presenceRef = getPresenceCollection(teamId, whiteboardId);
  const presenceSnapshot = await getDocs(presenceRef);
  presenceSnapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  // Delete the whiteboard document
  const whiteboardRef = getWhiteboardDoc(teamId, whiteboardId);
  batch.delete(whiteboardRef);

  await batch.commit();
}

/**
 * Duplicate whiteboard
 */
export async function duplicateWhiteboard(
  teamId: string,
  whiteboardId: string,
  newName: string,
  userId: string,
  userName: string
): Promise<Whiteboard> {
  // Get the original whiteboard
  const original = await getWhiteboard(teamId, whiteboardId);
  if (!original) {
    throw new Error('Whiteboard not found');
  }

  // Create a new whiteboard with the same data
  const newWhiteboard = await createWhiteboard({
    name: newName,
    teamId,
    createdBy: userId,
    createdByName: userName,
  });

  // Copy the data if exists
  if (original.data) {
    await saveWhiteboardData(teamId, newWhiteboard.id, original.data);
  }

  return newWhiteboard;
}

// ============ Presence Functions ============

/**
 * Update user presence on whiteboard
 */
export async function updatePresence(
  teamId: string,
  whiteboardId: string,
  userId: string,
  userName: string,
  cursor: { x: number; y: number } | null
): Promise<void> {
  const presenceRef = getPresenceDoc(teamId, whiteboardId, userId);

  const presence: WhiteboardPresence = {
    userId,
    userName,
    userColor: getUserPresenceColor(userId),
    cursor,
    lastActive: new Date(),
  };

  await setDoc(presenceRef, {
    ...presence,
    lastActive: Timestamp.fromDate(presence.lastActive),
  });
}

/**
 * Remove user presence from whiteboard
 */
export async function removePresence(
  teamId: string,
  whiteboardId: string,
  userId: string
): Promise<void> {
  const presenceRef = getPresenceDoc(teamId, whiteboardId, userId);
  await deleteDoc(presenceRef);
}

/**
 * Subscribe to presence updates on whiteboard
 */
export function subscribeToPresence(
  teamId: string,
  whiteboardId: string,
  callback: (presence: WhiteboardPresence[]) => void
): () => void {
  const presenceRef = getPresenceCollection(teamId, whiteboardId);

  return onSnapshot(presenceRef, (snapshot) => {
    const presenceList = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        userId: data.userId,
        userName: data.userName,
        userColor: data.userColor,
        cursor: data.cursor,
        lastActive: data.lastActive?.toDate() || new Date(),
      };
    });

    // Filter out stale presence (older than 30 seconds)
    const now = new Date();
    const activePresence = presenceList.filter(
      (p) => now.getTime() - p.lastActive.getTime() < 30000
    );

    callback(activePresence);
  });
}

/**
 * Clean up stale presence entries
 */
export async function cleanupStalePresence(
  teamId: string,
  whiteboardId: string
): Promise<void> {
  const presenceRef = getPresenceCollection(teamId, whiteboardId);
  const snapshot = await getDocs(presenceRef);

  const now = new Date();
  const batch = writeBatch(db);

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const lastActive = data.lastActive?.toDate() || new Date(0);
    // Remove presence older than 1 minute
    if (now.getTime() - lastActive.getTime() > 60000) {
      batch.delete(doc.ref);
    }
  });

  await batch.commit();
}

// ============ Export/Extract Functions ============

/**
 * Generate markdown from whiteboard content
 */
export function generateMarkdownFromWhiteboard(
  whiteboard: Whiteboard,
  options: {
    convertLinksToWikiLinks: boolean;
    includeEmbeddedContent: boolean;
  }
): string {
  const lines: string[] = [];

  lines.push(`# ${whiteboard.name}`);
  lines.push('');

  // If no data, return just the title
  if (!whiteboard.data) {
    lines.push('*Empty whiteboard*');
    lines.push('');
    lines.push(`---`);
    lines.push(`*Extracted from whiteboard "${whiteboard.name}" on ${new Date().toLocaleDateString()}*`);
    return lines.join('\n');
  }

  // Extract shapes from tldraw data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshotData = whiteboard.data as any;
  const store = snapshotData?.document?.store || snapshotData?.store;
  if (store) {
    // Get text shapes
    const textShapes: Array<{ id: string; text: string; x: number; y: number }> = [];
    const noteShapes: Array<{ id: string; text: string; x: number; y: number }> = [];
    const arrows: Array<{ fromId: string; toId: string; label?: string }> = [];

    Object.entries(store).forEach(([_id, shape]: [string, unknown]) => {
      const s = shape as Record<string, unknown>;
      if (s.typeName === 'shape') {
        const shapeType = s.type as string;
        const props = s.props as Record<string, unknown>;

        if (shapeType === 'text' && props?.text) {
          textShapes.push({
            id: s.id as string,
            text: props.text as string,
            x: s.x as number,
            y: s.y as number,
          });
        } else if (shapeType === 'note' && props?.text) {
          noteShapes.push({
            id: s.id as string,
            text: props.text as string,
            x: s.x as number,
            y: s.y as number,
          });
        } else if (shapeType === 'arrow') {
          const start = props?.start as Record<string, unknown>;
          const end = props?.end as Record<string, unknown>;
          if (start?.boundShapeId && end?.boundShapeId) {
            arrows.push({
              fromId: start.boundShapeId as string,
              toId: end.boundShapeId as string,
              label: props?.text as string,
            });
          }
        }
      }
    });

    // Sort by position (top to bottom, left to right)
    const allItems = [...textShapes, ...noteShapes].sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > 50) return yDiff;
      return a.x - b.x;
    });

    // Output items
    allItems.forEach((item) => {
      lines.push(`## ${item.text.split('\n')[0]}`);
      if (item.text.includes('\n')) {
        lines.push('');
        lines.push(item.text.split('\n').slice(1).join('\n'));
      }
      lines.push('');

      // Find connections from this item
      if (options.convertLinksToWikiLinks) {
        const connections = arrows.filter((a) => a.fromId === item.id);
        if (connections.length > 0) {
          const linkedItems = connections
            .map((c) => {
              const target = allItems.find((i) => i.id === c.toId);
              if (target) {
                const linkText = target.text.split('\n')[0];
                return `[[${linkText}]]`;
              }
              return null;
            })
            .filter(Boolean);

          if (linkedItems.length > 0) {
            lines.push(`→ Links to: ${linkedItems.join(', ')}`);
            lines.push('');
          }
        }
      }
    });
  }

  lines.push('---');
  lines.push(`*Extracted from whiteboard "${whiteboard.name}" on ${new Date().toLocaleDateString()}*`);

  return lines.join('\n');
}
