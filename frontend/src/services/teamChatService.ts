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
  setDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  Unsubscribe,
  startAfter,
  DocumentSnapshot,
  arrayUnion,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  Channel,
  ChannelFirestore,
  ChatMessage,
  ChatMessageFirestore,
  MessageFormData,
  MessageAttachment,
  Poll,
  SharedFile,
  SharedRecording,
  SharedRecordingFirestore,
  SharedTodo,
  SharedWhiteboard,
  CallMessageData,
  ForwardedFrom,
  firestoreToChannel,
  firestoreToMessage,
  generateDMChannelId,
  extractMentions,
} from './teamChatTypes';

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export type TeamNotificationType = 'group_invite' | 'group_added' | 'mention' | 'reply' | 'message' | 'todo_assigned' | 'meeting_invite' | 'member_joined' | 'billing_updated' | 'billing_warning';

export interface TeamNotification {
  id: string;
  type: TeamNotificationType;
  title: string;
  message: string;
  recipientEmail: string;
  senderEmail: string;
  senderName: string;
  createdAt: Date;
  read: boolean;
  // Optional link data
  channelId?: string;
  channelName?: string;
  messageId?: string;
  todoId?: string;
  todoTitle?: string;
}

interface TeamNotificationFirestore {
  id?: string;
  type: TeamNotificationType;
  title: string;
  message: string;
  recipientEmail: string;
  senderEmail: string;
  senderName: string;
  createdAt: Timestamp;
  read: boolean;
  channelId?: string;
  channelName?: string;
  messageId?: string;
  todoId?: string;
  todoTitle?: string;
}

function firestoreToNotification(data: TeamNotificationFirestore & { id: string }): TeamNotification {
  return {
    id: data.id,
    type: data.type,
    title: data.title,
    message: data.message,
    recipientEmail: data.recipientEmail,
    senderEmail: data.senderEmail,
    senderName: data.senderName,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt),
    read: data.read,
    channelId: data.channelId,
    channelName: data.channelName,
    messageId: data.messageId,
    todoId: data.todoId,
    todoTitle: data.todoTitle,
  };
}

// ============================================================================
// CHANNELS
// ============================================================================

/**
 * Get or create a meeting channel for video calls
 * Creates a dedicated channel for a meeting if it doesn't exist
 */
export async function getOrCreateMeetingChannel(
  teamId: string,
  meetingId: string,
  meetingTitle: string,
  createdBy: string,
  participants: string[]
): Promise<string> {
  try {
    const channelId = `meeting_${meetingId}`;
    const channelRef = doc(db, 'teams', teamId, 'channels', channelId);
    const channelSnap = await getDoc(channelRef);

    if (channelSnap.exists()) {
      return channelSnap.id;
    }

    // Create new meeting channel
    const channelData: ChannelFirestore = {
      id: channelId,
      teamId,
      name: meetingTitle,
      description: `Meeting channel for: ${meetingTitle}`,
      type: 'group', // Use group type for meetings
      createdBy,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      participants,
      messageCount: 0,
    };

    await setDoc(channelRef, channelData);
    console.log('Created meeting channel:', channelId);
    return channelId;
  } catch (error) {
    console.error('Error creating meeting channel:', error);
    throw error;
  }
}

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

    console.log('Created channel:', name, channelRef.id);
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

    // Use setDoc to create a new document (updateDoc only works on existing docs)
    await setDoc(channelRef, channelData);
    console.log('Created DM channel:', dmId);
    return dmId;
  } catch (error) {
    console.error('Error creating DM channel:', error);
    throw error;
  }
}

/**
 * Get all channels for a team (text and group channels)
 */
export async function getChannels(teamId: string): Promise<Channel[]> {
  try {
    const channelsRef = collection(db, 'teams', teamId, 'channels');
    const q = query(
      channelsRef,
      where('type', 'in', ['text', 'group']),
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
 * Subscribe to real-time channel updates (text and group channels)
 */
export function subscribeToChannels(
  teamId: string,
  onUpdate: (channels: Channel[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const channelsRef = collection(db, 'teams', teamId, 'channels');
  const q = query(
    channelsRef,
    where('type', 'in', ['text', 'group']),
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
    console.log('Updated channel:', channelId);
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
    // Delete all messages in the channel first
    const messagesRef = collection(db, 'teams', teamId, 'messages', channelId, 'items');
    const messagesSnapshot = await getDocs(messagesRef);

    // Delete messages in batches
    const deletePromises = messagesSnapshot.docs.map(msgDoc => deleteDoc(msgDoc.ref));
    await Promise.all(deletePromises);
    console.log(`Deleted ${messagesSnapshot.size} messages from channel:`, channelId);

    // Now delete the channel document
    const channelRef = doc(db, 'teams', teamId, 'channels', channelId);
    await deleteDoc(channelRef);
    console.log('Deleted channel:', channelId);
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
  senderName: string,
  senderPhotoURL?: string,
  attachments?: MessageAttachment[],
  poll?: Poll,
  sharedFile?: SharedFile,
  sharedRecording?: SharedRecording,
  forwardedFrom?: ForwardedFrom,
  sharedTodo?: SharedTodo,
  sharedWhiteboard?: SharedWhiteboard
): Promise<string> {
  try {
    const mentions = extractMentions(formData.content);

    // Convert attachment dates to Firestore-compatible format
    const firestoreAttachments = attachments?.map(att => ({
      ...att,
      uploadedAt: att.uploadedAt instanceof Date
        ? Timestamp.fromDate(att.uploadedAt)
        : att.uploadedAt,
    }));

    // Convert sharedRecording createdAt to Timestamp for Firestore
    const firestoreRecording: SharedRecordingFirestore | undefined = sharedRecording ? {
      recordingId: sharedRecording.recordingId,
      title: sharedRecording.title,
      type: sharedRecording.type,
      fileUrl: sharedRecording.fileUrl,
      createdAt: sharedRecording.createdAt instanceof Date
        ? Timestamp.fromDate(sharedRecording.createdAt)
        : Timestamp.fromDate(new Date(sharedRecording.createdAt)),
      ...(sharedRecording.duration !== undefined && { duration: sharedRecording.duration }),
      ...(sharedRecording.fileSize !== undefined && { fileSize: sharedRecording.fileSize }),
    } : undefined;

    const messageData: Omit<ChatMessageFirestore, 'id'> = {
      channelId,
      senderId: senderEmail,
      senderName,
      senderEmail,
      content: formData.content.trim(),
      createdAt: Timestamp.now(),
      edited: false,
      deleted: false,
      // Only include optional fields if they have values (Firestore rejects undefined)
      ...(senderPhotoURL && { senderPhotoURL }),
      ...(mentions.length > 0 && { mentions }),
      ...(formData.replyTo && { replyTo: formData.replyTo }),
      ...(firestoreAttachments && firestoreAttachments.length > 0 && { attachments: firestoreAttachments }),
      ...(poll && { poll }),
      ...(sharedFile && { sharedFile }),
      ...(firestoreRecording && { sharedRecording: firestoreRecording }),
      ...(forwardedFrom && { forwardedFrom }),
      ...(sharedTodo && { sharedTodo }),
      ...(sharedWhiteboard && { sharedWhiteboard }),
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

    // Update channel's last message info and get channel data for notifications
    const channelRef = doc(db, 'teams', teamId, 'channels', channelId);
    const channelSnap = await getDoc(channelRef);
    const channelData = channelSnap.data() as ChannelFirestore | undefined;

    const lastMessagePreview = poll
      ? `Poll: ${poll.question}`
      : sharedRecording
        ? `Recording: ${sharedRecording.title}`
        : sharedFile
          ? `Shared: ${sharedFile.name.replace(/\.md$/, '')}`
          : formData.content.substring(0, 100);
    await updateDoc(channelRef, {
      lastMessageAt: Timestamp.now(),
      lastMessagePreview,
      messageCount: (channelData?.messageCount || 0) + 1,
      updatedAt: Timestamp.now(),
    });

    // Send notifications to other participants (don't notify sender)
    if (channelData?.participants) {
      const recipientEmails = channelData.participants.filter(email => email !== senderEmail);

      if (recipientEmails.length > 0) {
        const channelName = channelData.type === 'dm' ? senderName : (channelData.name || 'Group Chat');
        const notificationTitle = channelData.type === 'dm' ? 'New Message' : `New message in ${channelName}`;
        const messagePreview = poll
          ? `Poll: ${poll.question}`
          : sharedRecording
            ? `Recording: ${sharedRecording.title}`
            : sharedFile
              ? `Shared: ${sharedFile.name.replace(/\.md$/, '')}`
              : formData.content.length > 50
                ? formData.content.substring(0, 50) + '...'
                : formData.content;

        // Create notifications for all recipients (fire and forget, don't block message send)
        createBulkNotifications(teamId, recipientEmails, {
          type: 'message',
          title: notificationTitle,
          message: `${senderName}: ${messagePreview}`,
          senderEmail,
          senderName,
          channelId,
          channelName,
          messageId: messageRef.id,
        }).catch(err => console.error('Error sending message notifications:', err));
      }
    }

    console.log('Sent message to channel:', channelId);
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

    const newMentions = extractMentions(newContent);
    await updateDoc(messageRef, {
      content: newContent.trim(),
      edited: true,
      updatedAt: Timestamp.now(),
      ...(newMentions.length > 0 ? { mentions: newMentions } : { mentions: [] }),
    });

    console.log('Edited message:', messageId);
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

    console.log('Deleted message:', messageId);
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
    console.log('Added reaction:', emoji, 'to message', messageId);
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
    console.log('Removed reaction:', emoji, 'from message', messageId);
  } catch (error) {
    console.error('Error removing reaction:', error);
    throw error;
  }
}

// ============================================================================
// GROUP CHAT
// ============================================================================

/**
 * Create a new group chat channel
 */
export async function createGroupChannel(
  teamId: string,
  name: string,
  memberEmails: string[],
  createdBy: string,
  createdByName?: string
): Promise<string> {
  try {
    // Generate a unique group ID
    const groupId = `group_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Include creator in members if not already
    const allMembers = memberEmails.includes(createdBy)
      ? memberEmails
      : [createdBy, ...memberEmails];

    const groupName = name.trim() || `Group (${allMembers.length})`;

    const channelData: ChannelFirestore = {
      id: groupId,
      teamId,
      name: groupName,
      type: 'group',
      createdBy,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      participants: allMembers,
      messageCount: 0,
    };

    const channelRef = doc(db, 'teams', teamId, 'channels', groupId);
    await setDoc(channelRef, channelData);

    console.log('Created group channel:', groupId, 'with members:', allMembers);

    // Create notifications for all members except the creator
    const notifyMembers = allMembers.filter(email => email !== createdBy);
    if (notifyMembers.length > 0) {
      const senderName = createdByName || createdBy.split('@')[0];
      await createBulkNotifications(teamId, notifyMembers, {
        type: 'group_invite',
        title: 'Added to Group Chat',
        message: `${senderName} added you to "${groupName}"`,
        senderEmail: createdBy,
        senderName,
        channelId: groupId,
        channelName: groupName,
      });
    }

    return groupId;
  } catch (error) {
    console.error('Error creating group channel:', error);
    throw error;
  }
}

/**
 * Add members to an existing group channel
 */
export async function addMembersToGroup(
  teamId: string,
  channelId: string,
  newMemberEmails: string[],
  addedBy?: string,
  addedByName?: string
): Promise<void> {
  try {
    const channelRef = doc(db, 'teams', teamId, 'channels', channelId);

    // Get the channel to get its name
    const channelSnap = await getDoc(channelRef);
    const channelData = channelSnap.data() as ChannelFirestore | undefined;
    const groupName = channelData?.name || 'Group Chat';

    await updateDoc(channelRef, {
      participants: arrayUnion(...newMemberEmails),
      updatedAt: Timestamp.now(),
    });
    console.log('Added members to group:', channelId, 'new members:', newMemberEmails);

    // Create notifications for the new members
    if (newMemberEmails.length > 0 && addedBy) {
      const senderName = addedByName || addedBy.split('@')[0];
      await createBulkNotifications(teamId, newMemberEmails, {
        type: 'group_added',
        title: 'Added to Group Chat',
        message: `${senderName} added you to "${groupName}"`,
        senderEmail: addedBy,
        senderName,
        channelId,
        channelName: groupName,
      });
    }
  } catch (error) {
    console.error('Error adding members to group:', error);
    throw error;
  }
}

/**
 * Get all group conversations for a user
 */
export async function getGroupConversations(
  teamId: string,
  userEmail: string
): Promise<Channel[]> {
  try {
    const channelsRef = collection(db, 'teams', teamId, 'channels');
    const q = query(
      channelsRef,
      where('type', '==', 'group'),
      where('participants', 'array-contains', userEmail)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data() as ChannelFirestore;
      return firestoreToChannel({ ...data, id: doc.id });
    });
  } catch (error) {
    console.error('Error getting group conversations:', error);
    throw error;
  }
}

/**
 * Subscribe to group conversations
 */
export function subscribeToGroupConversations(
  teamId: string,
  userEmail: string,
  onUpdate: (conversations: Channel[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const channelsRef = collection(db, 'teams', teamId, 'channels');
  const q = query(
    channelsRef,
    where('type', '==', 'group'),
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
      console.error('Group subscription error:', error);
      onError?.(error as Error);
    }
  );
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

    console.log('Initialized default channels for team:', teamId);
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

// ============================================================================
// POLLS
// ============================================================================

/**
 * Vote on a poll option (toggle vote)
 * If user has already voted for this option, removes their vote
 * If user hasn't voted for this option, adds their vote
 * For single-select polls, removes vote from other options first
 */
export async function votePoll(
  teamId: string,
  channelId: string,
  messageId: string,
  optionId: string,
  userEmail: string
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
    if (!data.poll) {
      throw new Error('Message does not contain a poll');
    }

    const poll = data.poll as Poll;
    const updatedOptions = [...poll.options];

    // Find the option being voted on
    const optionIndex = updatedOptions.findIndex(opt => opt.id === optionId);
    if (optionIndex === -1) {
      throw new Error('Poll option not found');
    }

    const option = updatedOptions[optionIndex];
    const hasVoted = option.votes.includes(userEmail);

    if (hasVoted) {
      // Remove vote
      updatedOptions[optionIndex] = {
        ...option,
        votes: option.votes.filter(email => email !== userEmail),
      };
    } else {
      // For single-select polls, remove vote from other options first
      if (!poll.allowMultiple) {
        updatedOptions.forEach((opt, idx) => {
          if (opt.votes.includes(userEmail)) {
            updatedOptions[idx] = {
              ...opt,
              votes: opt.votes.filter(email => email !== userEmail),
            };
          }
        });
      }

      // Add vote to this option
      updatedOptions[optionIndex] = {
        ...option,
        votes: [...option.votes, userEmail],
      };
    }

    // Calculate total votes
    const totalVotes = updatedOptions.reduce(
      (sum, opt) => sum + opt.votes.length,
      0
    );

    // Update the message with new poll data
    await updateDoc(messageRef, {
      poll: {
        ...poll,
        options: updatedOptions,
        totalVotes,
      },
    });

    console.log('Voted on poll:', messageId, 'option:', optionId);
  } catch (error) {
    console.error('Error voting on poll:', error);
    throw error;
  }
}

// ============================================================================
// UNREAD MESSAGE TRACKING
// ============================================================================

const LAST_READ_KEY_PREFIX = 'chat_last_read_';

/**
 * Get the last read timestamp for a channel
 */
export function getLastReadTimestamp(teamId: string, channelId: string): Date | null {
  try {
    const key = `${LAST_READ_KEY_PREFIX}${teamId}_${channelId}`;
    const saved = localStorage.getItem(key);
    return saved ? new Date(saved) : null;
  } catch {
    return null;
  }
}

/**
 * Set the last read timestamp for a channel to now
 */
export function markChannelAsRead(teamId: string, channelId: string): void {
  try {
    const key = `${LAST_READ_KEY_PREFIX}${teamId}_${channelId}`;
    localStorage.setItem(key, new Date().toISOString());
  } catch (e) {
    console.error('Failed to mark channel as read:', e);
  }
}

/**
 * Get unread message count for a channel
 */
export async function getUnreadCount(
  teamId: string,
  channelId: string,
  currentUserEmail: string
): Promise<number> {
  try {
    const lastRead = getLastReadTimestamp(teamId, channelId);

    const messagesRef = collection(
      db,
      'teams',
      teamId,
      'messages',
      channelId,
      'items'
    );

    let q;
    if (lastRead) {
      q = query(
        messagesRef,
        where('createdAt', '>', Timestamp.fromDate(lastRead)),
        where('senderEmail', '!=', currentUserEmail)
      );
    } else {
      // If never read, count all messages not from current user (max 99)
      q = query(
        messagesRef,
        where('senderEmail', '!=', currentUserEmail),
        orderBy('senderEmail'),
        orderBy('createdAt', 'desc'),
        limit(100)
      );
    }

    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
}

/**
 * Subscribe to unread counts for all DM channels
 */
export function subscribeToUnreadCounts(
  teamId: string,
  currentUserEmail: string,
  channelIds: string[],
  onUpdate: (counts: { [channelId: string]: number }) => void
): Unsubscribe {
  const unsubscribes: Unsubscribe[] = [];
  const counts: { [channelId: string]: number } = {};

  // Initialize all counts to 0
  channelIds.forEach(id => {
    counts[id] = 0;
  });

  // Subscribe to each channel's messages
  channelIds.forEach(channelId => {
    const messagesRef = collection(
      db,
      'teams',
      teamId,
      'messages',
      channelId,
      'items'
    );

    const lastRead = getLastReadTimestamp(teamId, channelId);

    // Query for recent messages
    const q = lastRead
      ? query(
          messagesRef,
          where('createdAt', '>', Timestamp.fromDate(lastRead)),
          orderBy('createdAt', 'desc'),
          limit(50)
        )
      : query(
          messagesRef,
          orderBy('createdAt', 'desc'),
          limit(50)
        );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        // Count messages not from current user
        const unreadCount = snapshot.docs.filter(doc => {
          const data = doc.data();
          return data.senderEmail !== currentUserEmail;
        }).length;

        counts[channelId] = unreadCount;
        onUpdate({ ...counts });
      },
      (error) => {
        console.error(`Error subscribing to unread for ${channelId}:`, error);
      }
    );

    unsubscribes.push(unsub);
  });

  // Return a function to unsubscribe from all
  return () => {
    unsubscribes.forEach(unsub => unsub());
  };
}

// ============================================================================
// TEAM NOTIFICATIONS
// ============================================================================

/**
 * Create a notification for a user
 */
export async function createNotification(
  teamId: string,
  notification: Omit<TeamNotification, 'id' | 'createdAt' | 'read'>
): Promise<string> {
  try {
    const notificationData: Omit<TeamNotificationFirestore, 'id'> = {
      type: notification.type,
      title: notification.title,
      message: notification.message,
      recipientEmail: notification.recipientEmail,
      senderEmail: notification.senderEmail,
      senderName: notification.senderName,
      createdAt: Timestamp.now(),
      read: false,
      ...(notification.channelId && { channelId: notification.channelId }),
      ...(notification.channelName && { channelName: notification.channelName }),
      ...(notification.messageId && { messageId: notification.messageId }),
      ...(notification.todoId && { todoId: notification.todoId }),
      ...(notification.todoTitle && { todoTitle: notification.todoTitle }),
    };

    const notificationsRef = collection(db, 'teams', teamId, 'notifications');
    const docRef = await addDoc(notificationsRef, notificationData);

    console.log('Created notification for:', notification.recipientEmail, 'type:', notification.type);
    return docRef.id;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
}

/**
 * Create notifications for multiple users (e.g., when creating a group)
 */
export async function createBulkNotifications(
  teamId: string,
  recipientEmails: string[],
  notificationBase: Omit<TeamNotification, 'id' | 'createdAt' | 'read' | 'recipientEmail'>
): Promise<void> {
  try {
    const promises = recipientEmails.map(email =>
      createNotification(teamId, {
        ...notificationBase,
        recipientEmail: email,
      })
    );
    await Promise.all(promises);
    console.log('Created bulk notifications for', recipientEmails.length, 'users');
  } catch (error) {
    console.error('Error creating bulk notifications:', error);
    throw error;
  }
}

/**
 * Subscribe to notifications for the current user
 */
export function subscribeToNotifications(
  teamId: string,
  userEmail: string,
  onUpdate: (notifications: TeamNotification[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const notificationsRef = collection(db, 'teams', teamId, 'notifications');
  const q = query(
    notificationsRef,
    where('recipientEmail', '==', userEmail),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const notifications = snapshot.docs.map(doc => {
        const data = doc.data() as TeamNotificationFirestore;
        return firestoreToNotification({ ...data, id: doc.id });
      });
      onUpdate(notifications);
    },
    (error) => {
      console.error('Notification subscription error:', error);
      onError?.(error as Error);
    }
  );
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(
  teamId: string,
  notificationId: string
): Promise<void> {
  try {
    const notificationRef = doc(db, 'teams', teamId, 'notifications', notificationId);
    await updateDoc(notificationRef, { read: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(
  teamId: string,
  userEmail: string
): Promise<void> {
  try {
    const notificationsRef = collection(db, 'teams', teamId, 'notifications');
    const q = query(
      notificationsRef,
      where('recipientEmail', '==', userEmail),
      where('read', '==', false)
    );

    const snapshot = await getDocs(q);
    const updatePromises = snapshot.docs.map(docSnap =>
      updateDoc(doc(db, 'teams', teamId, 'notifications', docSnap.id), { read: true })
    );

    await Promise.all(updatePromises);
    console.log('Marked all notifications as read for:', userEmail);
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
}

/**
 * Delete a notification
 */
export async function deleteNotification(
  teamId: string,
  notificationId: string
): Promise<void> {
  try {
    const notificationRef = doc(db, 'teams', teamId, 'notifications', notificationId);
    await deleteDoc(notificationRef);
  } catch (error) {
    console.error('Error deleting notification:', error);
    throw error;
  }
}

/**
 * Delete all notifications for a user
 */
export async function deleteAllNotifications(
  teamId: string,
  userEmail: string
): Promise<void> {
  try {
    const notificationsRef = collection(db, 'teams', teamId, 'notifications');
    const q = query(notificationsRef, where('recipientEmail', '==', userEmail));

    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(docSnap =>
      deleteDoc(doc(db, 'teams', teamId, 'notifications', docSnap.id))
    );

    await Promise.all(deletePromises);
    console.log('Deleted all notifications for:', userEmail);
  } catch (error) {
    console.error('Error deleting all notifications:', error);
    throw error;
  }
}

// ============================================================================
// CALL SYSTEM MESSAGES
// ============================================================================

/**
 * Send a call system message (when call starts)
 * Returns the message ID so it can be updated when call ends
 */
export async function sendCallSystemMessage(
  teamId: string,
  channelId: string,
  callData: CallMessageData,
  senderPhotoURL?: string
): Promise<string> {
  try {
    // Content is used for lastMessagePreview - no emoji since Lucide icons are shown in UI
    const content = `${callData.initiatorName} started a ${callData.callType === 'video' ? 'video' : 'voice'} call`;

    const messageData: Omit<ChatMessageFirestore, 'id'> = {
      channelId,
      senderId: callData.initiatorEmail,
      senderName: callData.initiatorName,
      senderEmail: callData.initiatorEmail,
      content,
      createdAt: Timestamp.now(),
      edited: false,
      deleted: false,
      type: 'call',
      callData,
      ...(senderPhotoURL && { senderPhotoURL }),
    };

    // Skip message creation for meeting channels (they're virtual, no chat)
    if (channelId.startsWith('meeting_')) {
      console.log('Skipping call system message for meeting channel:', channelId);
      return ''; // Return empty - no message ID for meetings
    }

    const messagesRef = collection(
      db,
      'teams',
      teamId,
      'messages',
      channelId,
      'items'
    );
    const messageRef = await addDoc(messagesRef, messageData);

    // Update channel's last message info (only for real channels, not meeting channels)
    const channelRef = doc(db, 'teams', teamId, 'channels', channelId);
    await updateDoc(channelRef, {
      lastMessageAt: Timestamp.now(),
      lastMessagePreview: content,
      updatedAt: Timestamp.now(),
    });

    console.log('Sent call system message:', messageRef.id);
    return messageRef.id;
  } catch (error) {
    console.error('Error sending call system message:', error);
    throw error;
  }
}

/**
 * Update call system message when call ends (add duration)
 */
export async function updateCallSystemMessage(
  teamId: string,
  channelId: string,
  messageId: string,
  duration: number,
  status: 'ended' | 'missed' | 'declined'
): Promise<void> {
  // Skip for meeting channels (they're virtual, no chat messages)
  if (channelId.startsWith('meeting_') || !messageId) {
    console.log('Skipping call system message update for meeting channel:', channelId);
    return;
  }

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
      console.error('Call message not found:', messageId);
      return;
    }

    const data = messageSnap.data() as ChatMessageFirestore;
    if (!data.callData) {
      console.error('Message is not a call message:', messageId);
      return;
    }

    const callData = data.callData;
    const durationFormatted = formatDuration(duration);

    // Content for lastMessagePreview - no emoji since Lucide icons shown in UI
    const callType = callData.callType === 'video' ? 'video' : 'voice';
    let content: string;
    if (status === 'missed') {
      content = `Missed ${callType} call from ${callData.initiatorName}`;
    } else if (status === 'declined') {
      content = `${callType.charAt(0).toUpperCase() + callType.slice(1)} call declined`;
    } else {
      content = `${callData.initiatorName} started a ${callType} call that lasted ${durationFormatted}`;
    }

    await updateDoc(messageRef, {
      content,
      updatedAt: Timestamp.now(),
      'callData.status': status,
      'callData.duration': duration,
    });

    // Update channel preview
    const channelRef = doc(db, 'teams', teamId, 'channels', channelId);
    await updateDoc(channelRef, {
      lastMessagePreview: content,
      updatedAt: Timestamp.now(),
    });

    console.log('Updated call system message:', messageId, 'status:', status);
  } catch (error) {
    console.error('Error updating call system message:', error);
    throw error;
  }
}

/**
 * Send missed call message (when call times out or is declined by everyone)
 */
export async function sendMissedCallMessage(
  teamId: string,
  channelId: string,
  callData: CallMessageData,
  senderPhotoURL?: string
): Promise<string> {
  try {
    // Content for lastMessagePreview - no emoji since Lucide icons shown in UI
    const callType = callData.callType === 'video' ? 'video' : 'voice';
    const content = `Missed ${callType} call from ${callData.initiatorName}`;

    const missedCallData: CallMessageData = {
      ...callData,
      status: 'missed',
    };

    const messageData: Omit<ChatMessageFirestore, 'id'> = {
      channelId,
      senderId: callData.initiatorEmail,
      senderName: callData.initiatorName,
      senderEmail: callData.initiatorEmail,
      content,
      createdAt: Timestamp.now(),
      edited: false,
      deleted: false,
      type: 'call',
      callData: missedCallData,
      ...(senderPhotoURL && { senderPhotoURL }),
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
      lastMessagePreview: content,
      updatedAt: Timestamp.now(),
    });

    console.log('Sent missed call message:', messageRef.id);
    return messageRef.id;
  } catch (error) {
    console.error('Error sending missed call message:', error);
    throw error;
  }
}

/**
 * Format duration for display (mm:ss format)
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) {
    return `${secs}s`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
