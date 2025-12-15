/**
 * Recording Service
 * Handles call recording using LiveKit Egress API via Firebase Functions
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDoc,
  getDocs,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  Recording,
  RecordingFirestore,
  RecordingState,
  RecordingType,
  firestoreToRecording,
} from './recordingTypes';
import { Call } from './callTypes';

// ============================================================================
// FIRESTORE-BASED RECORDING REQUESTS
// ============================================================================

/**
 * Send a recording request via Firestore
 * This bypasses CORS issues by using Firestore writes instead of Cloud Function calls
 * A Firestore trigger on the server processes the request
 *
 * For START actions: Returns immediately after sending the request. The Cloud Function
 * starts the recording on LiveKit but can't write back due to IAM issues. That's OK
 * because the stop operation queries LiveKit directly.
 *
 * For STOP actions: Waits for completion since we need to know when recording is done.
 */
async function sendRecordingRequest<T>(
  teamId: string,
  action: 'start' | 'stop',
  data: Record<string, unknown>
): Promise<T> {
  const recordingId = data.recordingId as string;
  const roomName = data.roomName as string;

  console.log(`📝 [sendRecordingRequest] Starting ${action} request...`, { teamId, recordingId, roomName });

  // Filter out undefined values (Firestore doesn't accept undefined)
  const filteredData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      filteredData[key] = value;
    }
  }

  // Create a request document
  const requestRef = await addDoc(
    collection(db, 'teams', teamId, 'recordingRequests'),
    {
      action,
      ...filteredData,
      status: 'pending',
      createdAt: Timestamp.now(),
    }
  );

  console.log(`📝 [sendRecordingRequest] Created request document: ${requestRef.id}`);

  // For START action: Return immediately - don't wait for Cloud Function to write back
  // The recording will start on LiveKit, and stop will query LiveKit directly
  if (action === 'start') {
    console.log('🚀 [sendRecordingRequest] START action - returning immediately (recording will start on LiveKit)');

    // Give the Cloud Function a tiny bit of time to process (but don't block UI)
    // This runs in the background - we don't await it
    setTimeout(async () => {
      console.log('🔍 [Background] Checking if Cloud Function wrote egressId...');
      try {
        const recordingDoc = await getDoc(doc(db, 'teams', teamId, 'recordings', recordingId));
        const recordingData = recordingDoc.data();
        if (recordingData?.egressId) {
          console.log('✅ [Background] egressId found:', recordingData.egressId);
        } else {
          console.log('⚠️ [Background] No egressId yet - stop will query LiveKit directly');
        }
      } catch (err) {
        console.warn('⚠️ [Background] Could not check recording document');
      }
    }, 3000);

    return { success: true } as T;
  }

  // For STOP action: Wait for the request to be processed (with shorter timeout)
  return new Promise((resolve, reject) => {
    let resolved = false;
    let pollInterval: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (pollInterval) clearInterval(pollInterval);
      unsubscribe();
    };

    // 15 second timeout for stop (Cloud Function should respond quickly)
    const timeout = setTimeout(async () => {
      console.log('⏰ [15s timeout] Stop timeout reached!');
      if (resolved) return;
      cleanup();

      // Check recording document as last resort
      console.log('📋 [15s timeout] Checking recording document directly...');
      try {
        const recordingDoc = await getDoc(doc(db, 'teams', teamId, 'recordings', recordingId));
        const recordingData = recordingDoc.data();
        console.log('📋 [15s timeout] Recording document data:', recordingData);

        if (recordingData?.status === 'completed') {
          console.log('✅ [15s timeout] Recording marked as completed');
          resolved = true;
          resolve({ success: true, fileUrl: recordingData.fileUrl } as T);
          return;
        }
      } catch (checkError) {
        console.error('❌ [15s timeout] Failed to check recording document:', checkError);
      }

      // For stop, if we timeout, assume it worked (the egress was likely stopped)
      console.log('⚠️ [15s timeout] Assuming stop succeeded (egress likely stopped on LiveKit)');
      resolve({ success: true, message: 'Stop request sent (timeout waiting for confirmation)' } as T);
    }, 15000);

    // Poll the recording document every 2 seconds
    let pollCount = 0;
    pollInterval = setInterval(async () => {
      if (resolved) return;
      pollCount++;
      console.log(`🔄 [Poll #${pollCount}] Checking recording document...`);
      try {
        const recordingDoc = await getDoc(doc(db, 'teams', teamId, 'recordings', recordingId));
        const recordingData = recordingDoc.data();
        console.log(`🔄 [Poll #${pollCount}] Data:`, { status: recordingData?.status });

        if (recordingData?.status === 'completed') {
          console.log(`✅ [Poll #${pollCount}] Recording marked as completed!`);
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          resolve({ success: true, fileUrl: recordingData.fileUrl } as T);
        }
      } catch (pollError: any) {
        console.warn(`⚠️ [Poll #${pollCount}] Error:`, pollError.message);
      }
    }, 2000);

    // Primary method: listen to the request document
    console.log('👂 [Listener] Setting up Firestore listener on request document...');
    const unsubscribe = onSnapshot(requestRef, (snapshot) => {
      if (resolved) return;
      const requestData = snapshot.data();
      console.log('👂 [Listener] Request document changed:', requestData?.status);

      if (!requestData) return;

      if (requestData.status === 'completed') {
        console.log('✅ [Listener] Request completed! Result:', requestData.result);
        resolved = true;
        clearTimeout(timeout);
        cleanup();
        resolve(requestData.result as T);
      } else if (requestData.status === 'error') {
        console.error('❌ [Listener] Request failed with error:', requestData.error);
        resolved = true;
        clearTimeout(timeout);
        cleanup();
        reject(new Error(requestData.error || 'Recording request failed'));
      } else {
        console.log('⏳ [Listener] Status is still:', requestData.status);
      }
    }, (error) => {
      console.error('❌ [Listener] Snapshot error:', error);
      if (resolved) return;
      clearTimeout(timeout);
      cleanup();
      reject(error);
    });
  });
}

// Default recording state
const initialRecordingState: RecordingState = {
  activeRecording: null,
  isRecording: false,
  isStarting: false,
  isStopping: false,
  error: null,
};

// Global state
let recordingState: RecordingState = { ...initialRecordingState };
let recordingStateListeners: ((state: RecordingState) => void)[] = [];
let activeRecordingUnsubscribe: Unsubscribe | null = null;

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Get current recording state
 */
export function getRecordingState(): RecordingState {
  return { ...recordingState };
}

/**
 * Subscribe to recording state changes
 */
export function subscribeToRecordingState(listener: (state: RecordingState) => void): () => void {
  recordingStateListeners.push(listener);
  // Immediately call with current state
  listener(getRecordingState());

  return () => {
    recordingStateListeners = recordingStateListeners.filter(l => l !== listener);
  };
}

/**
 * Update recording state and notify listeners
 */
function updateRecordingState(updates: Partial<RecordingState>): void {
  recordingState = { ...recordingState, ...updates };
  recordingStateListeners.forEach(listener => listener(getRecordingState()));
}

// ============================================================================
// RECORDING CONTROLS
// ============================================================================

/**
 * Start recording the current call
 * @param call - The call object
 * @param userEmail - The email of the user starting the recording
 * @param userName - The display name of the user
 * @param channelName - The name of the channel
 * @param isScreenSharing - Whether screen sharing is active (if true, record as video)
 */
export async function startRecording(
  call: Call,
  userEmail: string,
  userName: string,
  channelName: string,
  isScreenSharing: boolean = false
): Promise<Recording> {
  // Track docRef outside try block for cleanup in catch
  let createdDocId: string | null = null;

  try {
    if (recordingState.isRecording) {
      throw new Error('Already recording');
    }

    updateRecordingState({ isStarting: true, error: null });

    // Record as video if it's a video call OR if screen sharing is active
    const recordingType: RecordingType = (call.type === 'video' || isScreenSharing) ? 'video' : 'audio';

    // Create recording document in Firestore
    // Include liveKitRoomName so we can find active egress when stopping
    const recordingData: Omit<RecordingFirestore, 'id'> = {
      teamId: call.teamId,
      channelId: call.channelId,
      callId: call.id,
      type: recordingType,
      status: 'recording',
      startedBy: userEmail,
      startedByName: userName,
      participants: call.participants,
      channelName,
      liveKitRoomName: call.liveKitRoomName, // Store for stop operation
      createdAt: Timestamp.now(),
      startedAt: Timestamp.now(),
    };

    const docRef = await addDoc(
      collection(db, 'teams', call.teamId, 'recordings'),
      recordingData
    );
    createdDocId = docRef.id;

    console.log('Created recording document:', docRef.id);

    // Send recording request via Firestore (bypasses CORS issues)
    const egressResult = await sendRecordingRequest<{ success: boolean; egressId?: string; error?: string }>(
      call.teamId,
      'start',
      {
        recordingId: docRef.id,
        roomName: call.liveKitRoomName,
        type: recordingType,
      }
    );

    console.log('Cloud Function response:', egressResult);

    // Recording starts even if we don't get egressId back (due to IAM write issues)
    // The stop operation will query LiveKit directly for active egress
    if (!egressResult.success) {
      // Only fail if explicitly unsuccessful (error from LiveKit)
      if (egressResult.error && !egressResult.error.includes('timeout')) {
        await deleteDoc(doc(db, 'teams', call.teamId, 'recordings', docRef.id));
        createdDocId = null;
        throw new Error(egressResult.error || 'Failed to start recording');
      }
    }

    // Update recording with egress ID if we got one
    if (egressResult.egressId) {
      console.log('Cloud Function returned egressId:', egressResult.egressId);
      await updateDoc(doc(db, 'teams', call.teamId, 'recordings', docRef.id), {
        egressId: egressResult.egressId,
      });
      console.log('Updated Firestore with egressId:', egressResult.egressId);
    } else {
      console.log('No egressId returned - recording may still be starting. Stop will query LiveKit directly.');
    }

    const recording: Recording = {
      id: docRef.id,
      teamId: call.teamId,
      channelId: call.channelId,
      callId: call.id,
      type: recordingType,
      status: 'recording',
      startedBy: userEmail,
      startedByName: userName,
      participants: call.participants,
      channelName,
      liveKitRoomName: call.liveKitRoomName, // Include for stop operation
      egressId: egressResult.egressId, // May be undefined
      createdAt: new Date(),
      startedAt: new Date(),
    };

    // Subscribe to recording updates
    subscribeToActiveRecording(call.teamId, docRef.id);

    updateRecordingState({
      activeRecording: recording,
      isRecording: true,
      isStarting: false,
    });

    console.log('Started recording:', docRef.id, 'egressId:', egressResult.egressId);
    return recording;
  } catch (error) {
    console.error('Failed to start recording:', error);

    // Clean up the Firestore document if it was created but egress failed
    if (createdDocId) {
      try {
        await deleteDoc(doc(db, 'teams', call.teamId, 'recordings', createdDocId));
        console.log('Cleaned up orphaned recording document:', createdDocId);
      } catch (cleanupError) {
        console.error('Failed to clean up recording document:', cleanupError);
      }
    }

    updateRecordingState({
      isStarting: false,
      error: error instanceof Error ? error.message : 'Failed to start recording',
    });
    throw error;
  }
}

/**
 * Stop the current recording
 * Can accept an optional recording parameter to stop recordings started by others
 */
export async function stopRecording(recording?: Recording | null): Promise<void> {
  // Use provided recording or fall back to activeRecording
  const initialRecording = recording || recordingState.activeRecording;
  if (!initialRecording) {
    console.error('Cannot stop recording: No recording provided');
    return;
  }

  // Work with a non-null recording from here
  let targetRecording: Recording = { ...initialRecording };

  // If egressId is missing, try to fetch the latest from Firestore (including roomName)
  if ((!targetRecording.egressId || !targetRecording.liveKitRoomName) && targetRecording.id && targetRecording.teamId) {
    console.log('egressId or roomName missing, fetching latest from Firestore...');
    try {
      const recordingDoc = await getDoc(doc(db, 'teams', targetRecording.teamId, 'recordings', targetRecording.id));
      if (recordingDoc.exists()) {
        const data = recordingDoc.data() as RecordingFirestore;
        if (data.egressId || data.liveKitRoomName) {
          console.log('Found in Firestore - egressId:', data.egressId, 'roomName:', data.liveKitRoomName);
          targetRecording = {
            ...targetRecording,
            egressId: data.egressId || targetRecording.egressId,
            liveKitRoomName: data.liveKitRoomName || targetRecording.liveKitRoomName,
          };
        }
      }
    } catch (fetchError) {
      console.error('Failed to fetch recording from Firestore:', fetchError);
    }
  }

  // Only require id and teamId - egressId is optional now (Cloud Function can query LiveKit)
  if (!targetRecording.id || !targetRecording.teamId) {
    const missingFields = [];
    if (!targetRecording.id) missingFields.push('id');
    if (!targetRecording.teamId) missingFields.push('teamId');

    console.error('Cannot stop recording: Missing required fields:', missingFields);
    updateRecordingState({
      error: `Cannot stop recording: Missing ${missingFields.join(', ')}.`,
    });
    throw new Error(`Recording is missing required fields: ${missingFields.join(', ')}`);
  }

  // Log what we have for debugging
  console.log('Stop recording with:', {
    id: targetRecording.id,
    teamId: targetRecording.teamId,
    egressId: targetRecording.egressId || '(will query LiveKit)',
    liveKitRoomName: targetRecording.liveKitRoomName || '(unknown)',
  });

  try {
    updateRecordingState({ isStopping: true, error: null });

    console.log('Stopping recording:', {
      recordingId: targetRecording.id,
      teamId: targetRecording.teamId,
      egressId: targetRecording.egressId || '(will query LiveKit)',
      roomName: targetRecording.liveKitRoomName,
    });

    // Send stop request via Firestore (bypasses CORS issues)
    // Include roomName so Cloud Function can query LiveKit if egressId is missing
    const egressResult = await sendRecordingRequest<{ success: boolean; error?: string; fileUrl?: string; message?: string }>(
      targetRecording.teamId,
      'stop',
      {
        recordingId: targetRecording.id,
        egressId: targetRecording.egressId, // May be undefined
        roomName: targetRecording.liveKitRoomName, // For querying LiveKit
      }
    );

    if (!egressResult.success) {
      throw new Error(egressResult.error || 'Failed to stop recording');
    }

    // Update recording document to 'processing' status
    // The file is being uploaded to S3 by LiveKit - this happens asynchronously
    // LiveKit webhook will update to 'completed' when done, or we'll poll S3
    try {
      await updateDoc(doc(db, 'teams', targetRecording.teamId, 'recordings', targetRecording.id), {
        status: 'processing',
        endedAt: Timestamp.now(),
      });
      console.log('Updated recording document to processing status');

      // Add to processing recordings list for indicator
      addProcessingRecording({
        id: targetRecording.id,
        teamId: targetRecording.teamId,
        channelName: targetRecording.channelName || 'Unknown channel',
        type: targetRecording.type,
        expectedFileUrl: egressResult.fileUrl || `https://conceptualize-recordings.s3.us-east-2.amazonaws.com/recordings/${targetRecording.teamId}/${targetRecording.id}.mp4`,
      });
    } catch (clientUpdateError) {
      console.warn('Could not update recording document from client (may already be updated):', clientUpdateError);
    }

    // Clean up subscription if this was our active recording
    if (targetRecording.id === recordingState.activeRecording?.id) {
      if (activeRecordingUnsubscribe) {
        activeRecordingUnsubscribe();
        activeRecordingUnsubscribe = null;
      }
      updateRecordingState({
        activeRecording: null,
        isRecording: false,
        isStopping: false,
      });
    } else {
      // Just update stopping state
      updateRecordingState({ isStopping: false });
    }

    console.log('Stopped recording:', targetRecording.id);
  } catch (error) {
    console.error('Failed to stop recording:', error);
    updateRecordingState({
      isStopping: false,
      error: error instanceof Error ? error.message : 'Failed to stop recording',
    });
    throw error;
  }
}

// ============================================================================
// FIRESTORE SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to active recording updates
 */
function subscribeToActiveRecording(teamId: string, recordingId: string): void {
  if (activeRecordingUnsubscribe) {
    activeRecordingUnsubscribe();
  }

  const recordingRef = doc(db, 'teams', teamId, 'recordings', recordingId);

  activeRecordingUnsubscribe = onSnapshot(recordingRef, (snapshot) => {
    if (!snapshot.exists()) {
      updateRecordingState({ activeRecording: null, isRecording: false });
      return;
    }

    const data = snapshot.data() as RecordingFirestore;
    const recording = firestoreToRecording({ ...data, id: snapshot.id });

    // Handle status changes
    if (recording.status === 'completed' || recording.status === 'failed') {
      updateRecordingState({
        activeRecording: null,
        isRecording: false,
      });
      if (activeRecordingUnsubscribe) {
        activeRecordingUnsubscribe();
        activeRecordingUnsubscribe = null;
      }
    } else {
      updateRecordingState({ activeRecording: recording });
    }
  }, (error) => {
    console.error('Error subscribing to recording:', error);
  });
}

/**
 * Subscribe to a call's active recording (for other participants)
 */
export function subscribeToCallRecording(
  teamId: string,
  callId: string,
  onRecordingChange: (recording: Recording | null) => void
): Unsubscribe {
  const recordingsRef = collection(db, 'teams', teamId, 'recordings');
  const q = query(
    recordingsRef,
    where('callId', '==', callId),
    where('status', '==', 'recording'),
    limit(1)
  );

  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      onRecordingChange(null);
    } else {
      const doc = snapshot.docs[0];
      const data = doc.data() as RecordingFirestore;
      const recording = firestoreToRecording({ ...data, id: doc.id });
      onRecordingChange(recording);
    }
  }, (error) => {
    console.error('Error subscribing to call recording:', error);
    onRecordingChange(null);
  });
}

// ============================================================================
// RECORDINGS LIST
// ============================================================================

/**
 * Fetch recordings for a team
 */
export async function fetchTeamRecordings(
  teamId: string,
  limitCount: number = 50
): Promise<Recording[]> {
  try {
    const recordingsRef = collection(db, 'teams', teamId, 'recordings');
    const q = query(
      recordingsRef,
      where('status', 'in', ['completed', 'processing']),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    const recordings: Recording[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data() as RecordingFirestore;
      recordings.push(firestoreToRecording({ ...data, id: doc.id }));
    });

    return recordings;
  } catch (error) {
    console.error('Failed to fetch recordings:', error);
    throw error;
  }
}

/**
 * Subscribe to team recordings (real-time updates)
 */
export function subscribeToTeamRecordings(
  teamId: string,
  onRecordingsChange: (recordings: Recording[]) => void,
  limitCount: number = 50
): Unsubscribe {
  const recordingsRef = collection(db, 'teams', teamId, 'recordings');
  const q = query(
    recordingsRef,
    where('status', 'in', ['completed', 'processing', 'recording']),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  return onSnapshot(q, (snapshot) => {
    const recordings: Recording[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data() as RecordingFirestore;
      recordings.push(firestoreToRecording({ ...data, id: doc.id }));
    });
    onRecordingsChange(recordings);
  }, (error) => {
    console.error('Error subscribing to recordings:', error);
    onRecordingsChange([]);
  });
}

/**
 * Delete a recording
 * Deletes the Firestore document directly. S3 files can be cleaned up separately if needed.
 */
export async function deleteRecording(teamId: string, recordingId: string): Promise<void> {
  try {
    // Delete directly from Firestore
    const recordingRef = doc(db, 'teams', teamId, 'recordings', recordingId);
    await deleteDoc(recordingRef);

    console.log('Deleted recording:', recordingId);
  } catch (error) {
    console.error('Failed to delete recording:', error);
    throw error;
  }
}

// S3 configuration for constructing recording URLs
const AWS_S3_BUCKET = 'conceptualize-recordings-98563';
const AWS_S3_REGION = 'us-east-2';

/**
 * Construct S3 URL for a recording
 */
function constructRecordingUrl(teamId: string, recordingId: string, type: 'video' | 'audio'): string {
  const fileExtension = type === 'video' ? 'mp4' : 'ogg';
  const filePath = `recordings/${teamId}/${recordingId}.${fileExtension}`;
  return `https://${AWS_S3_BUCKET}.s3.${AWS_S3_REGION}.amazonaws.com/${filePath}`;
}

/**
 * Fix recordings missing fileUrl
 * Handles any status (recording, processing, completed) that lacks a fileUrl
 * Constructs the S3 URL and updates status to 'completed'
 */
export async function fixRecordingsWithoutUrl(teamId: string): Promise<{ fixed: number }> {
  try {
    const recordingsRef = collection(db, 'teams', teamId, 'recordings');

    // Get all recordings that are not failed (recording, processing, or completed without URL)
    const allRecordingsQuery = query(
      recordingsRef,
      where('status', 'in', ['recording', 'processing', 'completed'])
    );
    const allRecordings = await getDocs(allRecordingsQuery);
    let fixedCount = 0;

    for (const docSnap of allRecordings.docs) {
      const data = docSnap.data() as RecordingFirestore;

      // Skip if already has a valid fileUrl
      if (data.fileUrl && data.fileUrl.length > 0) {
        continue;
      }

      const recordingType = data.type || 'video';
      const fileUrl = constructRecordingUrl(teamId, docSnap.id, recordingType);

      await updateDoc(doc(db, 'teams', teamId, 'recordings', docSnap.id), {
        status: 'completed',
        fileUrl,
      });

      console.log(`✅ Fixed recording ${docSnap.id}, URL: ${fileUrl}`);
      fixedCount++;
    }

    if (fixedCount > 0) {
      console.log(`🎬 Fixed ${fixedCount} recording(s) missing fileUrl`);
    }

    return { fixed: fixedCount };
  } catch (error) {
    console.error('Failed to fix recordings:', error);
    throw error;
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up recording service resources
 */
export async function cleanupRecordingService(): Promise<void> {
  // Stop any active recording
  if (recordingState.isRecording) {
    try {
      await stopRecording();
    } catch (error) {
      console.error('Error stopping recording during cleanup:', error);
    }
  }

  // Clean up subscriptions
  if (activeRecordingUnsubscribe) {
    activeRecordingUnsubscribe();
    activeRecordingUnsubscribe = null;
  }

  // Reset state
  recordingState = { ...initialRecordingState };
  recordingStateListeners = [];
}

/**
 * Force reset recording state (for when call ends)
 */
export function resetRecordingState(): void {
  if (activeRecordingUnsubscribe) {
    activeRecordingUnsubscribe();
    activeRecordingUnsubscribe = null;
  }
  updateRecordingState({ ...initialRecordingState });
}

// ============================================================================
// PROCESSING RECORDINGS TRACKER
// Tracks recordings that are being saved (even after call ends)
// ============================================================================

export interface ProcessingRecording {
  id: string;
  teamId: string;
  channelName: string;
  type: 'audio' | 'video';
  expectedFileUrl: string;
  startedAt: Date;
}

// Global list of processing recordings
let processingRecordings: ProcessingRecording[] = [];
let processingRecordingsListeners: ((recordings: ProcessingRecording[]) => void)[] = [];

/**
 * Add a recording to the processing list
 */
function addProcessingRecording(recording: Omit<ProcessingRecording, 'startedAt'>): void {
  const newRecording: ProcessingRecording = {
    ...recording,
    startedAt: new Date(),
  };
  processingRecordings = [...processingRecordings, newRecording];
  notifyProcessingListeners();

  // Start polling for completion
  pollForRecordingCompletion(recording.teamId, recording.id);
}

/**
 * Remove a recording from the processing list
 */
function removeProcessingRecording(recordingId: string): void {
  processingRecordings = processingRecordings.filter(r => r.id !== recordingId);
  notifyProcessingListeners();
}

/**
 * Notify all listeners of processing recordings changes
 */
function notifyProcessingListeners(): void {
  processingRecordingsListeners.forEach(listener => listener([...processingRecordings]));
}

/**
 * Get current processing recordings
 */
export function getProcessingRecordings(): ProcessingRecording[] {
  return [...processingRecordings];
}

/**
 * Subscribe to processing recordings changes
 */
export function subscribeToProcessingRecordings(
  listener: (recordings: ProcessingRecording[]) => void
): () => void {
  processingRecordingsListeners.push(listener);
  // Immediately call with current state
  listener([...processingRecordings]);

  return () => {
    processingRecordingsListeners = processingRecordingsListeners.filter(l => l !== listener);
  };
}

/**
 * Poll for recording completion
 * Checks Firestore every 5 seconds until status is 'completed' or max time reached
 */
async function pollForRecordingCompletion(teamId: string, recordingId: string): Promise<void> {
  const MAX_POLL_TIME = 5 * 60 * 1000; // 5 minutes max
  const POLL_INTERVAL = 5000; // 5 seconds
  const startTime = Date.now();

  console.log(`🔄 Starting completion poll for recording ${recordingId}`);

  const poll = async (): Promise<void> => {
    try {
      const recordingRef = doc(db, 'teams', teamId, 'recordings', recordingId);
      const recordingDoc = await getDoc(recordingRef);

      if (!recordingDoc.exists()) {
        console.warn(`Recording ${recordingId} not found`);
        removeProcessingRecording(recordingId);
        return;
      }

      const data = recordingDoc.data() as RecordingFirestore;

      if (data.status === 'completed') {
        console.log(`✅ Recording ${recordingId} completed!`);
        removeProcessingRecording(recordingId);
        return;
      }

      if (data.status === 'failed') {
        console.error(`❌ Recording ${recordingId} failed`);
        removeProcessingRecording(recordingId);
        return;
      }

      // Check if we've exceeded max poll time
      if (Date.now() - startTime > MAX_POLL_TIME) {
        console.log(`⏰ Recording ${recordingId} poll timeout - marking as completed`);
        // Assume it's done and construct the URL
        const fileUrl = constructRecordingUrl(teamId, recordingId, data.type || 'video');
        try {
          await updateDoc(recordingRef, {
            status: 'completed',
            fileUrl,
          });
        } catch (e) {
          console.warn('Could not update recording status after timeout');
        }
        removeProcessingRecording(recordingId);
        return;
      }

      // Continue polling
      setTimeout(poll, POLL_INTERVAL);
    } catch (error) {
      console.error(`Error polling recording ${recordingId}:`, error);
      // Continue polling on error
      setTimeout(poll, POLL_INTERVAL);
    }
  };

  // Start first poll after a short delay
  setTimeout(poll, POLL_INTERVAL);
}
