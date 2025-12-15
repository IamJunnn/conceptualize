/**
 * ShareToChatModal - Discord-style forward modal
 * Allows forwarding images or files to channels or DMs with search and multiple selection
 */

import { useState, useMemo } from 'react';
import { X, Search, Send, Image as ImageIcon, Users, FileText, Folder, Video, Mic, PenTool } from 'lucide-react';
import { Channel, SharedFile, SharedRecording, SharedWhiteboard } from '../../../services/teamChatTypes';
import { formatRecordingDuration } from '../../../services/recordingTypes';
import './ShareToChatModal.css';

// Share mode: image, file/folder, recording, or whiteboard
type ShareMode = 'image' | 'file' | 'recording' | 'whiteboard';

// Team member info for showing all members
interface TeamMemberInfo {
  email: string;
  displayName?: string;
  photoURL?: string;
  customAvatar?: string;
}

interface ShareToChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  // For image sharing
  imageUrl?: string;
  imageName?: string;
  // For file/folder sharing
  sharedFile?: SharedFile;
  // For recording sharing
  sharedRecording?: SharedRecording;
  // For whiteboard sharing
  sharedWhiteboard?: SharedWhiteboard;
  // Common props
  channels: Channel[];
  currentChannelId?: string;
  currentUserEmail: string;
  // Optional: team members to show individual DM options
  teamMembers?: TeamMemberInfo[];
  onShare: (targetChannelId: string, message?: string, sharedFile?: SharedFile, sharedRecording?: SharedRecording, sharedWhiteboard?: SharedWhiteboard) => Promise<void>;
  // Optional: callback to create/get DM channel for a team member
  onGetOrCreateDM?: (memberEmail: string) => Promise<string>;
}

export default function ShareToChatModal({
  isOpen,
  onClose,
  imageUrl,
  imageName,
  sharedFile,
  sharedRecording,
  sharedWhiteboard,
  channels,
  currentChannelId,
  currentUserEmail,
  teamMembers,
  onShare,
  onGetOrCreateDM,
}: ShareToChatModalProps) {
  // Determine share mode
  const shareMode: ShareMode = sharedWhiteboard ? 'whiteboard' : sharedRecording ? 'recording' : sharedFile ? 'file' : 'image';
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set());
  const [selectedMemberEmails, setSelectedMemberEmails] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sharing, setSharing] = useState(false);

  // Filter out current channel (if provided) and apply search
  const filteredChannels = useMemo(() => {
    return channels
      .filter(ch => !currentChannelId || ch.id !== currentChannelId)
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
        // Sort order: DMs (individual members) first, then groups, then text channels
        const typeOrder = { dm: 0, group: 1, text: 2 };
        const aOrder = typeOrder[a.type] ?? 2;
        const bOrder = typeOrder[b.type] ?? 2;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      });
  }, [channels, currentChannelId, searchQuery, currentUserEmail]);

  // Get emails that already have DM channels
  const existingDMEmails = useMemo(() => {
    const emails = new Set<string>();
    channels.forEach(ch => {
      if (ch.type === 'dm' && ch.participants) {
        ch.participants.forEach(p => {
          if (p.toLowerCase() !== currentUserEmail.toLowerCase()) {
            emails.add(p.toLowerCase());
          }
        });
      }
    });
    return emails;
  }, [channels, currentUserEmail]);

  // Filter team members (exclude self and those who already have DM channels)
  const filteredMembers = useMemo(() => {
    if (!teamMembers) return [];
    return teamMembers
      .filter(m => m.email.toLowerCase() !== currentUserEmail.toLowerCase())
      .filter(m => !existingDMEmails.has(m.email.toLowerCase()))
      .filter(m => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        const name = (m.displayName || m.email.split('@')[0]).toLowerCase();
        return name.includes(query) || m.email.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        const nameA = a.displayName || a.email.split('@')[0];
        const nameB = b.displayName || b.email.split('@')[0];
        return nameA.localeCompare(nameB);
      });
  }, [teamMembers, currentUserEmail, existingDMEmails, searchQuery]);

  // Get display info for a channel
  const getChannelInfo = (channel: Channel) => {
    if (channel.type === 'dm') {
      const otherUserEmail = channel.participants?.find(p => p.toLowerCase() !== currentUserEmail.toLowerCase());
      // Look up member data for avatar and display name
      const memberData = teamMembers?.find(m => m.email.toLowerCase() === otherUserEmail?.toLowerCase());
      const displayName = memberData?.displayName || channel.name || (otherUserEmail ? otherUserEmail.split('@')[0] : 'Unknown');
      const avatarUrl = memberData?.customAvatar || memberData?.photoURL;
      return {
        name: displayName,
        subtitle: otherUserEmail || '',
        isGroup: false,
        avatarUrl,
      };
    }
    // Group or text channel - show group icon
    const participantCount = channel.participants?.length || 0;
    const subtitle = channel.type === 'group' && participantCount > 0
      ? `${participantCount} members`
      : channel.description || '';
    return {
      name: channel.name,
      subtitle,
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

  // Toggle member selection
  const toggleMember = (email: string) => {
    setSelectedMemberEmails(prev => {
      const next = new Set(prev);
      if (next.has(email)) {
        next.delete(email);
      } else {
        next.add(email);
      }
      return next;
    });
  };

  // Handle share to all selected channels and members
  const handleShare = async () => {
    if (selectedChannelIds.size === 0 && selectedMemberEmails.size === 0) return;

    setSharing(true);
    try {
      // Share to all selected channels
      for (const channelId of selectedChannelIds) {
        await onShare(channelId, message.trim() || undefined, sharedFile, sharedRecording, sharedWhiteboard);
      }

      // Share to selected members (create DM channels if needed)
      if (onGetOrCreateDM) {
        for (const email of selectedMemberEmails) {
          const channelId = await onGetOrCreateDM(email);
          await onShare(channelId, message.trim() || undefined, sharedFile, sharedRecording, sharedWhiteboard);
        }
      }

      // Reset and close
      onClose();
      setSelectedChannelIds(new Set());
      setSelectedMemberEmails(new Set());
      setMessage('');
      setSearchQuery('');
    } catch (error) {
      console.error('Share failed:', error);
      const errorMsg = shareMode === 'whiteboard' ? 'Failed to share whiteboard' :
                       shareMode === 'recording' ? 'Failed to share recording' :
                       shareMode === 'file' ? 'Failed to share file' : 'Failed to share image';
      alert(errorMsg);
    } finally {
      setSharing(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="forward-modal-overlay" onClick={handleBackdropClick}>
      <div className="forward-modal">
        {/* Header */}
        <div className="forward-modal-header">
          <div className="forward-header-text">
            <h3>Forward To</h3>
            <p>Select where you want to share this message.</p>
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

        {/* Members and Channels list */}
        <div className="forward-list">
          {filteredMembers.length === 0 && filteredChannels.length === 0 ? (
            <div className="forward-empty">
              {searchQuery ? 'No results found' : 'No channels or team members available'}
            </div>
          ) : (
            <>
              {/* Team members first (those without existing DM) */}
              {filteredMembers.map(member => {
                const displayName = member.displayName || member.email.split('@')[0];
                const isSelected = selectedMemberEmails.has(member.email);
                const avatarUrl = member.customAvatar || member.photoURL;

                return (
                  <div
                    key={`member-${member.email}`}
                    className={`forward-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleMember(member.email)}
                  >
                    {/* Avatar */}
                    <div className="forward-avatar">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={displayName} className="forward-avatar-image" />
                      ) : (
                        <span>{getInitials(displayName)}</span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="forward-info">
                      <span className="forward-name">{displayName}</span>
                      <span className="forward-subtitle">{member.email}</span>
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
              })}

              {/* Existing channels (DMs, groups, text) */}
              {filteredChannels.map(channel => {
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
              })}
            </>
          )}
        </div>

        {/* Footer with preview and send */}
        <div className="forward-footer">
          {/* Preview - different for image, file, or recording */}
          <div className="forward-preview">
            {shareMode === 'image' ? (
              <>
                <div className="forward-preview-image">
                  <ImageIcon size={16} />
                  <span>1 image</span>
                </div>
                <img src={imageUrl} alt={imageName} className="forward-preview-thumb" />
              </>
            ) : shareMode === 'recording' ? (
              <div className="forward-preview-recording">
                {sharedRecording?.type === 'video' ? (
                  <Video size={20} className="forward-preview-recording-icon video" />
                ) : (
                  <Mic size={20} className="forward-preview-recording-icon audio" />
                )}
                <div className="forward-preview-recording-info">
                  <span className="forward-preview-recording-name">
                    {sharedRecording?.title}
                  </span>
                  <span className="forward-preview-recording-meta">
                    {sharedRecording?.type === 'video' ? 'Video' : 'Voice'} Call
                    {sharedRecording?.duration !== undefined && ` • ${formatRecordingDuration(sharedRecording.duration)}`}
                  </span>
                </div>
              </div>
            ) : shareMode === 'whiteboard' ? (
              <div className="forward-preview-whiteboard">
                <PenTool size={20} className="forward-preview-whiteboard-icon" />
                <div className="forward-preview-whiteboard-info">
                  <span className="forward-preview-whiteboard-name">
                    {sharedWhiteboard?.name}
                  </span>
                  <span className="forward-preview-whiteboard-meta">
                    Whiteboard · Created by {sharedWhiteboard?.createdByName}
                  </span>
                </div>
              </div>
            ) : (
              <div className="forward-preview-file">
                {sharedFile?.type === 'folder' ? (
                  <Folder size={20} className="forward-preview-file-icon folder" />
                ) : (
                  <FileText size={20} className="forward-preview-file-icon" />
                )}
                <div className="forward-preview-file-info">
                  <span className="forward-preview-file-name">
                    {sharedFile?.name.replace(/\.md$/, '')}
                  </span>
                  <span className="forward-preview-file-type">
                    {sharedFile?.type === 'folder' ? 'Folder' : 'Note'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Message input and send */}
          <div className="forward-input-row">
            <input
              type="text"
              placeholder="Add an optional message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="forward-message-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && (selectedChannelIds.size > 0 || selectedMemberEmails.size > 0)) {
                  e.preventDefault();
                  handleShare();
                }
              }}
            />
            <button
              className="forward-send-btn"
              onClick={handleShare}
              disabled={(selectedChannelIds.size === 0 && selectedMemberEmails.size === 0) || sharing}
            >
              {sharing ? '...' : 'Send'}
              {!sharing && <Send size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
