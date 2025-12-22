/**
 * Call Types
 * TypeScript interfaces for voice and video calling system
 */

import { Timestamp } from 'firebase/firestore';

// Call status lifecycle
export type CallStatus = 'ringing' | 'connecting' | 'connected' | 'ended' | 'missed' | 'declined';

// Call type (audio or video)
export type CallType = 'audio' | 'video';

/**
 * Call document stored in Firestore
 */
export interface Call {
  id: string;
  teamId: string;
  channelId: string;
  type: CallType;
  status: CallStatus;

  // Initiator info
  initiatorEmail: string;
  initiatorName: string;
  initiatorPhotoURL?: string;
  initiatorCustomAvatar?: string; // DiceBear avatar (priority over photoURL)

  // Participants (emails of everyone invited)
  participants: string[];

  // Connected participants (emails of those who joined)
  connectedParticipants: string[];

  // LiveKit room name (unique per call)
  liveKitRoomName: string;

  // Timestamps
  createdAt: Date;
  answeredAt?: Date;
  endedAt?: Date;

  // Duration in seconds (set when call ends)
  duration?: number;

  // System message ID in chat (for updating message when call ends)
  systemMessageId?: string;
}

/**
 * Firestore version with Timestamp
 */
export interface CallFirestore extends Omit<Call, 'createdAt' | 'answeredAt' | 'endedAt' | 'systemMessageId'> {
  createdAt: Timestamp;
  answeredAt?: Timestamp;
  endedAt?: Timestamp;
  systemMessageId?: string; // Same as Call
}

/**
 * Call signal for real-time communication
 * Used for offer/answer/decline/end signals
 */
export interface CallSignal {
  id: string;
  callId: string;
  type: 'join' | 'leave' | 'decline' | 'end';
  from: string; // email
  fromName: string;
  timestamp: Date;
}

export interface CallSignalFirestore extends Omit<CallSignal, 'timestamp'> {
  timestamp: Timestamp;
}

/**
 * Call participant state (for UI display)
 */
export interface CallParticipant {
  email: string;
  name: string;
  photoURL?: string;
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeaking: boolean;
  isScreenSharing: boolean;
}

/**
 * Local call state (managed by callService)
 */
export interface CallState {
  // Current active call (null if no call)
  activeCall: Call | null;

  // Incoming call waiting for response
  incomingCall: Call | null;

  // Local media state
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;

  // Connection state
  isConnecting: boolean;
  isConnected: boolean;

  // Participants in current call
  participants: CallParticipant[];

  // Error state
  error: string | null;
}

/**
 * Call message data (for displaying in chat)
 */
export interface CallMessageData {
  callId: string;
  type: CallType;
  status: 'started' | 'ended' | 'missed' | 'declined';
  duration?: number; // seconds
  participants: string[]; // emails
}

/**
 * Convert Firestore call to app call
 */
export function firestoreToCall(data: CallFirestore): Call {
  return {
    ...data,
    createdAt: data.createdAt.toDate(),
    answeredAt: data.answeredAt?.toDate(),
    endedAt: data.endedAt?.toDate(),
  };
}

/**
 * Convert Firestore signal to app signal
 */
export function firestoreToSignal(data: CallSignalFirestore): CallSignal {
  return {
    ...data,
    timestamp: data.timestamp.toDate(),
  };
}

/**
 * Generate a unique call ID
 */
export function generateCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate LiveKit room name from call ID
 */
export function generateRoomName(callId: string): string {
  return `room_${callId}`;
}

/**
 * Format call duration for display
 */
export function formatCallDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) {
    return `${secs}s`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get call status display text
 */
export function getCallStatusText(status: CallStatus): string {
  switch (status) {
    case 'ringing':
      return 'Ringing...';
    case 'connecting':
      return 'Connecting...';
    case 'connected':
      return 'In call';
    case 'ended':
      return 'Call ended';
    case 'missed':
      return 'Missed call';
    case 'declined':
      return 'Call declined';
    default:
      return status;
  }
}

/**
 * Get call type icon
 */
export function getCallTypeIcon(type: CallType): string {
  return type === 'video' ? '📹' : '📞';
}
