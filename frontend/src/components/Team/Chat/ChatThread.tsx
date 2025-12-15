/**
 * ChatThread - Message display area with real-time updates
 * Handles message rendering, scrolling, and pagination
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, MessagesSquare } from 'lucide-react';
import { ChatMessage as ChatMessageType, Channel, SharedFile, SharedRecording, SharedTodo, SharedWhiteboard } from '../../../services/teamChatTypes';
import { TeamMember } from '../../../services/teamService';
import { subscribeToMessages } from '../../../services/teamChatService';
import {
  notifyMention,
  notifyReply,
  messageContainsMention,
} from '../../../services/notificationService';
import ChatMessage from './ChatMessage';
import './ChatThread.css';

interface ChatThreadProps {
  teamId: string;
  channelId: string;
  channelName: string;
  currentUserEmail: string;
  currentUserDisplayName: string;
  pinnedMessageIds?: string[];
  searchQuery?: string;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onAddReaction: (messageId: string, emoji: string) => Promise<void>;
  onRemoveReaction: (messageId: string, emoji: string) => Promise<void>;
  onPinMessage?: (message: ChatMessageType) => void;
  onForwardMessage?: (message: ChatMessageType) => void;
  onReply?: (message: ChatMessageType) => void;
  // Valid mention names (displayNames or email prefixes of team members)
  validMentions?: string[];
  // Share to chat functionality
  channels?: Channel[];
  onShareToChat?: (imageUrl: string, imageName: string, targetChannelId: string, message?: string) => Promise<void>;
  // Poll voting
  onVotePoll?: (messageId: string, optionId: string) => Promise<void>;
  // Open shared file
  onOpenSharedFile?: (sharedFile: SharedFile) => void;
  // Open shared recording
  onOpenSharedRecording?: (sharedRecording: SharedRecording) => void;
  // Shared todo handlers
  onOpenSharedTodo?: (sharedTodo: SharedTodo) => void;
  onToggleSharedTodo?: (sharedTodo: SharedTodo) => void;
  onJoinMeeting?: (sharedTodo: SharedTodo) => void;
  // Shared whiteboard handler
  onOpenSharedWhiteboard?: (sharedWhiteboard: SharedWhiteboard) => void;
  // Team members for assignee avatars
  teamMembers?: { [email: string]: TeamMember };
  // Callback to pass messages to parent (for search)
  onMessagesChange?: (messages: ChatMessageType[]) => void;
  // Scroll to a specific message
  scrollToMessageId?: string | null;
  // Clear scroll request after scrolling
  onScrollComplete?: () => void;
}

export default function ChatThread({
  teamId,
  channelId,
  channelName,
  currentUserEmail,
  currentUserDisplayName,
  pinnedMessageIds = [],
  searchQuery = '',
  onEditMessage,
  onDeleteMessage,
  onAddReaction,
  onRemoveReaction,
  onPinMessage,
  onForwardMessage,
  onReply,
  validMentions,
  channels,
  onShareToChat,
  onVotePoll,
  onOpenSharedFile,
  onOpenSharedRecording,
  onOpenSharedTodo,
  onToggleSharedTodo,
  onJoinMeeting,
  onOpenSharedWhiteboard,
  teamMembers,
  onMessagesChange,
  scrollToMessageId,
  onScrollComplete,
}: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef<number>(0);
  const processedMessageIdsRef = useRef<Set<string>>(new Set());

  // Filter messages based on search query
  const filteredMessages = searchQuery.trim()
    ? messages.filter(msg =>
        msg.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.senderName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  // Subscribe to messages for this channel
  useEffect(() => {
    if (!teamId || !channelId) return;

    setLoading(true);
    setError(null);
    prevMessageCountRef.current = 0; // Reset when channel changes

    const unsubscribe = subscribeToMessages(
      teamId,
      channelId,
      (updatedMessages) => {
        // Only auto-scroll if a NEW message was added (not for edits/reactions)
        const isNewMessage = updatedMessages.length > prevMessageCountRef.current;
        prevMessageCountRef.current = updatedMessages.length;

        // Check for mentions/replies in new messages (only process each message once)
        if (isNewMessage && updatedMessages.length > 0) {
          const newMessages = updatedMessages.filter(
            msg => !processedMessageIdsRef.current.has(msg.id)
          );

          for (const msg of newMessages) {
            processedMessageIdsRef.current.add(msg.id);

            // Skip own messages
            if (msg.senderEmail === currentUserEmail) continue;

            // Check if this message is a reply to one of our messages
            if (msg.replyTo) {
              const originalMessage = updatedMessages.find(m => m.id === msg.replyTo);
              if (originalMessage?.senderEmail === currentUserEmail) {
                notifyReply(msg.senderName, msg.content, channelName);
                continue; // Don't double-notify for reply + mention
              }
            }

            // Check if this message mentions us
            if (messageContainsMention(msg.content, currentUserDisplayName, currentUserEmail)) {
              notifyMention(msg.senderName, msg.content, channelName);
            }
          }
        }

        setMessages(updatedMessages);
        setLoading(false);

        // Auto-scroll to bottom only when new messages arrive
        if (isNewMessage) {
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
      },
      (err) => {
        console.error('Message subscription error:', err);
        setError('Failed to load messages');
        setLoading(false);
      },
      50 // Load last 50 messages
    );

    return () => unsubscribe();
  }, [teamId, channelId]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!loading && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [loading]);

  // Notify parent when messages change (for search)
  useEffect(() => {
    if (onMessagesChange) {
      onMessagesChange(messages);
    }
  }, [messages, onMessagesChange]);

  // Handle scroll to message request from parent (for search results)
  useEffect(() => {
    if (scrollToMessageId) {
      const messageElement = threadRef.current?.querySelector(`[data-message-id="${scrollToMessageId}"]`);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageElement.classList.add('message-highlight');
        setTimeout(() => {
          messageElement.classList.remove('message-highlight');
        }, 2000);
      }
      // Clear the scroll request
      if (onScrollComplete) {
        onScrollComplete();
      }
    }
  }, [scrollToMessageId, onScrollComplete]);

  // Scroll to a specific message (for clicking on reply context)
  const scrollToMessage = useCallback((messageId: string) => {
    const messageElement = threadRef.current?.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      // Scroll the message into view
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Add highlight effect
      messageElement.classList.add('message-highlight');
      setTimeout(() => {
        messageElement.classList.remove('message-highlight');
      }, 2000);
    }
  }, []);

  if (loading) {
    return (
      <div className="chat-thread">
        <div className="thread-loading">
          <div className="loading-spinner" />
          <span>Loading messages...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="chat-thread">
        <div className="thread-error">
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="chat-thread">
        <div className="thread-empty">
          <MessagesSquare size={64} strokeWidth={1.5} className="empty-icon" />
          <h3>No messages yet</h3>
          <p>Start the conversation!</p>
        </div>
      </div>
    );
  }

  // Show "no results" when search has no matches
  if (searchQuery.trim() && filteredMessages.length === 0) {
    return (
      <div className="chat-thread">
        <div className="thread-empty">
          <Search size={64} strokeWidth={1.5} className="empty-icon" />
          <h3>No results found</h3>
          <p>No messages match "{searchQuery}"</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-thread" ref={threadRef}>
      <div className="messages-container">
        {filteredMessages.map((message, index) => {
          // Check if we should show date separator
          const prevMessage = index > 0 ? filteredMessages[index - 1] : null;
          const showDateSeparator =
            !prevMessage ||
            new Date(message.createdAt).toDateString() !==
              new Date(prevMessage.createdAt).toDateString();

          return (
            <div key={message.id} data-message-id={message.id}>
              {showDateSeparator && (
                <div className="date-separator">
                  <span>{formatDate(message.createdAt)}</span>
                </div>
              )}
              <ChatMessage
                message={message}
                isOwnMessage={message.senderEmail === currentUserEmail}
                currentUserEmail={currentUserEmail}
                isPinned={pinnedMessageIds.includes(message.id)}
                onEdit={onEditMessage}
                onDelete={onDeleteMessage}
                onAddReaction={onAddReaction}
                onRemoveReaction={onRemoveReaction}
                onPinMessage={onPinMessage ? () => onPinMessage(message) : undefined}
                onForwardMessage={onForwardMessage ? () => onForwardMessage(message) : undefined}
                onReply={onReply ? () => onReply(message) : undefined}
                replyToMessage={message.replyTo ? messages.find(m => m.id === message.replyTo) : undefined}
                onScrollToMessage={scrollToMessage}
                validMentions={validMentions}
                channels={channels}
                currentChannelId={channelId}
                onShareToChat={onShareToChat}
                onVotePoll={onVotePoll}
                onOpenSharedFile={onOpenSharedFile}
                onOpenSharedRecording={onOpenSharedRecording}
                onOpenSharedTodo={onOpenSharedTodo}
                onToggleSharedTodo={onToggleSharedTodo}
                onJoinMeeting={onJoinMeeting}
                onOpenSharedWhiteboard={onOpenSharedWhiteboard}
                teamMembers={teamMembers}
              />
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

// Helper: Format date for separator
function formatDate(date: Date): string {
  const today = new Date();
  const messageDate = new Date(date);

  if (messageDate.toDateString() === today.toDateString()) {
    return 'Today';
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (messageDate.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return messageDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
