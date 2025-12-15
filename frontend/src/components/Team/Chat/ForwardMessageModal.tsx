/**
 * ForwardMessageModal - Forward a message to other channels or DMs
 * Similar to ShareToChatModal but for text messages
 */

import { useState, useMemo } from 'react';
import { X, Search, Send, MessageSquare, Users } from 'lucide-react';
import { Channel, ChatMessage } from '../../../services/teamChatTypes';
import { TeamMember } from '../../../services/teamService';
import './ShareToChatModal.css'; // Reuse same styling
import './ForwardMessageModal.css'; // Additional message-specific styles

interface ForwardMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: ChatMessage;
  channels: Channel[];
  currentChannelId: string;
  currentUserEmail: string;
  members?: { [email: string]: TeamMember }; // Add members for avatar lookup
  onForward: (targetChannelId: string, originalMessage: ChatMessage, additionalMessage?: string) => Promise<void>;
}

export default function ForwardMessageModal({
  isOpen,
  onClose,
  message,
  channels,
  currentChannelId,
  currentUserEmail,
  members,
  onForward,
}: ForwardMessageModalProps) {
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set());
  const [additionalMessage, setAdditionalMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [forwarding, setForwarding] = useState(false);

  // Filter out current channel and apply search
  const filteredChannels = useMemo(() => {
    return channels
      .filter(ch => ch.id !== currentChannelId)
      .filter(ch => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        const name = ch.name.toLowerCase();
        // For DMs, also check participants
        if (ch.type === 'dm' && ch.participants) {
          const otherUser = ch.participants.find(p => p !== currentUserEmail);
          if (otherUser && otherUser.toLowerCase().includes(query)) return true;
        }
        return name.includes(query);
      })
      .sort((a, b) => {
        // Groups first, then DMs
        if (a.type === 'text' && b.type !== 'text') return -1;
        if (a.type !== 'text' && b.type === 'text') return 1;
        return a.name.localeCompare(b.name);
      });
  }, [channels, currentChannelId, searchQuery, currentUserEmail]);

  // Get display info for a channel
  const getChannelInfo = (channel: Channel) => {
    if (channel.type === 'dm') {
      const otherUserEmail = channel.participants?.find(p => p.toLowerCase() !== currentUserEmail.toLowerCase());
      // Look up member data for avatar and display name
      const memberData = otherUserEmail ? (members?.[otherUserEmail] || members?.[otherUserEmail.toLowerCase()]) : undefined;
      const displayName = memberData?.displayName || channel.name || (otherUserEmail ? otherUserEmail.split('@')[0] : 'Unknown');
      const avatarUrl = memberData?.customAvatar || memberData?.photoURL;
      return {
        name: displayName,
        subtitle: otherUserEmail || '',
        isGroup: false,
        avatarUrl,
      };
    }
    // Group channel
    const participantCount = channel.participants?.length || 0;
    return {
      name: channel.name,
      subtitle: participantCount > 0 ? `${participantCount} members` : '',
      isGroup: true,
      avatarUrl: undefined,
    };
  };

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name.substring(0, 2).toUpperCase();
  };

  // Toggle channel selection
  const toggleChannel = (channelId: string) => {
    setSelectedChannelIds(prev => {
      const next = new Set(prev);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return next;
    });
  };

  // Handle forward to all selected channels
  const handleForward = async () => {
    if (selectedChannelIds.size === 0) return;

    setForwarding(true);
    try {
      // Forward to all selected channels
      for (const channelId of selectedChannelIds) {
        await onForward(channelId, message, additionalMessage.trim() || undefined);
      }
      // Reset and close
      onClose();
      setSelectedChannelIds(new Set());
      setAdditionalMessage('');
      setSearchQuery('');
    } catch (error) {
      console.error('Forward failed:', error);
      alert('Failed to forward message');
    } finally {
      setForwarding(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Truncate message for preview
  const truncateMessage = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  if (!isOpen) return null;

  return (
    <div className="forward-modal-overlay" onClick={handleBackdropClick}>
      <div className="forward-modal">
        {/* Header */}
        <div className="forward-modal-header">
          <div className="forward-header-text">
            <h3>Forward Message</h3>
            <p>Select where you want to forward this message.</p>
          </div>
          <button className="forward-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="forward-search">
          <Search size={16} className="forward-search-icon" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="forward-search-input"
          />
        </div>

        {/* Channel list */}
        <div className="forward-list">
          {filteredChannels.length === 0 ? (
            <div className="forward-empty">
              {searchQuery ? 'No results found' : 'No channels available'}
            </div>
          ) : (
            filteredChannels.map(channel => {
              const info = getChannelInfo(channel);
              const isSelected = selectedChannelIds.has(channel.id);

              return (
                <div
                  key={channel.id}
                  className={`forward-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleChannel(channel.id)}
                >
                  {/* Avatar */}
                  <div className={`forward-avatar ${info.isGroup ? 'group' : ''}`}>
                    {info.isGroup ? (
                      <Users size={18} />
                    ) : info.avatarUrl ? (
                      <img src={info.avatarUrl} alt={info.name} className="forward-avatar-image" />
                    ) : (
                      <span>{getInitials(info.name)}</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="forward-info">
                    <span className="forward-name">{info.name}</span>
                    {info.subtitle && (
                      <span className="forward-subtitle">{info.subtitle}</span>
                    )}
                  </div>

                  {/* Checkbox */}
                  <div className={`forward-checkbox ${isSelected ? 'checked' : ''}`}>
                    {isSelected && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with message preview and send */}
        <div className="forward-footer">
          {/* Message preview */}
          <div className="forward-preview">
            <div className="forward-preview-message">
              <MessageSquare size={16} />
              <span>Message from {message.senderName}</span>
            </div>
          </div>

          {/* Original message content preview */}
          <div className="forward-message-preview">
            <div className="forward-message-preview-content">
              {truncateMessage(message.content)}
            </div>
            {message.attachments && message.attachments.length > 0 && (
              <div className="forward-message-attachments-count">
                + {message.attachments.length} attachment{message.attachments.length > 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Additional message input and send */}
          <div className="forward-input-row">
            <input
              type="text"
              placeholder="Add an optional message..."
              value={additionalMessage}
              onChange={(e) => setAdditionalMessage(e.target.value)}
              className="forward-message-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && selectedChannelIds.size > 0) {
                  e.preventDefault();
                  handleForward();
                }
              }}
            />
            <button
              className="forward-send-btn"
              onClick={handleForward}
              disabled={selectedChannelIds.size === 0 || forwarding}
            >
              {forwarding ? '...' : 'Forward'}
              {!forwarding && <Send size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
