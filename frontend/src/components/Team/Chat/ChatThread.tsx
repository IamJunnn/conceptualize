/**
 * ChatThread - Message display area with real-time updates
 * Handles message rendering, scrolling, and pagination
 */

import { useEffect, useRef, useState } from 'react';
import { ChatMessage as ChatMessageType } from '../../../services/teamChatTypes';
import { subscribeToMessages } from '../../../services/teamChatService';
import ChatMessage from './ChatMessage';
import './ChatThread.css';

interface ChatThreadProps {
  teamId: string;
  channelId: string;
  currentUserEmail: string;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onAddReaction: (messageId: string, emoji: string) => Promise<void>;
}

export default function ChatThread({
  teamId,
  channelId,
  currentUserEmail,
  onEditMessage,
  onDeleteMessage,
  onAddReaction,
}: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // Subscribe to messages for this channel
  useEffect(() => {
    if (!teamId || !channelId) return;

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToMessages(
      teamId,
      channelId,
      (updatedMessages) => {
        setMessages(updatedMessages);
        setLoading(false);

        // Auto-scroll to bottom when new messages arrive
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
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
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="empty-icon"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <h3>No messages yet</h3>
          <p>Start the conversation!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-thread" ref={threadRef}>
      <div className="messages-container">
        {messages.map((message, index) => {
          // Check if we should show date separator
          const prevMessage = index > 0 ? messages[index - 1] : null;
          const showDateSeparator =
            !prevMessage ||
            new Date(message.createdAt).toDateString() !==
              new Date(prevMessage.createdAt).toDateString();

          return (
            <div key={message.id}>
              {showDateSeparator && (
                <div className="date-separator">
                  <span>{formatDate(message.createdAt)}</span>
                </div>
              )}
              <ChatMessage
                message={message}
                isOwnMessage={message.senderEmail === currentUserEmail}
                onEdit={onEditMessage}
                onDelete={onDeleteMessage}
                onAddReaction={onAddReaction}
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
