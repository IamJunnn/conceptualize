/**
 * Team Chat Types
 * TypeScript interfaces for the Discord-style chat system
 */

import { Timestamp } from 'firebase/firestore';

// Channel types
export type ChannelType = 'text' | 'dm' | 'group';

// Message types
export type MessageType = 'text' | 'system' | 'call';

// Call message metadata (for type: 'call')
export interface CallMessageData {
  callId: string;
  callType: 'voice' | 'video';
  status: 'started' | 'ended' | 'missed' | 'declined';
  duration?: number; // seconds (set when call ends)
  initiatorName: string;
  initiatorEmail: string;
}

// Shared file/note reference (for sharing files via chat)
export interface SharedFile {
  path: string; // File path in team drive
  name: string; // Display name
  type: 'file' | 'folder'; // Type of item shared
  driveId?: string; // Google Drive ID (optional)
}

// Shared recording reference (for sharing recordings via chat)
export interface SharedRecording {
  recordingId: string;
  title: string; // e.g., "Call with John and Jane"
  type: 'video' | 'audio';
  duration?: number; // seconds
  fileUrl: string;
  fileSize?: number;
  createdAt: Date;
}

// Shared whiteboard reference (for sharing whiteboards via chat)
export interface SharedWhiteboard {
  whiteboardId: string;
  name: string;
  createdByName: string;
  createdByEmail: string;
}

// Shared todo/meeting reference (for forwarding tasks/meetings to chat)
export interface SharedTodo {
  todoId: string;
  teamId: string;
  text: string;
  type: 'task' | 'meeting';
  priority?: number; // 1-4
  completed: boolean;
  assignees: string[]; // Array of emails
  endDate?: string; // Due date for tasks
  startDate?: string; // For meetings
  meetingDetails?: {
    startTime?: string;
    endTime?: string;
    color?: string;
    hasVideoRoom?: boolean;
  };
  createdBy: string;
}

// Forwarded message info
export interface ForwardedFrom {
  originalSenderName: string;
  originalSenderEmail?: string;
  originalChannelName?: string;
}

// Chat message interface
export interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  senderPhotoURL?: string;
  content: string;
  createdAt: Date;
  updatedAt?: Date;
  edited: boolean;
  deleted: boolean;
  replyTo?: string; // Message ID being replied to
  reactions?: MessageReaction[];
  attachments?: MessageAttachment[];
  mentions?: string[]; // Array of user emails mentioned
  poll?: Poll; // Optional poll data
  sharedFile?: SharedFile; // Shared file/note reference
  sharedRecording?: SharedRecording; // Shared recording reference
  sharedTodo?: SharedTodo; // Shared task/meeting reference
  sharedWhiteboard?: SharedWhiteboard; // Shared whiteboard reference
  type?: MessageType; // 'text' (default), 'system', or 'call'
  callData?: CallMessageData; // Present when type is 'call'
  forwardedFrom?: ForwardedFrom; // Present when message was forwarded
}

// Firestore attachment version (with Timestamp)
export interface MessageAttachmentFirestore extends Omit<MessageAttachment, 'uploadedAt'> {
  uploadedAt: Timestamp | Date;
}

// Firestore version of SharedRecording (with Timestamp)
export interface SharedRecordingFirestore extends Omit<SharedRecording, 'createdAt'> {
  createdAt: Timestamp;
}

// Firestore version (with Timestamp)
export interface ChatMessageFirestore extends Omit<ChatMessage, 'createdAt' | 'updatedAt' | 'attachments' | 'sharedFile' | 'sharedRecording' | 'sharedTodo' | 'sharedWhiteboard' | 'callData'> {
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  attachments?: MessageAttachmentFirestore[];
  sharedFile?: SharedFile; // Shared file is same structure in Firestore
  sharedRecording?: SharedRecordingFirestore; // Recording with Timestamp
  sharedTodo?: SharedTodo; // Shared todo is same structure in Firestore
  sharedWhiteboard?: SharedWhiteboard; // Shared whiteboard is same structure in Firestore
  callData?: CallMessageData; // Same structure in Firestore
}

// Message reaction
export interface MessageReaction {
  emoji: string;
  userIds: string[];
  count: number;
}

// File attachment
export interface MessageAttachment {
  id: string;
  name: string;
  size: number; // bytes
  type: string; // mime type
  url: string; // Firebase Storage download URL
  thumbnailUrl?: string; // For images
  uploadedAt: Date;
  uploadedBy: string;
}

// Poll option
export interface PollOption {
  id: string;
  text: string;
  votes: string[]; // Array of user emails who voted for this option
}

// Poll data
export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  allowMultiple: boolean;
  createdBy: string;
  totalVotes: number;
}

// Channel
export interface Channel {
  id: string;
  teamId: string;
  name: string;
  description?: string;
  type: ChannelType;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;

  // For DM channels
  participants?: string[]; // Array of 2 user emails for DMs

  // Metadata
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  messageCount: number;
}

// Firestore version
export interface ChannelFirestore extends Omit<Channel, 'createdAt' | 'updatedAt' | 'lastMessageAt'> {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastMessageAt?: Timestamp;
}

// Direct message conversation
export interface DMConversation {
  id: string; // channelId
  otherUserEmail: string;
  otherUserName: string;
  lastMessage?: string;
  lastMessageAt?: Date;
  unreadCount: number;
}

// Unread tracking
export interface UnreadTracker {
  userId: string;
  channelId: string;
  lastReadMessageId?: string;
  lastReadAt: Date;
  unreadCount: number;
}

// Typing indicator
export interface TypingIndicator {
  userId: string;
  userName: string;
  channelId: string;
  timestamp: Date;
}

// Chat user presence
export interface UserPresence {
  userId: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: Date;
}

// Message send form
export interface MessageFormData {
  content: string;
  attachments?: File[];
  replyTo?: string;
  mentions?: string[];
}

// Helper functions

/**
 * Convert Firestore message to app message
 */
export function firestoreToMessage(data: ChatMessageFirestore): ChatMessage {
  // Convert Firestore attachments (with Timestamp uploadedAt) to app attachments (with Date)
  const convertedAttachments: MessageAttachment[] | undefined = data.attachments?.map(att => ({
    ...att,
    uploadedAt: att.uploadedAt instanceof Date ? att.uploadedAt : (att.uploadedAt as Timestamp).toDate(),
  }));

  // Convert sharedRecording createdAt if present
  const convertedRecording: SharedRecording | undefined = data.sharedRecording ? {
    ...data.sharedRecording,
    createdAt: data.sharedRecording.createdAt instanceof Date
      ? data.sharedRecording.createdAt
      : (data.sharedRecording.createdAt as Timestamp).toDate(),
  } : undefined;

  return {
    ...data,
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt?.toDate(),
    attachments: convertedAttachments,
    sharedRecording: convertedRecording,
  };
}

/**
 * Convert Firestore channel to app channel
 */
export function firestoreToChannel(data: ChannelFirestore): Channel {
  return {
    ...data,
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt.toDate(),
    lastMessageAt: data.lastMessageAt?.toDate(),
  };
}

/**
 * Generate DM channel ID from two user emails (deterministic)
 */
export function generateDMChannelId(email1: string, email2: string): string {
  const sorted = [email1, email2].sort();
  return `dm_${sorted[0]}_${sorted[1]}`.replace(/[@.]/g, '_');
}

/**
 * Check if channel is a DM
 */
export function isDMChannel(channel: Channel): boolean {
  return channel.type === 'dm';
}

/**
 * Get other user in DM
 */
export function getOtherUserInDM(channel: Channel, currentUserEmail: string): string | null {
  if (!isDMChannel(channel) || !channel.participants) {
    return null;
  }
  return channel.participants.find(email => email !== currentUserEmail) || null;
}

/**
 * Format message timestamp
 */
export function formatMessageTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // Today: show time
  if (diff < 24 * 60 * 60 * 1000 && now.getDate() === date.getDate()) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  // This week: show day
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }

  // Older: show date
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Extract mentions from message content
 * Matches @username patterns (word characters after @)
 */
export function extractMentions(content: string): string[] {
  const mentionRegex = /@([a-zA-Z0-9_.-]+)(?=\s|$)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

/**
 * Highlight mentions in message
 */
export function highlightMentions(content: string, currentUserEmail: string): string {
  const currentUserDisplayName = currentUserEmail.split('@')[0].toLowerCase();
  return content.replace(
    /@([a-zA-Z0-9_.-]+)(?=\s|$)/g,
    (match, username) => {
      const isCurrentUser = username.toLowerCase() === currentUserDisplayName;
      return `<span class="mention ${isCurrentUser ? 'mention-me' : ''}">${match}</span>`;
    }
  );
}

/**
 * Check if message mentions user
 * Compares username (part before @) since mentions now store usernames
 */
export function messagesMentionsUser(message: ChatMessage, userEmail: string): boolean {
  const username = userEmail.split('@')[0].toLowerCase();
  return message.mentions?.some(mention => mention.toLowerCase() === username) || false;
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Check if file is an image
 */
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Check if file is a PDF
 */
export function isPDFFile(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}
