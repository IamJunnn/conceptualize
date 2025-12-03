/**
 * Team Chat Service
 * Handles all Firestore operations for the Discord-style chat system
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  DocumentData,
  QuerySnapshot,
  Unsubscribe,
  startAfter,
  DocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  Channel,
  ChannelFirestore,
  ChatMessage,
  ChatMessageFirestore,
  MessageFormData,
  ChannelType,
  firestoreToChannel,
  firestoreToMessage,
  generateDMChannelId,
  extractMentions,
} from './teamChatTypes';

// ============================================================================
// CHANNELS
// ============================================================================

/**
 * Create a new text channel
 */
export async function createChannel(
  teamId: string,
  name: string,
  description: string,
  createdBy: string
): Promise<string> {
  try {
    const channelData: Omit<ChannelFirestore, 'id'> = {
      teamId,
      name: name.trim(),
      description: description.trim() || undefined,
      type: 'text',
      createdBy,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      messageCount: 0,
    };

    const channelRef = await addDoc(
      collection(db, 'teams', teamId, 'channels'),
      channelData
    );

    console.log(` Created channel: ${name} (${channelRef.id})`);
    return channelRef.id;
  } catch (error) {
    console.error('Error creating channel:', error);
    throw error;
  }
}

/**
 * Create or get DM channel between two users
 */
export async function getOrCreateDMChannel(
  teamId: string,
  userEmail1: string,
  userEmail2: string
): Promise<string> {
  try {
    const dmId = generateDMChannelId(userEmail1, userEmail2);
    const channelRef = doc(db, 'teams', teamId, 'channels', dmId);
    const channelSnap = await getDoc(channelRef);

    if (channelSnap.exists()) {
      return channelSnap.id;
    }

    // Create new DM channel
    const channelData: ChannelFirestore = {
      id: dmId,
      teamId,
      name: '', // DM channels don't have names
      type: 'dm',
      createdBy: userEmail1,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      participants: [userEmail1, userEmail2],
      messageCount: 0,
    };

    await updateDoc(channelRef, channelData as DocumentData);
    console.log(` Created DM channel: ${dmId}`);
    return dmId;
  } catch (error) {
    console.error('Error creating DM channel:', error);
    throw error;
  }
}

/**
 * Get all channels for a team
 */
export async function getChannels(teamId: string): Promise<Channel[]> {
  try {
    const channelsRef = collection(db, 'teams', teamId, 'channels');
    const q = query(
      channelsRef,
      where('type', '==', 'text'),
      orderBy('createdAt', 'asc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data() as ChannelFirestore;
      return firestoreToChannel({ ...data, id: doc.id });
    });
  } catch (error) {
    console.error('Error getting channels:', error);
    throw error;
  }
}

/**
 * Subscribe to real-time channel updates
 */
export function subscribeToChannels(
  teamId: string,
  onUpdate: (channels: Channel[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const channelsRef = collection(db, 'teams', teamId, 'channels');
  const q = query(
    channelsRef,
    where('type', '==', 'text'),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const channels = snapshot.docs.map(doc => {
        const data = doc.data() as ChannelFirestore;
        return firestoreToChannel({ ...data, id: doc.id });
      });
      onUpdate(channels);
    },
    (error) => {
      console.error('Channel subscription error:', error);
      onError?.(error as Error);
    }
  );
}

/**
 * Update channel
 */
export async function updateChannel(
  teamId: string,
  channelId: string,
  updates: Partial<Pick<Channel, 'name' | 'description'>>
): Promise<void> {
  try {
    const channelRef = doc(db, 'teams', teamId, 'channels', channelId);
    await updateDoc(channelRef, {
      ...updates,
      updatedAt: Timestamp.now(),
    });
    console.log(` Updated channel: ${channelId}`);
  } catch (error) {
    console.error('Error updating channel:', error);
    throw error;
  }
}

/**
 * Delete channel
 */
export async function deleteChannel(
  teamId: string,
  channelId: string
): Promise<void> {
  try {
    // TODO: Also delete all messages in the channel
    const channelRef = doc(db, 'teams', teamId, 'channels', channelId);
    await deleteDoc(channelRef);
    console.log(` Deleted channel: ${channelId}`);
  } catch (error) {
    console.error('Error deleting channel:', error);
    throw error;
  }
}

// ============================================================================
// MESSAGES
// ============================================================================

/**
 * Send a new message
 */
export async function sendMessage(
  teamId: string,
  channelId: string,
  formData: MessageFormData,
  senderEmail: string,
  senderName: string
): Promise<string> {
  try {
    const mentions = extractMentions(formData.content);

    const messageData: Omit<ChatMessageFirestore, 'id'> = {
      channelId,
      senderId: senderEmail,
      senderName,
      senderEmail,
      content: formData.content.trim(),
      createdAt: Timestamp.now(),
      edited: false,
      deleted: false,
      mentions: mentions.length > 0 ? mentions : undefined,
      replyTo: formData.replyTo,
      attachments: [], // Attachments handled separately
    };

    const messagesRef = collection(
      db,
      'teams',
      teamId,
      'messages',
      channelId,
      'items'
    );
    const messageRef = await addDoc(messagesRef, messageData);

    // Update channel's last message info
    const channelRef = doc(db, 'teams', teamId, 'channels', channelId);
    await updateDoc(channelRef, {
      lastMessageAt: Timestamp.now(),
      lastMessagePreview: formData.content.substring(0, 100),
      messageCount: (await getDoc(channelRef)).data()?.messageCount + 1 || 1,
      updatedAt: Timestamp.now(),
    });

    console.log(` Sent message to channel: ${channelId}`);
    return messageRef.id;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

/**
 * Get messages for a channel (paginated)
 */
export async function getMessages(
  teamId: string,
  channelId: string,
  limitCount: number = 50,
  startAfterDoc?: DocumentSnapshot
): Promise<{ messages: ChatMessage[]; lastDoc: DocumentSnapshot | null }> {
  try {
    const messagesRef = collection(
      db,
      'teams',
      teamId,
      'messages',
      channelId,
      'items'
    );

    let q = query(
      messagesRef,
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    if (startAfterDoc) {
      q = query(q, startAfter(startAfterDoc));
    }

    const snapshot = await getDocs(q);
    const messages = snapshot.docs
      .map(doc => {
        const data = doc.data() as ChatMessageFirestore;
        return firestoreToMessage({ ...data, id: doc.id });
      })
      .reverse(); // Reverse to show oldest first

    const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;

    return { messages, lastDoc };
  } catch (error) {
    console.error('Error getting messages:', error);
    throw error;
  }
}

/**
 * Subscribe to real-time messages
 */
export function subscribeToMessages(
  teamId: string,
  channelId: string,
  onUpdate: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void,
  limitCount: number = 50
): Unsubscribe {
  const messagesRef = collection(
    db,
    'teams',
    teamId,
    'messages',
    channelId,
    'items'
  );

  const q = query(
    messagesRef,
    orderBy('createdAt', 'asc'),
    limit(limitCount)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const messages = snapshot.docs.map(doc => {
        const data = doc.data() as ChatMessageFirestore;
        return firestoreToMessage({ ...data, id: doc.id });
      });
      onUpdate(messages);
    },
    (error) => {
      console.error('Message subscription error:', error);
      onError?.(error as Error);
    }
  );
}

/**
 * Edit a message
 */
export async function editMessage(
  teamId: string,
  channelId: string,
  messageId: string,
  newContent: string
): Promise<void> {
  try {
    const messageRef = doc(
      db,
      'teams',
      teamId,
      'messages',
      channelId,
      'items',
      messageId
    );

    await updateDoc(messageRef, {
      content: newContent.trim(),
      edited: true,
      updatedAt: Timestamp.now(),
      mentions: extractMentions(newContent),
    });

    console.log(` Edited message: ${messageId}`);
  } catch (error) {
    console.error('Error editing message:', error);
    throw error;
  }
}

/**
 * Delete a message
 */
export async function deleteMessage(
  teamId: string,
  channelId: string,
  messageId: string
): Promise<void> {
  try {
    const messageRef = doc(
      db,
      'teams',
      teamId,
      'messages',
      channelId,
      'items',
      messageId
    );

    // Soft delete
    await updateDoc(messageRef, {
      deleted: true,
      content: '[Message deleted]',
      updatedAt: Timestamp.now(),
    });

    console.log(` Deleted message: ${messageId}`);
  } catch (error) {
    console.error('Error deleting message:', error);
    throw error;
  }
}

/**
 * Add reaction to message
 */
export async function addReaction(
  teamId: string,
  channelId: string,
  messageId: string,
  emoji: string,
  userId: string
): Promise<void> {
  try {
    const messageRef = doc(
      db,
      'teams',
      teamId,
      'messages',
      channelId,
      'items',
      messageId
    );

    const messageSnap = await getDoc(messageRef);
    if (!messageSnap.exists()) {
      throw new Error('Message not found');
    }

    const data = messageSnap.data() as ChatMessageFirestore;
    const reactions = data.reactions || [];

    // Find existing reaction with this emoji
    const existingReaction = reactions.find(r => r.emoji === emoji);

    if (existingReaction) {
      // Add user to existing reaction if not already there
      if (!existingReaction.userIds.includes(userId)) {
        existingReaction.userIds.push(userId);
        existingReaction.count = existingReaction.userIds.length;
      }
    } else {
      // Create new reaction
      reactions.push({
        emoji,
        userIds: [userId],
        count: 1,
      });
    }

    await updateDoc(messageRef, { reactions });
    console.log(` Added reaction: ${emoji} to message ${messageId}`);
  } catch (error) {
    console.error('Error adding reaction:', error);
    throw error;
  }
}

/**
 * Remove reaction from message
 */
export async function removeReaction(
  teamId: string,
  channelId: string,
  messageId: string,
  emoji: string,
  userId: string
): Promise<void> {
  try {
    const messageRef = doc(
      db,
      'teams',
      teamId,
      'messages',
      channelId,
      'items',
      messageId
    );

    const messageSnap = await getDoc(messageRef);
    if (!messageSnap.exists()) {
      throw new Error('Message not found');
    }

    const data = messageSnap.data() as ChatMessageFirestore;
    let reactions = data.reactions || [];

    reactions = reactions
      .map(r => {
        if (r.emoji === emoji) {
          r.userIds = r.userIds.filter(id => id !== userId);
          r.count = r.userIds.length;
        }
        return r;
      })
      .filter(r => r.count > 0); // Remove reactions with no users

    await updateDoc(messageRef, { reactions });
    console.log(` Removed reaction: ${emoji} from message ${messageId}`);
  } catch (error) {
    console.error('Error removing reaction:', error);
    throw error;
  }
}

// ============================================================================
// DM HELPERS
// ============================================================================

/**
 * Get all DM conversations for a user
 */
export async function getDMConversations(
  teamId: string,
  userEmail: string
): Promise<Channel[]> {
  try {
    const channelsRef = collection(db, 'teams', teamId, 'channels');
    const q = query(
      channelsRef,
      where('type', '==', 'dm'),
      where('participants', 'array-contains', userEmail)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data() as ChannelFirestore;
      return firestoreToChannel({ ...data, id: doc.id });
    });
  } catch (error) {
    console.error('Error getting DM conversations:', error);
    throw error;
  }
}

/**
 * Subscribe to DM conversations
 */
export function subscribeToDMConversations(
  teamId: string,
  userEmail: string,
  onUpdate: (conversations: Channel[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const channelsRef = collection(db, 'teams', teamId, 'channels');
  const q = query(
    channelsRef,
    where('type', '==', 'dm'),
    where('participants', 'array-contains', userEmail)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const conversations = snapshot.docs.map(doc => {
        const data = doc.data() as ChannelFirestore;
        return firestoreToChannel({ ...data, id: doc.id });
      });
      onUpdate(conversations);
    },
    (error) => {
      console.error('DM subscription error:', error);
      onError?.(error as Error);
    }
  );
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Initialize default channels for a new team
 */
export async function initializeTeamChannels(
  teamId: string,
  createdBy: string
): Promise<void> {
  try {
    // Create default #general channel
    await createChannel(
      teamId,
      'general',
      'General team discussion',
      createdBy
    );

    console.log(` Initialized default channels for team: ${teamId}`);
  } catch (error) {
    console.error('Error initializing team channels:', error);
    throw error;
  }
}

/**
 * Get channel by ID
 */
export async function getChannel(
  teamId: string,
  channelId: string
): Promise<Channel | null> {
  try {
    const channelRef = doc(db, 'teams', teamId, 'channels', channelId);
    const channelSnap = await getDoc(channelRef);

    if (!channelSnap.exists()) {
      return null;
    }

    const data = channelSnap.data() as ChannelFirestore;
    return firestoreToChannel({ ...data, id: channelSnap.id });
  } catch (error) {
    console.error('Error getting channel:', error);
    return null;
  }
}
