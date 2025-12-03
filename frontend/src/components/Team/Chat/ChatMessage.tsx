/**
 * ChatMessage - Individual message component
 * Displays message content, sender info, timestamp, and actions
 */

import { useState } from 'react';
import { ChatMessage as ChatMessageType } from '../../../services/teamChatTypes';
import { formatMessageTime } from '../../../services/teamChatTypes';
import { Pencil, Trash2, Smile } from 'lucide-react';
import './ChatMessage.css';

interface ChatMessageProps {
  message: ChatMessageType;
  isOwnMessage: boolean;
  onEdit: (messageId: string, content: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onAddReaction: (messageId: string, emoji: string) => Promise<void>;
}

export default function ChatMessage({
  message,
  isOwnMessage,
  onEdit,
  onDelete,
  onAddReaction,
}: ChatMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showActions, setShowActions] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSaveEdit = async () => {
    if (!editContent.trim() || editContent === message.content) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    try {
      await onEdit(message.id, editContent);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to edit message:', error);
      alert('Failed to edit message');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this message?')) return;

    try {
      await onDelete(message.id);
    } catch (error) {
      console.error('Failed to delete message:', error);
      alert('Failed to delete message');
    }
  };

  const handleReaction = async (emoji: string) => {
    try {
      await onAddReaction(message.id, emoji);
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  };

  if (message.deleted) {
    return (
      <div className="chat-message deleted">
        <div className="message-content">
          <span className="deleted-text">
            <Trash2 size={14} /> Message deleted
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`chat-message ${isOwnMessage ? 'own-message' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      <div className="message-avatar">
        {message.senderName.substring(0, 2).toUpperCase()}
      </div>

      {/* Message content */}
      <div className="message-body">
        {/* Header: sender name + timestamp */}
        <div className="message-header">
          <span className="message-sender">{message.senderName}</span>
          <span className="message-time">{formatMessageTime(message.createdAt)}</span>
          {message.edited && <span className="message-edited">(edited)</span>}
        </div>

        {/* Content */}
        {isEditing ? (
          <div className="message-edit-form">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSaveEdit();
                } else if (e.key === 'Escape') {
                  setIsEditing(false);
                  setEditContent(message.content);
                }
              }}
              autoFocus
              disabled={saving}
              className="edit-textarea"
            />
            <div className="edit-actions">
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(message.content);
                }}
                className="btn-cancel"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="btn-save"
                disabled={saving || !editContent.trim()}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
            <div className="edit-hint">
              Press Enter to save • Esc to cancel
            </div>
          </div>
        ) : (
          <div className="message-content">
            {renderContent(message.content)}
          </div>
        )}

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="message-reactions">
            {message.reactions.map((reaction, idx) => (
              <button
                key={idx}
                className="reaction-bubble"
                onClick={() => handleReaction(reaction.emoji)}
                title={`${reaction.count} reaction${reaction.count > 1 ? 's' : ''}`}
              >
                <span>{reaction.emoji}</span>
                <span className="reaction-count">{reaction.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons (shown on hover) */}
      {showActions && !isEditing && isOwnMessage && (
        <div className="message-actions">
          <button
            className="action-btn"
            onClick={() => setIsEditing(true)}
            title="Edit message"
          >
            <Pencil size={16} />
          </button>
          <button
            className="action-btn"
            onClick={handleDelete}
            title="Delete message"
          >
            <Trash2 size={16} />
          </button>
          <button
            className="action-btn"
            onClick={() => handleReaction('👍')}
            title="Add reaction"
          >
            <Smile size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// Helper: Render message content with basic formatting
function renderContent(content: string): JSX.Element {
  // Split by newlines and render
  const lines = content.split('\n');

  return (
    <>
      {lines.map((line, idx) => (
        <span key={idx}>
          {renderLine(line)}
          {idx < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

// Helper: Render a single line with @mentions highlighted
function renderLine(line: string): JSX.Element {
  // Highlight @mentions
  const mentionRegex = /@(\w+)/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(line)) !== null) {
    // Add text before mention
    if (match.index > lastIndex) {
      parts.push(line.substring(lastIndex, match.index));
    }

    // Add mention
    parts.push(
      <span key={match.index} className="mention">
        {match[0]}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < line.length) {
    parts.push(line.substring(lastIndex));
  }

  return <>{parts}</>;
}
