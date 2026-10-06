/**
 * Whiteboard Sync Service
 * Handles real-time synchronization of whiteboard data using Firestore
 *
 * This provides a simpler sync mechanism using Firestore's built-in real-time
 * capabilities. For more complex scenarios, this can be upgraded to use Yjs.
 */

import { TLEditorSnapshot, Editor } from 'tldraw';
import {
  saveWhiteboardData,
  subscribeToWhiteboard,
  updatePresence,
  removePresence,
  subscribeToPresence,
} from './whiteboardService';
import { Whiteboard, WhiteboardPresence } from './whiteboardTypes';
import { debounce, throttle } from 'lodash';

// Sync state for a whiteboard
interface SyncState {
  teamId: string;
  whiteboardId: string;
  userId: string;
  userName: string;
  editor: Editor | null;
  unsubscribeWhiteboard: (() => void) | null;
  unsubscribePresence: (() => void) | null;
  isSaving: boolean;
  lastSavedAt: number;
  isRemoteUpdate: boolean;
}

// Active sync states by whiteboard ID
const syncStates = new Map<string, SyncState>();

/**
 * Initialize sync for a whiteboard
 */
export function initializeSync(
  teamId: string,
  whiteboardId: string,
  userId: string,
  userName: string,
  editor: Editor,
  onRemoteUpdate: (whiteboard: Whiteboard) => void,
  onPresenceUpdate: (presence: WhiteboardPresence[]) => void
): () => void {
  // Clean up existing sync for this whiteboard
  cleanupSync(whiteboardId);

  const state: SyncState = {
    teamId,
    whiteboardId,
    userId,
    userName,
    editor,
    unsubscribeWhiteboard: null,
    unsubscribePresence: null,
    isSaving: false,
    lastSavedAt: 0,
    isRemoteUpdate: false,
  };

  syncStates.set(whiteboardId, state);

  // Subscribe to whiteboard changes
  state.unsubscribeWhiteboard = subscribeToWhiteboard(
    teamId,
    whiteboardId,
    (whiteboard) => {
      if (whiteboard) {
        // Only apply remote updates if not currently saving
        if (!state.isSaving && whiteboard.data) {
          state.isRemoteUpdate = true;
          onRemoteUpdate(whiteboard);
          setTimeout(() => {
            state.isRemoteUpdate = false;
          }, 200);
        }
      }
    }
  );

  // Subscribe to presence changes
  state.unsubscribePresence = subscribeToPresence(
    teamId,
    whiteboardId,
    (presence) => {
      // Filter out own presence
      const otherPresence = presence.filter((p) => p.userId !== userId);
      onPresenceUpdate(otherPresence);
    }
  );

  // Initial presence update
  updatePresence(teamId, whiteboardId, userId, userName, null);

  // Return cleanup function
  return () => cleanupSync(whiteboardId);
}

/**
 * Clean up sync for a whiteboard
 */
export function cleanupSync(whiteboardId: string): void {
  const state = syncStates.get(whiteboardId);
  if (state) {
    state.unsubscribeWhiteboard?.();
    state.unsubscribePresence?.();

    // Remove presence
    removePresence(state.teamId, whiteboardId, state.userId).catch(console.error);

    syncStates.delete(whiteboardId);
  }
}

/**
 * Save whiteboard data with debouncing
 */
const debouncedSave = debounce(
  async (
    teamId: string,
    whiteboardId: string,
    data: TLEditorSnapshot,
    thumbnail?: string
  ) => {
    const state = syncStates.get(whiteboardId);
    if (!state) return;

    try {
      state.isSaving = true;
      await saveWhiteboardData(teamId, whiteboardId, data, thumbnail);
      state.lastSavedAt = Date.now();
    } catch (error) {
      console.error('Failed to save whiteboard:', error);
    } finally {
      state.isSaving = false;
    }
  },
  150, // Debounce by 150ms for more responsive live sync
  { maxWait: 500 } // Save at least every 500ms for live updates
);

/**
 * Queue a save operation
 */
export function queueSave(
  whiteboardId: string,
  data: TLEditorSnapshot,
  thumbnail?: string
): void {
  const state = syncStates.get(whiteboardId);
  if (!state || state.isRemoteUpdate) return;

  debouncedSave(state.teamId, whiteboardId, data, thumbnail);
}

/**
 * Force immediate save
 */
export async function forceSave(
  whiteboardId: string,
  data: TLEditorSnapshot,
  thumbnail?: string
): Promise<void> {
  const state = syncStates.get(whiteboardId);
  if (!state) return;

  try {
    state.isSaving = true;
    await saveWhiteboardData(state.teamId, whiteboardId, data, thumbnail);
    state.lastSavedAt = Date.now();
  } catch (error) {
    console.error('Failed to force save whiteboard:', error);
    throw error;
  } finally {
    state.isSaving = false;
  }
}

/**
 * Flush any pending debounced saves immediately
 * Call this on page unload to ensure no data is lost
 */
export function flushPendingSaves(): void {
  debouncedSave.flush();
}

/**
 * Update cursor position (throttled)
 */
const throttledPresenceUpdate = throttle(
  async (
    teamId: string,
    whiteboardId: string,
    userId: string,
    userName: string,
    cursor: { x: number; y: number } | null
  ) => {
    try {
      await updatePresence(teamId, whiteboardId, userId, userName, cursor);
    } catch (error) {
      console.error('Failed to update presence:', error);
    }
  },
  200 // Update presence at most every 200ms for smoother cursor tracking
);

/**
 * Update user's cursor position
 */
export function updateCursor(
  whiteboardId: string,
  cursor: { x: number; y: number } | null
): void {
  const state = syncStates.get(whiteboardId);
  if (!state) return;

  throttledPresenceUpdate(
    state.teamId,
    whiteboardId,
    state.userId,
    state.userName,
    cursor
  );
}

/**
 * Check if sync is active for a whiteboard
 */
export function isSyncActive(whiteboardId: string): boolean {
  return syncStates.has(whiteboardId);
}

/**
 * Get sync state for a whiteboard
 */
export function getSyncState(whiteboardId: string): SyncState | undefined {
  return syncStates.get(whiteboardId);
}

/**
 * Get all active syncs
 */
export function getActiveSyncs(): string[] {
  return Array.from(syncStates.keys());
}
