/**
 * PinnedMessagesModal - Shows all pinned messages for a conversation
 */

import { X, Pin, Trash2 } from 'lucide-react';
import { ChatMessage } from '../../../services/teamChatTypes';
import { formatMessageTime } from '../../../services/teamChatTypes';
import './PinnedMessagesModal.css';

interface PinnedMessagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  pinnedMessages: ChatMessage[];
  onUnpin: (messageId: string) => void;
}

export default function PinnedMessagesModal({
  isOpen,
  onClose,
  pinnedMessages,
  onUnpin,
}: PinnedMessagesModalProps) {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="pinned-modal-backdrop" onClick={handleBackdropClick}>
      <div className="pinned-modal">
        <div className="pinned-modal-header">
          <div className="pinned-header-title">
            <Pin size={18} />
            <h3>Pinned Messages</h3>
          </div>
          <button className="pinned-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="pinned-modal-content">
          {pinnedMessages.length === 0 ? (
            <div className="no-pinned-messages">
              <Pin size={32} />
              <p>No pinned messages yet</p>
              <span>Pin important messages to find them easily later</span>
            </div>
          ) : (
            <div className="pinned-messages-list">
              {pinnedMessages.map((message) => (
                <div key={message.id} className="pinned-message-item">
                  <div className="pinned-message-avatar">
                    {message.senderName.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="pinned-message-content">
                    <div className="pinned-message-header">
                      <span className="pinned-sender">{message.senderName}</span>
                      <span className="pinned-time">{formatMessageTime(message.createdAt)}</span>
                    </div>
                    <div className="pinned-message-text">{message.content}</div>
                  </div>
                  <button
                    className="unpin-btn"
                    onClick={() => onUnpin(message.id)}
                    title="Unpin message"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
