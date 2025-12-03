/**
 * Team Chat Types
 * TypeScript interfaces for the Discord-style chat system
 */

import { Timestamp } from 'firebase/firestore';

// Channel types
export type ChannelType = 'text' | 'dm';

// Message types
export interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  content: string;
  createdAt: Date;
  updatedAt?: Date;
  edited: boolean;
  deleted: boolean;
  replyTo?: string; // Message ID being replied to
  reactions?: MessageReaction[];
  attachments?: MessageAttachment[];
  mentions?: string[]; // Array of user emails mentioned
}

// Firestore version (with Timestamp)
export interface ChatMessageFirestore extends Omit<ChatMessage, 'createdAt' | 'updatedAt'> {
  createdAt: Timestamp;
  updatedAt?: Timestamp;
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
  return {
    ...data,
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt?.toDate(),
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
 */
export function extractMentions(content: string): string[] {
  const mentionRegex = /@(\S+@\S+\.\S+)/g;
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
  return content.replace(
    /@(\S+@\S+\.\S+)/g,
    (match, email) => {
      const isCurrentUser = email === currentUserEmail;
      return `<span class="mention ${isCurrentUser ? 'mention-me' : ''}">${match}</span>`;
    }
  );
}

/**
 * Check if message mentions user
 */
export function messagesMentionsUser(message: ChatMessage, userEmail: string): boolean {
  return message.mentions?.includes(userEmail) || false;
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
