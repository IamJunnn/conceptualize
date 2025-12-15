/**
 * Recording Types
 * TypeScript interfaces for the call recording system
 */

import { Timestamp } from 'firebase/firestore';

// Recording status lifecycle
export type RecordingStatus = 'recording' | 'processing' | 'completed' | 'failed';

// Recording type (matches call type)
export type RecordingType = 'audio' | 'video';

/**
 * Recording document stored in Firestore
 */
export interface Recording {
  id: string;
  teamId: string;
  channelId: string;
  callId: string; // Associated call ID

  // Recording metadata
  type: RecordingType;
  status: RecordingStatus;

  // Who started the recording
  startedBy: string; // email
  startedByName: string;

  // Participants at time of recording
  participants: string[]; // emails
  participantNames?: string[]; // display names (same order as participants)

  // Channel info for display
  channelName: string;

  // File info (set when processing completes)
  fileUrl?: string; // Firebase Storage or cloud URL
  fileName?: string;
  fileSize?: number; // bytes
  duration?: number; // seconds
  thumbnailUrl?: string; // For video recordings

  // LiveKit Egress info
  egressId?: string; // LiveKit egress ID for tracking
  liveKitRoomName?: string; // Room name for webhook auto-stop

  // Timestamps
  createdAt: Date;
  startedAt: Date;
  endedAt?: Date;
  processedAt?: Date;

  // Error info (if failed)
  error?: string;
}

/**
 * Firestore version with Timestamp
 */
export interface RecordingFirestore extends Omit<Recording, 'createdAt' | 'startedAt' | 'endedAt' | 'processedAt'> {
  createdAt: Timestamp;
  startedAt: Timestamp;
  endedAt?: Timestamp;
  processedAt?: Timestamp;
}

/**
 * Recording state (managed by recordingService)
 */
export interface RecordingState {
  // Currently active recording (null if not recording)
  activeRecording: Recording | null;

  // Is recording in progress
  isRecording: boolean;

  // Loading state
  isStarting: boolean;
  isStopping: boolean;

  // Error state
  error: string | null;
}

/**
 * Recording notification sent to participants
 */
export interface RecordingNotification {
  type: 'started' | 'stopped';
  recordingId: string;
  startedBy: string;
  startedByName: string;
  channelId: string;
}

/**
 * Convert Firestore recording to app recording
 */
export function firestoreToRecording(data: RecordingFirestore): Recording {
  return {
    ...data,
    createdAt: data.createdAt.toDate(),
    startedAt: data.startedAt.toDate(),
    endedAt: data.endedAt?.toDate(),
    processedAt: data.processedAt?.toDate(),
  };
}

/**
 * Generate a unique recording ID
 */
export function generateRecordingId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Format recording duration for display
 */
export function formatRecordingDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format file size for display
 */
export function formatRecordingSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get recording status display text
 */
export function getRecordingStatusText(status: RecordingStatus): string {
  switch (status) {
    case 'recording':
      return 'Recording...';
    case 'processing':
      return 'Processing...';
    case 'completed':
      return 'Ready';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

/**
 * Format recording date for display
 */
export function formatRecordingDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  if (days === 0) {
    return 'Today';
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: now.getFullYear() !== date.getFullYear() ? 'numeric' : undefined,
    });
  }
}

/**
 * Get recording type icon name
 */
export function getRecordingTypeIcon(type: RecordingType): 'Video' | 'Mic' {
  return type === 'video' ? 'Video' : 'Mic';
}
