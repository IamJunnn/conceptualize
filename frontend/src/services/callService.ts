/**
 * Call Service
 * Handles voice/video calling using LiveKit and Firestore signaling
 */

import {
  Room,
  RoomEvent,
  RemoteParticipant,
  Track,
  ConnectionState,
  LocalVideoTrack,
} from 'livekit-client';
import { BackgroundBlur, VirtualBackground, ProcessorWrapper } from '@livekit/track-processors';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db, functions } from './firebase';
import { httpsCallable } from 'firebase/functions';
import {
  Call,
  CallFirestore,
  CallState,
  CallParticipant,
  CallType,
  firestoreToCall,
  generateCallId,
  generateRoomName,
} from './callTypes';
import {
  sendCallSystemMessage,
  updateCallSystemMessage,
} from './teamChatService';
import { CallMessageData } from './teamChatTypes';
import { getLocalStorage, setLocalStorage } from '../hooks/useLocalStorage';

// LiveKit URL (token generation moved to secure backend)
let LIVEKIT_URL = 'wss://conceptualize-ucbg0je6.livekit.cloud';

// Default call state
const initialCallState: CallState = {
  activeCall: null,
  incomingCall: null,
  isMuted: false,
  isVideoOff: false,
  isScreenSharing: false,
  isConnecting: false,
  isConnected: false,
  participants: [],
  error: null,
};

// Global state
let callState: CallState = { ...initialCallState };
let room: Room | null = null;
let callStateListeners: ((state: CallState) => void)[] = [];
let incomingCallUnsubscribe: Unsubscribe | null = null;
let activeCallUnsubscribe: Unsubscribe | null = null;
let callStartTime: number | null = null;

// Virtual background state
export type BackgroundMode = 'none' | 'blur' | 'image';
export type BlurLevel = 'light' | 'medium' | 'strong';

const BACKGROUND_MODE_KEY = 'conceptualize_background_mode';
const BLUR_LEVEL_KEY = 'conceptualize_blur_level';
const BACKGROUND_IMAGE_KEY = 'conceptualize_background_image';
const MIRROR_MODE_KEY = 'conceptualize_mirror_mode';

// Blur radius values: light=5, medium=15, strong=20
const BLUR_RADII: Record<BlurLevel, number> = {
  light: 5,
  medium: 15,
  strong: 20,
};

// Load saved preferences from localStorage
function loadSavedBackgroundMode(): BackgroundMode {
  const saved = getLocalStorage<BackgroundMode | null>(BACKGROUND_MODE_KEY, null);
  if (saved === 'blur' || saved === 'image' || saved === 'none') {
    return saved;
  }
  return 'none';
}

function loadSavedBlurLevel(): BlurLevel {
  const saved = getLocalStorage<BlurLevel | null>(BLUR_LEVEL_KEY, null);
  if (saved === 'light' || saved === 'medium' || saved === 'strong') {
    return saved;
  }
  return 'medium';
}

function loadSavedBackgroundImage(): string | null {
  return getLocalStorage<string | null>(BACKGROUND_IMAGE_KEY, null);
}

function loadSavedMirrorMode(): boolean {
  return getLocalStorage<boolean>(MIRROR_MODE_KEY, true); // Default to mirrored (like a mirror/selfie view)
}

let currentBackgroundMode: BackgroundMode = loadSavedBackgroundMode();
let currentBlurLevel: BlurLevel = loadSavedBlurLevel();
let currentBackgroundImageUrl: string | null = loadSavedBackgroundImage();
let currentMirrorMode: boolean = loadSavedMirrorMode();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentProcessor: ProcessorWrapper<any> | null = null;
let backgroundModeListeners: ((mode: BackgroundMode) => void)[] = [];
let mirrorModeListeners: ((isMirrored: boolean) => void)[] = [];

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Get current call state
 */
export function getCallState(): CallState {
  return { ...callState };
}

/**
 * Get the call start time (when the call was initiated or answered)
 * This is stable and won't change during the call
 */
export function getCallStartTime(): number | null {
  return callStartTime;
}

/**
 * Subscribe to call state changes
 */
export function subscribeToCallState(listener: (state: CallState) => void): () => void {
  callStateListeners.push(listener);
  // Immediately call with current state
  listener(getCallState());

  return () => {
    callStateListeners = callStateListeners.filter(l => l !== listener);
  };
}

/**
 * Update call state and notify listeners
 */
function updateCallState(updates: Partial<CallState>): void {
  callState = { ...callState, ...updates };
  callStateListeners.forEach(listener => listener(getCallState()));
}

// ============================================================================
// LIVEKIT TOKEN GENERATION
// ============================================================================

/**
 * Generate LiveKit access token via secure backend
 */
async function getLiveKitToken(roomName: string, participantName: string, participantIdentity: string): Promise<string> {
  const generateToken = httpsCallable<
    { roomName: string; participantName: string; participantIdentity: string },
    { token: string; url: string }
  >(functions, 'generateLiveKitToken');

  const result = await generateToken({ roomName, participantName, participantIdentity });

  // Update LIVEKIT_URL from server response (in case it changes)
  if (result.data.url) {
    LIVEKIT_URL = result.data.url;
  }

  return result.data.token;
}

// ============================================================================
// CALL INITIATION
// ============================================================================

/**
 * Start a new call
 */
export async function startCall(
  teamId: string,
  channelId: string,
  participants: string[],
  type: CallType,
  initiatorEmail: string,
  initiatorName: string,
  initiatorPhotoURL?: string
): Promise<Call> {
  try {
    // Check if already in a call
    if (callState.activeCall) {
      throw new Error('Already in a call');
    }

    updateCallState({ isConnecting: true, error: null });

    const callId = generateCallId();
    const roomName = generateRoomName(callId);

    // Create call document in Firestore
    // Note: Firestore doesn't accept undefined values, so we conditionally include initiatorPhotoURL
    const callData: Omit<CallFirestore, 'id'> = {
      teamId,
      channelId,
      type,
      status: 'ringing',
      initiatorEmail,
      initiatorName,
      ...(initiatorPhotoURL ? { initiatorPhotoURL } : {}),
      participants,
      connectedParticipants: [initiatorEmail],
      liveKitRoomName: roomName,
      createdAt: Timestamp.now(),
    };

    const docRef = await addDoc(collection(db, 'teams', teamId, 'calls'), callData);

    const call: Call = {
      id: docRef.id,
      teamId,
      channelId,
      type,
      status: 'ringing',
      initiatorEmail,
      initiatorName,
      initiatorPhotoURL,
      participants,
      connectedParticipants: [initiatorEmail],
      liveKitRoomName: roomName,
      createdAt: new Date(),
    };

    // Connect to LiveKit room
    await connectToRoom(call, initiatorEmail, initiatorName);

    // Subscribe to call updates
    subscribeToActiveCall(teamId, docRef.id);

    // Send call system message to chat
    const callMessageData: CallMessageData = {
      callId: docRef.id,
      callType: type === 'video' ? 'video' : 'voice',
      status: 'started',
      initiatorName,
      initiatorEmail,
    };
    const systemMessageId = await sendCallSystemMessage(
      teamId,
      channelId,
      callMessageData,
      initiatorPhotoURL
    );

    // Update call document with system message ID
    await updateDoc(doc(db, 'teams', teamId, 'calls', docRef.id), {
      systemMessageId,
    });

    // Update call object with message ID
    call.systemMessageId = systemMessageId;

    updateCallState({
      activeCall: call,
      isConnecting: false,
      isConnected: true,
    });

    callStartTime = Date.now();

    return call;
  } catch (error) {
    console.error('Failed to start call:', error);
    updateCallState({
      isConnecting: false,
      error: error instanceof Error ? error.message : 'Failed to start call',
    });
    throw error;
  }
}

/**
 * Answer an incoming call
 */
export async function answerCall(
  call: Call,
  userEmail: string,
  userName: string
): Promise<void> {
  try {
    updateCallState({ isConnecting: true, error: null, incomingCall: null });

    // Update call status in Firestore
    const callRef = doc(db, 'teams', call.teamId, 'calls', call.id);
    await updateDoc(callRef, {
      status: 'connected',
      answeredAt: Timestamp.now(),
      connectedParticipants: [...call.connectedParticipants, userEmail],
    });

    // Connect to LiveKit room
    await connectToRoom(call, userEmail, userName);

    // Subscribe to call updates
    subscribeToActiveCall(call.teamId, call.id);

    updateCallState({
      activeCall: { ...call, status: 'connected' },
      isConnecting: false,
      isConnected: true,
    });

    callStartTime = Date.now();
  } catch (error) {
    console.error('Failed to answer call:', error);
    updateCallState({
      isConnecting: false,
      incomingCall: null,
      error: error instanceof Error ? error.message : 'Failed to answer call',
    });
    throw error;
  }
}

/**
 * Decline an incoming call
 */
export async function declineCall(call: Call, userEmail: string): Promise<void> {
  try {
    // Add decline signal
    await addDoc(collection(db, 'teams', call.teamId, 'calls', call.id, 'signals'), {
      type: 'decline',
      from: userEmail,
      fromName: userEmail.split('@')[0],
      timestamp: Timestamp.now(),
    });

    // If this is the only other participant, end the call
    const remainingParticipants = call.participants.filter(p => p !== userEmail);
    if (remainingParticipants.length <= 1) {
      await updateDoc(doc(db, 'teams', call.teamId, 'calls', call.id), {
        status: 'declined',
        endedAt: Timestamp.now(),
      });

      // Update the system message to show the call was declined
      if (call.systemMessageId) {
        await updateCallSystemMessage(
          call.teamId,
          call.channelId,
          call.systemMessageId,
          0,
          'declined'
        );
      }
    }

    updateCallState({ incomingCall: null });
  } catch (error) {
    console.error('Failed to decline call:', error);
    throw error;
  }
}

/**
 * End the current call
 */
export async function endCall(): Promise<void> {
  const { activeCall } = callState;
  if (!activeCall) return;

  try {
    // Calculate duration
    const duration = callStartTime ? Math.floor((Date.now() - callStartTime) / 1000) : 0;

    // Update call status in Firestore
    await updateDoc(doc(db, 'teams', activeCall.teamId, 'calls', activeCall.id), {
      status: 'ended',
      endedAt: Timestamp.now(),
      duration,
    });

    // Update the system message with call duration
    if (activeCall.systemMessageId) {
      await updateCallSystemMessage(
        activeCall.teamId,
        activeCall.channelId,
        activeCall.systemMessageId,
        duration,
        'ended'
      );
    }

    // Disconnect from LiveKit
    await disconnectFromRoom();

    // Clean up subscriptions
    if (activeCallUnsubscribe) {
      activeCallUnsubscribe();
      activeCallUnsubscribe = null;
    }

    // Reset state
    updateCallState({ ...initialCallState });
    callStartTime = null;
  } catch (error) {
    console.error('Failed to end call:', error);
    // Still reset state even on error
    updateCallState({ ...initialCallState });
    throw error;
  }
}

// ============================================================================
// LIVEKIT CONNECTION
// ============================================================================

/**
 * Connect to LiveKit room
 */
async function connectToRoom(call: Call, userEmail: string, userName: string): Promise<void> {
  try {
    // Get token from backend
    const token = await getLiveKitToken(call.liveKitRoomName, userName, userEmail);

    // Create room instance
    room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: { width: 1280, height: 720 },
      },
    });

    // Set up room event handlers
    setupRoomEventHandlers();

    // Connect to room
    await room.connect(LIVEKIT_URL, token);

    // Enable local tracks based on call type
    // Voice call: Only microphone, camera stays OFF
    // Video call: Both microphone and camera ON
    const isVideoCall = call.type === 'video';

    if (isVideoCall) {
      await room.localParticipant.setCameraEnabled(true);

      // Apply saved background blur if enabled
      if (currentBackgroundMode !== 'none') {
        setTimeout(() => {
          applySavedBackgroundMode();
        }, 200);
      }
    }
    await room.localParticipant.setMicrophoneEnabled(true);

    // Update state to reflect the actual camera state
    // For voice calls, camera is OFF (isVideoOff = true)
    // For video calls, camera is ON (isVideoOff = false)
    updateCallState({ isVideoOff: !isVideoCall });

    // Update participants list to include local participant immediately
    updateParticipantsList();
  } catch (error) {
    console.error('Failed to connect to room:', error);
    throw error;
  }
}

/**
 * Set up LiveKit room event handlers
 */
function setupRoomEventHandlers(): void {
  if (!room) return;

  room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
    updateCallState({
      isConnected: state === ConnectionState.Connected,
      isConnecting: state === ConnectionState.Connecting,
    });
    // Update participants list when connected
    if (state === ConnectionState.Connected) {
      updateParticipantsList();
    }
  });

  room.on(RoomEvent.ParticipantConnected, (_participant: RemoteParticipant) => {
    updateParticipantsList();
  });

  room.on(RoomEvent.ParticipantDisconnected, (_participant: RemoteParticipant) => {
    updateParticipantsList();

    // If no other participants, end call
    if (room && room.remoteParticipants.size === 0) {
      endCall();
    }
  });

  room.on(RoomEvent.TrackSubscribed, () => {
    updateParticipantsList();
  });

  room.on(RoomEvent.TrackUnsubscribed, () => {
    updateParticipantsList();
  });

  room.on(RoomEvent.TrackMuted, () => {
    updateParticipantsList();
  });

  room.on(RoomEvent.TrackUnmuted, () => {
    updateParticipantsList();
  });

  room.on(RoomEvent.ActiveSpeakersChanged, () => {
    updateParticipantsList();
  });

  room.on(RoomEvent.LocalTrackPublished, () => {
    updateParticipantsList();
  });

  room.on(RoomEvent.LocalTrackUnpublished, () => {
    updateParticipantsList();
  });

  room.on(RoomEvent.Disconnected, () => {
    updateCallState({
      isConnected: false,
      isConnecting: false,
    });
  });
}

/**
 * Update participants list from room state
 */
function updateParticipantsList(): void {
  if (!room) {
    updateCallState({ participants: [] });
    return;
  }

  const participants: CallParticipant[] = [];

  // Add local participant
  const local = room.localParticipant;
  participants.push({
    email: local.identity,
    name: local.name || local.identity.split('@')[0],
    isMuted: !local.isMicrophoneEnabled,
    isVideoOff: !local.isCameraEnabled,
    isSpeaking: local.isSpeaking,
    isScreenSharing: local.isScreenShareEnabled,
  });

  // Add remote participants
  room.remoteParticipants.forEach((remote: RemoteParticipant) => {
    const audioTrack = remote.getTrackPublication(Track.Source.Microphone);
    const videoTrack = remote.getTrackPublication(Track.Source.Camera);
    const screenTrack = remote.getTrackPublication(Track.Source.ScreenShare);

    participants.push({
      email: remote.identity,
      name: remote.name || remote.identity.split('@')[0],
      isMuted: !audioTrack || audioTrack.isMuted,
      isVideoOff: !videoTrack || videoTrack.isMuted,
      isSpeaking: remote.isSpeaking,
      isScreenSharing: !!screenTrack && !screenTrack.isMuted,
    });
  });

  updateCallState({ participants });
}

/**
 * Disconnect from LiveKit room
 */
async function disconnectFromRoom(): Promise<void> {
  if (room) {
    await room.disconnect();
    room = null;
  }
}

// ============================================================================
// MEDIA CONTROLS
// ============================================================================

/**
 * Toggle microphone mute
 */
export async function toggleMute(): Promise<void> {
  if (!room) return;

  const newMutedState = !callState.isMuted;
  await room.localParticipant.setMicrophoneEnabled(!newMutedState);
  updateCallState({ isMuted: newMutedState });
  updateParticipantsList();
}

/**
 * Toggle camera
 */
export async function toggleVideo(): Promise<void> {
  if (!room) return;

  const newVideoOffState = !callState.isVideoOff;
  await room.localParticipant.setCameraEnabled(!newVideoOffState);
  updateCallState({ isVideoOff: newVideoOffState });
  updateParticipantsList();

  // If camera was just turned ON, apply saved background mode
  if (!newVideoOffState && currentBackgroundMode !== 'none') {
    // Small delay to ensure track is ready
    setTimeout(() => {
      applySavedBackgroundMode();
    }, 100);
  }
}

/**
 * Toggle screen sharing
 */
export async function toggleScreenShare(): Promise<void> {
  if (!room) return;

  const newScreenShareState = !callState.isScreenSharing;
  await room.localParticipant.setScreenShareEnabled(newScreenShareState);
  updateCallState({ isScreenSharing: newScreenShareState });
  updateParticipantsList();
}

/**
 * Get local participant video track element
 */
export function getLocalVideoTrack(): MediaStreamTrack | null {
  if (!room) return null;
  const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
  if (!publication || !publication.track) return null;
  return publication.track.mediaStreamTrack;
}

/**
 * Get remote participant video track element
 */
export function getRemoteVideoTrack(participantEmail: string): MediaStreamTrack | null {
  if (!room) return null;
  const participant = Array.from(room.remoteParticipants.values())
    .find(p => p.identity === participantEmail);
  if (!participant) return null;

  const publication = participant.getTrackPublication(Track.Source.Camera);
  if (!publication || !publication.track) return null;
  return publication.track.mediaStreamTrack;
}

/**
 * Get the LiveKit Room instance (for advanced usage)
 */
export function getRoom(): Room | null {
  return room;
}

// ============================================================================
// VIRTUAL BACKGROUND
// ============================================================================

/**
 * Get current background mode
 */
export function getBackgroundMode(): BackgroundMode {
  return currentBackgroundMode;
}

/**
 * Get current blur level
 */
export function getBlurLevel(): BlurLevel {
  return currentBlurLevel;
}

/**
 * Get current background image URL
 */
export function getBackgroundImageUrl(): string | null {
  return currentBackgroundImageUrl;
}

/**
 * Subscribe to background mode changes
 */
export function subscribeToBackgroundMode(listener: (mode: BackgroundMode) => void): () => void {
  backgroundModeListeners.push(listener);
  // Immediately notify with current state
  listener(currentBackgroundMode);
  return () => {
    backgroundModeListeners = backgroundModeListeners.filter(l => l !== listener);
  };
}

/**
 * Notify all background mode listeners
 */
function notifyBackgroundModeListeners(): void {
  backgroundModeListeners.forEach(listener => listener(currentBackgroundMode));
}

// ============================================================================
// MIRROR MODE
// ============================================================================

/**
 * Get current mirror mode state
 */
export function getMirrorMode(): boolean {
  return currentMirrorMode;
}

/**
 * Subscribe to mirror mode changes
 */
export function subscribeToMirrorMode(listener: (isMirrored: boolean) => void): () => void {
  mirrorModeListeners.push(listener);
  // Immediately notify with current state
  listener(currentMirrorMode);
  return () => {
    mirrorModeListeners = mirrorModeListeners.filter(l => l !== listener);
  };
}

/**
 * Toggle or set mirror mode
 * This controls whether the local video preview is flipped horizontally
 */
export function setMirrorMode(isMirrored: boolean): void {
  currentMirrorMode = isMirrored;

  // Save to localStorage
  setLocalStorage(MIRROR_MODE_KEY, isMirrored);

  // Notify listeners
  mirrorModeListeners.forEach(listener => listener(currentMirrorMode));
}

/**
 * Toggle mirror mode
 */
export function toggleMirrorMode(): boolean {
  setMirrorMode(!currentMirrorMode);
  return currentMirrorMode;
}

/**
 * Set background mode (none, blur, or image)
 * Saves preference to localStorage so it persists across calls
 */
export async function setBackgroundMode(mode: BackgroundMode, imageUrl?: string): Promise<void> {
  // Save preference to localStorage (even if no active call)
  setLocalStorage(BACKGROUND_MODE_KEY, mode);
  if (imageUrl) {
    setLocalStorage(BACKGROUND_IMAGE_KEY, imageUrl);
    currentBackgroundImageUrl = imageUrl;
  }

  // Update state and notify listeners
  currentBackgroundMode = mode;
  notifyBackgroundModeListeners();

  // If no active room, just save the preference for next call
  if (!room) {
    return;
  }

  const localParticipant = room.localParticipant;
  const cameraPublication = localParticipant.getTrackPublication(Track.Source.Camera);

  if (!cameraPublication || !cameraPublication.track) {
    return;
  }

  const videoTrack = cameraPublication.track as LocalVideoTrack;

  try {
    // Remove existing processor if any
    if (currentProcessor) {
      await videoTrack.stopProcessor();
      currentProcessor = null;
    }

    // Apply new processor based on mode
    if (mode === 'blur') {
      const blurRadius = BLUR_RADII[currentBlurLevel];
      const blurProcessor = BackgroundBlur(blurRadius);
      await videoTrack.setProcessor(blurProcessor);
      currentProcessor = blurProcessor;
    } else if (mode === 'image' && (imageUrl || currentBackgroundImageUrl)) {
      const bgUrl = imageUrl || currentBackgroundImageUrl!;
      const virtualBgProcessor = VirtualBackground(bgUrl);
      await videoTrack.setProcessor(virtualBgProcessor);
      currentProcessor = virtualBgProcessor;
    }
  } catch (error) {
    console.error('Failed to set background mode:', error);
    throw error;
  }
}

/**
 * Set blur level and enable blur mode
 * Saves preference to localStorage so it persists across calls
 */
export async function setBlurLevel(level: BlurLevel): Promise<void> {
  // Save preference to localStorage
  setLocalStorage(BLUR_LEVEL_KEY, level);

  currentBlurLevel = level;

  // Apply blur with new level
  await setBackgroundMode('blur');
}

/**
 * Set virtual background image
 * Saves preference to localStorage so it persists across calls
 */
export async function setVirtualBackground(imageUrl: string): Promise<void> {
  await setBackgroundMode('image', imageUrl);
}

/**
 * Apply saved background mode to current video track
 * Called automatically when camera is enabled
 */
export async function applySavedBackgroundMode(): Promise<void> {
  if (currentBackgroundMode !== 'none' && room) {
    const localParticipant = room.localParticipant;
    const cameraPublication = localParticipant.getTrackPublication(Track.Source.Camera);

    if (cameraPublication && cameraPublication.track) {
      const videoTrack = cameraPublication.track as LocalVideoTrack;

      try {
        // Remove existing processor first
        if (currentProcessor) {
          await videoTrack.stopProcessor();
          currentProcessor = null;
        }

        if (currentBackgroundMode === 'blur') {
          const blurRadius = BLUR_RADII[currentBlurLevel];
          const blurProcessor = BackgroundBlur(blurRadius);
          await videoTrack.setProcessor(blurProcessor);
          currentProcessor = blurProcessor;
        } else if (currentBackgroundMode === 'image' && currentBackgroundImageUrl) {
          const virtualBgProcessor = VirtualBackground(currentBackgroundImageUrl);
          await videoTrack.setProcessor(virtualBgProcessor);
          currentProcessor = virtualBgProcessor;
        }
      } catch (error) {
        console.error('Failed to auto-apply background mode:', error);
      }
    }
  }
}

/**
 * Toggle background blur on/off
 */
export async function toggleBackgroundBlur(): Promise<void> {
  const newMode = currentBackgroundMode === 'blur' ? 'none' : 'blur';
  await setBackgroundMode(newMode);
}

/**
 * Clear any background effects
 */
export async function clearBackgroundEffects(): Promise<void> {
  await setBackgroundMode('none');
}

// ============================================================================
// FIRESTORE SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to incoming calls for a user
 */
export function subscribeToIncomingCalls(
  teamId: string,
  userEmail: string,
  onIncomingCall: (call: Call) => void
): Unsubscribe {
  // Clean up existing subscription
  if (incomingCallUnsubscribe) {
    incomingCallUnsubscribe();
  }

  const callsRef = collection(db, 'teams', teamId, 'calls');
  const q = query(
    callsRef,
    where('status', '==', 'ringing'),
    where('participants', 'array-contains', userEmail),
    orderBy('createdAt', 'desc'),
    limit(1)
  );

  incomingCallUnsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const data = change.doc.data() as CallFirestore;
        const call = firestoreToCall({ ...data, id: change.doc.id });

        // Don't notify if we initiated the call
        if (call.initiatorEmail !== userEmail && !callState.activeCall) {
          updateCallState({ incomingCall: call });
          onIncomingCall(call);
        }
      }
    });
  }, (error) => {
    console.error('Error subscribing to incoming calls:', error);
  });

  return () => {
    if (incomingCallUnsubscribe) {
      incomingCallUnsubscribe();
      incomingCallUnsubscribe = null;
    }
  };
}

/**
 * Subscribe to active call updates
 */
function subscribeToActiveCall(teamId: string, callId: string): void {
  // Clean up existing subscription
  if (activeCallUnsubscribe) {
    activeCallUnsubscribe();
  }

  const callRef = doc(db, 'teams', teamId, 'calls', callId);

  activeCallUnsubscribe = onSnapshot(callRef, (snapshot) => {
    if (!snapshot.exists()) {
      // Call was deleted
      endCall();
      return;
    }

    const data = snapshot.data() as CallFirestore;
    const call = firestoreToCall({ ...data, id: snapshot.id });

    // Handle call status changes
    if (call.status === 'ended' || call.status === 'declined' || call.status === 'missed') {
      // Someone else ended the call
      disconnectFromRoom();
      updateCallState({ ...initialCallState });
    } else {
      updateCallState({ activeCall: call });
    }
  }, (error) => {
    console.error('Error subscribing to active call:', error);
  });
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up all call resources (call on unmount)
 */
export async function cleanupCallService(): Promise<void> {
  // End any active call
  if (callState.activeCall) {
    await endCall();
  }

  // Disconnect from room
  await disconnectFromRoom();

  // Clean up subscriptions
  if (incomingCallUnsubscribe) {
    incomingCallUnsubscribe();
    incomingCallUnsubscribe = null;
  }
  if (activeCallUnsubscribe) {
    activeCallUnsubscribe();
    activeCallUnsubscribe = null;
  }

  // Reset state
  callState = { ...initialCallState };
  callStateListeners = [];
}
