// Presence tracking service using Firestore
import { db } from './firebase';
import {
  doc,
  setDoc,
  onSnapshot,
  collection,
  serverTimestamp,
  deleteDoc
} from 'firebase/firestore';

// Consider user online if last seen within 2 minutes
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
// Update presence every 30 seconds
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

export interface UserPresence {
  email: string;
  lastSeen: Date;
  isOnline: boolean;
}

let heartbeatInterval: NodeJS.Timeout | null = null;
let currentTeamId: string | null = null;
let currentUserEmail: string | null = null;

/**
 * Start tracking presence for a user in a team
 */
export async function startPresenceTracking(teamId: string, userEmail: string): Promise<void> {
  // Stop any existing tracking
  stopPresenceTracking();

  currentTeamId = teamId;
  currentUserEmail = userEmail;

  // Update presence immediately
  await updatePresence(teamId, userEmail);

  // Set up heartbeat interval
  heartbeatInterval = setInterval(() => {
    updatePresence(teamId, userEmail);
  }, HEARTBEAT_INTERVAL_MS);

  // Handle page visibility changes
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Handle page unload
  window.addEventListener('beforeunload', handleBeforeUnload);
}

/**
 * Stop presence tracking
 */
export function stopPresenceTracking(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  // Remove presence document when stopping
  if (currentTeamId && currentUserEmail) {
    removePresence(currentTeamId, currentUserEmail);
  }

  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('beforeunload', handleBeforeUnload);

  currentTeamId = null;
  currentUserEmail = null;
}

/**
 * Update presence timestamp
 */
async function updatePresence(teamId: string, userEmail: string): Promise<void> {
  try {
    const presenceRef = doc(db, 'teams', teamId, 'presence', userEmail);
    await setDoc(presenceRef, {
      email: userEmail,
      lastSeen: serverTimestamp(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.error('Failed to update presence:', error);
  }
}

/**
 * Remove presence document
 */
async function removePresence(teamId: string, userEmail: string): Promise<void> {
  try {
    const presenceRef = doc(db, 'teams', teamId, 'presence', userEmail);
    await deleteDoc(presenceRef);
  } catch (error) {
    console.error('Failed to remove presence:', error);
  }
}

/**
 * Handle visibility change (tab focus/blur)
 */
function handleVisibilityChange(): void {
  if (currentTeamId && currentUserEmail) {
    if (document.visibilityState === 'visible') {
      updatePresence(currentTeamId, currentUserEmail);
    }
  }
}

/**
 * Handle page unload
 */
function handleBeforeUnload(): void {
  if (currentTeamId && currentUserEmail) {
    // Note: We can't delete on unload reliably, but the heartbeat will expire
    // The presence document will be considered "offline" after ONLINE_THRESHOLD_MS
  }
}

/**
 * Subscribe to presence updates for a team
 * Returns a map of email -> isOnline
 */
export function subscribeToTeamPresence(
  teamId: string,
  callback: (onlineMembers: Map<string, boolean>) => void
): () => void {
  const presenceRef = collection(db, 'teams', teamId, 'presence');

  const unsubscribe = onSnapshot(presenceRef, (snapshot) => {
    const onlineMembers = new Map<string, boolean>();
    const now = Date.now();

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const lastSeen = data.lastSeen?.toDate?.() || new Date(data.updatedAt);
      const timeSinceLastSeen = now - lastSeen.getTime();
      const isOnline = timeSinceLastSeen < ONLINE_THRESHOLD_MS;
      onlineMembers.set(data.email, isOnline);
    });

    callback(onlineMembers);
  }, (error) => {
    console.error('Error subscribing to presence:', error);
    callback(new Map());
  });

  return unsubscribe;
}

/**
 * Subscribe to detailed presence updates for a team
 * Returns a map of email -> UserPresence with lastSeen time
 */
export function subscribeToTeamPresenceDetailed(
  teamId: string,
  callback: (presenceMap: Map<string, UserPresence>) => void
): () => void {
  const presenceRef = collection(db, 'teams', teamId, 'presence');

  const unsubscribe = onSnapshot(presenceRef, (snapshot) => {
    const presenceMap = new Map<string, UserPresence>();
    const now = Date.now();

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const lastSeen = data.lastSeen?.toDate?.() || new Date(data.updatedAt);
      const timeSinceLastSeen = now - lastSeen.getTime();
      const isOnline = timeSinceLastSeen < ONLINE_THRESHOLD_MS;

      presenceMap.set(data.email, {
        email: data.email,
        lastSeen,
        isOnline,
      });
    });

    callback(presenceMap);
  }, (error) => {
    console.error('Error subscribing to detailed presence:', error);
    callback(new Map());
  });

  return unsubscribe;
}

/**
 * Get count of online members
 */
export function getOnlineCount(onlineMembers: Map<string, boolean>): number {
  let count = 0;
  onlineMembers.forEach((isOnline) => {
    if (isOnline) count++;
  });
  return count;
}
