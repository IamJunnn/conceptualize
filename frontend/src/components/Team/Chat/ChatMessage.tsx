/**
 * ChatMessage - Individual message component
 * Displays message content, sender info, timestamp, actions, attachments, and link previews
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage as ChatMessageType, MessageAttachment, Channel, SharedFile, SharedRecording, SharedTodo, SharedWhiteboard } from '../../../services/teamChatTypes';
import { formatMessageTime, formatFileSize, isImageFile, isPDFFile } from '../../../services/teamChatTypes';
import { formatCallDuration } from '../../../services/callTypes';
import { formatRecordingDuration } from '../../../services/recordingTypes';
import { Pencil, Trash2, Pin, FileText, File as FileIcon, Download, ExternalLink, Check, Forward, Reply, Folder, Phone, Video, PhoneMissed, PhoneOff, Play, CornerUpRight, Calendar, CheckCircle, Circle, PenTool } from 'lucide-react';
import { TeamMember } from '../../../services/teamService';
import { writeFile } from '@tauri-apps/plugin-fs';
import { downloadDir } from '@tauri-apps/api/path';
import ConfirmModal from '../../UI/ConfirmModal';
import ImageLightbox from './ImageLightbox';
import PdfLightbox from './PdfLightbox';
import FileLightbox from './FileLightbox';
import PollDisplay from './PollDisplay';
import './ChatMessage.css';

// Quick reaction emojis
const QUICK_REACTIONS = ['👍', '✅', '❤️'];

interface ChatMessageProps {
  message: ChatMessageType;
  isOwnMessage: boolean;
  currentUserEmail: string;
  isPinned?: boolean;
  onEdit: (messageId: string, content: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onAddReaction: (messageId: string, emoji: string) => Promise<void>;
  onRemoveReaction: (messageId: string, emoji: string) => Promise<void>;
  onPinMessage?: () => void;
  onForwardMessage?: () => void;
  onReply?: () => void;
  // Reply context - the message being replied to
  replyToMessage?: ChatMessageType;
  // Scroll to a specific message (for clicking reply context)
  onScrollToMessage?: (messageId: string) => void;
  // Valid mention names (displayNames or email prefixes of team members)
  validMentions?: string[];
  // Share to chat functionality
  channels?: Channel[];
  currentChannelId?: string;
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
}

export default function ChatMessage({
  message,
  isOwnMessage,
  currentUserEmail,
  isPinned,
  onEdit,
  onDelete,
  onAddReaction,
  onRemoveReaction,
  onPinMessage,
  onForwardMessage,
  onReply,
  replyToMessage,
  onScrollToMessage,
  validMentions,
  channels,
  currentChannelId,
  onShareToChat,
  onVotePoll,
  onOpenSharedFile,
  onOpenSharedRecording,
  onOpenSharedTodo,
  onToggleSharedTodo,
  onJoinMeeting,
  onOpenSharedWhiteboard,
  teamMembers,
}: ChatMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showActions, setShowActions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea when editing starts or content changes
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, [isEditing, editContent]);

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

  const handleDeleteClick = () => {
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(message.id);
      setShowDeleteModal(false);
    } catch (error) {
      console.error('Failed to delete message:', error);
      alert('Failed to delete message');
    } finally {
      setDeleting(false);
    }
  };

  // Check if current user has reacted with a specific emoji
  const hasUserReacted = (emoji: string): boolean => {
    if (!message.reactions) return false;
    const reaction = message.reactions.find(r => r.emoji === emoji);
    return reaction ? reaction.userIds.includes(currentUserEmail) : false;
  };

  // Toggle reaction - add if not reacted, remove if already reacted
  const handleReactionToggle = async (emoji: string) => {
    try {
      if (hasUserReacted(emoji)) {
        await onRemoveReaction(message.id, emoji);
      } else {
        await onAddReaction(message.id, emoji);
      }
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
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

  // Call system message - special rendering
  if (message.type === 'call' && message.callData) {
    const { callData } = message;
    const isVideoCall = callData.callType === 'video';
    const CallIcon = callData.status === 'missed' ? PhoneMissed :
                     callData.status === 'declined' ? PhoneOff :
                     isVideoCall ? Video : Phone;

    // Get display name for call initiator from teamMembers
    const initiatorEmail = callData.initiatorEmail?.toLowerCase() || '';
    const initiatorMember = teamMembers?.[initiatorEmail];
    const initiatorDisplayName = initiatorMember?.displayName ||
      (callData.initiatorName?.includes('@')
        ? callData.initiatorName.split('@')[0].charAt(0).toUpperCase() + callData.initiatorName.split('@')[0].slice(1)
        : callData.initiatorName);

    // Build the call message text
    let callText = '';
    if (callData.status === 'started') {
      callText = `${initiatorDisplayName} started a ${isVideoCall ? 'video' : 'voice'} call`;
    } else if (callData.status === 'ended' && callData.duration !== undefined) {
      callText = `${initiatorDisplayName} started a ${isVideoCall ? 'video' : 'voice'} call that lasted ${formatCallDuration(callData.duration)}`;
    } else if (callData.status === 'missed') {
      callText = `Missed ${isVideoCall ? 'video' : 'voice'} call from ${initiatorDisplayName}`;
    } else if (callData.status === 'declined') {
      callText = `${isVideoCall ? 'Video' : 'Voice'} call from ${initiatorDisplayName} was declined`;
    }

    return (
      <div className={`chat-message call-message ${callData.status}`}>
        <div className="call-message-icon">
          <CallIcon size={20} />
        </div>
        <div className="call-message-content">
          <span className="call-message-text">{callText}</span>
          <span className="call-message-time">{formatMessageTime(message.createdAt)}</span>
        </div>
      </div>
    );
  }

  // Get live sender info from teamMembers (falls back to stored values)
  // Normalize email to lowercase for lookup since members object keys are lowercase
  const normalizedEmail = message.senderEmail.toLowerCase();
  const senderMember = teamMembers?.[normalizedEmail];
  // Fall back to stored senderName, but if it looks like an email, extract the username part
  const fallbackName = message.senderName.includes('@')
    ? message.senderName.split('@')[0].charAt(0).toUpperCase() + message.senderName.split('@')[0].slice(1)
    : message.senderName;
  const senderDisplayName = senderMember?.displayName || fallbackName;
  const senderPhotoURL = senderMember?.customAvatar || senderMember?.photoURL;
  const senderInitials = senderDisplayName.substring(0, 2).toUpperCase();

  return (
    <div
      className={`chat-message ${isOwnMessage ? 'own-message' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      <div className="message-avatar">
        {senderPhotoURL ? (
          <img
            src={senderPhotoURL}
            alt={senderDisplayName}
            className="avatar-image"
          />
        ) : (
          senderInitials
        )}
      </div>

      {/* Message content */}
      <div className="message-body">
        {/* Reply context - show original message being replied to */}
        {replyToMessage && (
          <div
            className="reply-context"
            onClick={() => onScrollToMessage?.(replyToMessage.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onScrollToMessage?.(replyToMessage.id);
              }
            }}
          >
            <Reply size={12} className="reply-context-icon" />
            <span className="reply-context-name">
              {teamMembers?.[replyToMessage.senderEmail.toLowerCase()]?.displayName ||
                (replyToMessage.senderName.includes('@')
                  ? replyToMessage.senderName.split('@')[0].charAt(0).toUpperCase() + replyToMessage.senderName.split('@')[0].slice(1)
                  : replyToMessage.senderName)}
            </span>
            <span className="reply-context-content">
              {replyToMessage.content.length > 60
                ? replyToMessage.content.substring(0, 60) + '...'
                : replyToMessage.content || (replyToMessage.poll ? `📊 ${replyToMessage.poll.question}` : '')}
            </span>
          </div>
        )}

        {/* Forwarded indicator */}
        {message.forwardedFrom && (
          <div className="forwarded-indicator">
            <CornerUpRight size={12} className="forwarded-icon" />
            <span>Forwarded from {message.forwardedFrom.originalSenderName}</span>
          </div>
        )}

        {/* Header: sender name + timestamp */}
        <div className="message-header">
          <span className="message-sender">{senderDisplayName}</span>
          <span className="message-time">{formatMessageTime(message.createdAt)}</span>
          {message.edited && <span className="message-edited">(edited)</span>}
          {isPinned && (
            <span className="message-pinned">
              <Pin size={10} />
              pinned
            </span>
          )}
        </div>

        {/* Content */}
        {isEditing ? (
          <div className="message-edit-form">
            <textarea
              ref={textareaRef}
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
          <>
            {/* Regular message content (hide if poll-only or sharedTodo message) */}
            {message.content && !message.poll && !message.sharedTodo && (
              <div className="message-content">
                {renderContent(message.content, currentUserEmail, validMentions)}
              </div>
            )}

            {/* Poll display */}
            {message.poll && onVotePoll && (
              <PollDisplay
                poll={message.poll}
                messageId={message.id}
                currentUserEmail={currentUserEmail}
                onVote={onVotePoll}
              />
            )}
          </>
        )}

        {/* Shared File */}
        {message.sharedFile && (
          <div
            className={`shared-file-card ${message.sharedFile.type === 'folder' ? 'folder' : ''} ${onOpenSharedFile ? 'clickable' : ''}`}
            onClick={() => onOpenSharedFile && message.sharedFile && onOpenSharedFile(message.sharedFile)}
            role={onOpenSharedFile ? 'button' : undefined}
            tabIndex={onOpenSharedFile ? 0 : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && onOpenSharedFile && message.sharedFile) {
                onOpenSharedFile(message.sharedFile);
              }
            }}
          >
            <div className="shared-file-icon">
              {message.sharedFile.type === 'folder' ? (
                <Folder size={24} />
              ) : (
                <FileText size={24} />
              )}
            </div>
            <div className="shared-file-info">
              <span className="shared-file-name">
                {message.sharedFile.name.replace(/\.md$/, '')}
              </span>
              <span className="shared-file-type">
                {message.sharedFile.type === 'folder' ? 'Folder' : 'Note'}
                {onOpenSharedFile && ' • Click to open'}
              </span>
            </div>
          </div>
        )}

        {/* Shared Recording */}
        {message.sharedRecording && (
          <div
            className={`shared-recording-card ${message.sharedRecording.type} ${onOpenSharedRecording ? 'clickable' : ''}`}
            onClick={() => onOpenSharedRecording && message.sharedRecording && onOpenSharedRecording(message.sharedRecording)}
            role={onOpenSharedRecording ? 'button' : undefined}
            tabIndex={onOpenSharedRecording ? 0 : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && onOpenSharedRecording && message.sharedRecording) {
                onOpenSharedRecording(message.sharedRecording);
              }
            }}
          >
            <div className="shared-recording-info">
              <span className="shared-recording-title">
                {message.sharedRecording.title}
              </span>
              <span className="shared-recording-meta">
                {message.sharedRecording.type === 'video' ? 'Video' : 'Voice'} Call
                {message.sharedRecording.duration !== undefined && ` • ${formatRecordingDuration(message.sharedRecording.duration)}`}
              </span>
            </div>
            <div className="shared-recording-play">
              <Play size={20} />
            </div>
          </div>
        )}

        {/* Shared Todo/Meeting Card */}
        {message.sharedTodo && (
          <div
            className={`shared-todo-card ${message.sharedTodo.type} ${message.sharedTodo.completed ? 'completed' : ''}`}
            onClick={() => onOpenSharedTodo && message.sharedTodo && onOpenSharedTodo(message.sharedTodo)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && onOpenSharedTodo && message.sharedTodo) {
                onOpenSharedTodo(message.sharedTodo);
              }
            }}
          >
            {/* Checkbox for tasks */}
            {message.sharedTodo.type === 'task' && onToggleSharedTodo && (
              <button
                className={`shared-todo-checkbox ${message.sharedTodo.completed ? 'checked' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (message.sharedTodo) onToggleSharedTodo(message.sharedTodo);
                }}
                title={message.sharedTodo.completed ? 'Mark incomplete' : 'Mark complete'}
              >
                {message.sharedTodo.completed ? (
                  <CheckCircle size={20} />
                ) : (
                  <Circle size={20} />
                )}
              </button>
            )}

            {/* Priority indicator for tasks */}
            {message.sharedTodo.type === 'task' && message.sharedTodo.priority && (
              <div
                className={`shared-todo-priority priority-${message.sharedTodo.priority}`}
                title={`Priority ${message.sharedTodo.priority}`}
              />
            )}

            {/* Meeting color indicator */}
            {message.sharedTodo.type === 'meeting' && (
              <div
                className="shared-todo-meeting-indicator"
                style={{ backgroundColor: message.sharedTodo.meetingDetails?.color || '#64c8ca' }}
              />
            )}

            {/* Content */}
            <div className="shared-todo-content">
              <div className="shared-todo-title">{message.sharedTodo.text}</div>
              <div className="shared-todo-meta">
                {/* Due date for tasks */}
                {message.sharedTodo.type === 'task' && message.sharedTodo.endDate && (
                  <span className="shared-todo-date">
                    <Calendar size={12} />
                    {new Date(message.sharedTodo.endDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                )}
                {/* Meeting time */}
                {message.sharedTodo.type === 'meeting' && message.sharedTodo.startDate && (
                  <span className="shared-todo-date">
                    <Calendar size={12} />
                    {new Date(message.sharedTodo.startDate).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric'
                    })}
                    {message.sharedTodo.meetingDetails?.startTime && message.sharedTodo.meetingDetails?.endTime && (
                      <> · {message.sharedTodo.meetingDetails.startTime} - {message.sharedTodo.meetingDetails.endTime}</>
                    )}
                  </span>
                )}
              </div>
              {/* Assignees */}
              {message.sharedTodo.assignees.length > 0 && (
                <div className="shared-todo-assignees">
                  {message.sharedTodo.assignees.slice(0, 3).map(email => {
                    const member = teamMembers?.[email];
                    const initials = member?.displayName
                      ? member.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                      : email.substring(0, 2).toUpperCase();
                    return (
                      <div key={email} className="shared-todo-assignee" title={member?.displayName || email}>
                        {(member?.customAvatar || member?.photoURL) ? (
                          <img src={member.customAvatar || member.photoURL} alt={initials} />
                        ) : (
                          initials
                        )}
                      </div>
                    );
                  })}
                  {message.sharedTodo.assignees.length > 3 && (
                    <span className="shared-todo-more">+{message.sharedTodo.assignees.length - 3}</span>
                  )}
                </div>
              )}
            </div>

            {/* Join button for meetings */}
            {message.sharedTodo.type === 'meeting' && message.sharedTodo.meetingDetails?.hasVideoRoom !== false && onJoinMeeting && (
              <button
                className="shared-todo-join-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (message.sharedTodo) onJoinMeeting(message.sharedTodo);
                }}
              >
                <Video size={16} />
                Join
              </button>
            )}
          </div>
        )}

        {/* Shared Whiteboard Card */}
        {message.sharedWhiteboard && (
          <div
            className={`shared-whiteboard-card ${onOpenSharedWhiteboard ? 'clickable' : ''}`}
            onClick={() => onOpenSharedWhiteboard && message.sharedWhiteboard && onOpenSharedWhiteboard(message.sharedWhiteboard)}
            role={onOpenSharedWhiteboard ? 'button' : undefined}
            tabIndex={onOpenSharedWhiteboard ? 0 : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && onOpenSharedWhiteboard && message.sharedWhiteboard) {
                onOpenSharedWhiteboard(message.sharedWhiteboard);
              }
            }}
          >
            <div className="shared-whiteboard-icon">
              <PenTool size={20} />
            </div>
            <div className="shared-whiteboard-content">
              <div className="shared-whiteboard-title">{message.sharedWhiteboard.name}</div>
              <div className="shared-whiteboard-meta">
                Whiteboard · Created by {message.sharedWhiteboard.createdByName}
              </div>
            </div>
          </div>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="message-attachments">
            {message.attachments.map((attachment, idx) => (
              <AttachmentItem
                key={idx}
                attachment={attachment}
                channels={channels}
                currentChannelId={currentChannelId}
                currentUserEmail={currentUserEmail}
                teamMembers={teamMembers}
                onShareToChat={onShareToChat}
              />
            ))}
          </div>
        )}

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="message-reactions">
            {message.reactions.map((reaction, idx) => (
              <button
                key={idx}
                className={`reaction-bubble ${hasUserReacted(reaction.emoji) ? 'active' : ''}`}
                onClick={() => handleReactionToggle(reaction.emoji)}
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
      {showActions && !isEditing && (
        <div className="message-actions">
          {/* Quick emoji reactions */}
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              className={`action-btn action-btn-emoji ${hasUserReacted(emoji) ? 'active' : ''}`}
              onClick={() => handleReactionToggle(emoji)}
              title={hasUserReacted(emoji) ? `Remove ${emoji}` : `React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}

          {/* Divider */}
          <div className="action-divider" />

          {/* Edit button */}
          {isOwnMessage && (
            <button
              className="action-btn"
              onClick={() => setIsEditing(true)}
              title="Edit message"
            >
              <Pencil size={16} />
            </button>
          )}
          {/* Delete button */}
          {isOwnMessage && (
            <button
              className="action-btn action-btn-delete"
              onClick={handleDeleteClick}
              title="Delete message"
            >
              <Trash2 size={16} />
            </button>
          )}
          {/* Pin button */}
          {onPinMessage && (
            <button
              className={`action-btn action-btn-pin ${isPinned ? 'pinned' : ''}`}
              onClick={onPinMessage}
              title={isPinned ? 'Already pinned' : 'Pin message'}
            >
              <Pin size={16} />
            </button>
          )}
          {/* Forward button */}
          {onForwardMessage && (
            <button
              className="action-btn"
              onClick={onForwardMessage}
              title="Forward message"
            >
              <Forward size={16} />
            </button>
          )}
          {/* Reply button */}
          {onReply && (
            <button
              className="action-btn"
              onClick={onReply}
              title="Reply"
            >
              <Reply size={16} />
            </button>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Message"
        message="Are you sure you want to delete this message? This action cannot be undone."
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
}

// Helper: Render message content with basic formatting
function renderContent(content: string, currentUserEmail?: string, validMentions?: string[]): React.ReactElement {
  // Split by newlines and render
  const lines = content.split('\n');

  return (
    <>
      {lines.map((line, idx) => (
        <span key={idx}>
          {renderLine(line, currentUserEmail, validMentions)}
          {idx < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

// URL regex for detecting links
const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;

// Helper: Render a single line with @mentions and URLs highlighted
function renderLine(line: string, currentUserEmail?: string, validMentions?: string[]): React.ReactElement {
  // First, split by URLs
  const urlParts = line.split(URL_REGEX);
  const parts: (string | React.ReactElement)[] = [];

  // Get current user's display name for comparison
  const currentUserDisplayName = currentUserEmail ? currentUserEmail.split('@')[0].toLowerCase() : '';

  // Create lowercase set of valid mentions for quick lookup
  const validMentionsLower = validMentions ? new Set(validMentions.map(m => m.toLowerCase())) : null;

  urlParts.forEach((part, urlIdx) => {
    // Check if this part is a URL
    if (URL_REGEX.test(part)) {
      URL_REGEX.lastIndex = 0; // Reset regex
      parts.push(
        <a
          key={`url-${urlIdx}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="message-link"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    } else {
      // Process mentions within non-URL parts
      const mentionRegex = /@([a-zA-Z0-9_.-]+)(?=\s|$)/g;
      let lastIndex = 0;
      let match;

      while ((match = mentionRegex.exec(part)) !== null) {
        const mentionedName = match[1];
        const mentionedNameLower = mentionedName.toLowerCase();

        // Only style as mention if it's a valid team member
        const isValidMention = validMentionsLower ? validMentionsLower.has(mentionedNameLower) : true;

        if (isValidMention) {
          // Add text before mention
          if (match.index > lastIndex) {
            parts.push(part.substring(lastIndex, match.index));
          }

          // Check if this mention is for the current user
          const isCurrentUser = currentUserDisplayName && mentionedNameLower === currentUserDisplayName;

          // Add mention with special styling for current user
          parts.push(
            <span
              key={`mention-${urlIdx}-${match.index}`}
              className={`mention ${isCurrentUser ? 'mention-me' : ''}`}
              title={mentionedName}
            >
              @{mentionedName}
            </span>
          );

          lastIndex = match.index + match[0].length;
        }
        // If not a valid mention, it will be included as plain text in the remaining text
      }

      // Add remaining text
      if (lastIndex < part.length) {
        parts.push(part.substring(lastIndex));
      }
    }
  });

  return <>{parts}</>;
}

// Attachment item component
interface AttachmentItemProps {
  attachment: MessageAttachment;
  channels?: Channel[];
  currentChannelId?: string;
  currentUserEmail?: string;
  teamMembers?: { [email: string]: TeamMember };
  onShareToChat?: (imageUrl: string, imageName: string, targetChannelId: string, message?: string) => Promise<void>;
}

function AttachmentItem({
  attachment,
  channels,
  currentChannelId,
  currentUserEmail,
  teamMembers,
  onShareToChat,
}: AttachmentItemProps): React.ReactElement {
  const [showLightbox, setShowLightbox] = useState(false);
  const [showPdfLightbox, setShowPdfLightbox] = useState(false);
  const [showFileLightbox, setShowFileLightbox] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const isImage = isImageFile(attachment.type);
  const isPDF = isPDFFile(attachment.type);

  // Check if file is a viewable document
  const getDocumentType = (): 'docx' | 'xlsx' | 'pptx' | null => {
    const ext = attachment.name.toLowerCase().split('.').pop();
    if (ext === 'docx' || ext === 'doc') return 'docx';
    if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
    if (ext === 'pptx' || ext === 'ppt') return 'pptx';
    return null;
  };

  const documentType = getDocumentType();
  const isViewableDocument = documentType !== null;

  // Download handler - saves directly to Downloads folder
  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      // Get the Downloads folder path
      const downloadsPath = await downloadDir();
      const filePath = `${downloadsPath}/${attachment.name}`;

      // Fetch the file from Firebase Storage
      const response = await fetch(attachment.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`);
      }

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Write to Downloads folder
      await writeFile(filePath, uint8Array);

      // Show success indicator
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback: open in new tab
      window.open(attachment.url, '_blank');
    }
  };

  if (isImage) {
    return (
      <>
        <div className="attachment-image-container">
          <img
            src={attachment.url}
            alt={attachment.name}
            className="attachment-image"
            loading="lazy"
            onClick={() => setShowLightbox(true)}
          />
          <div className="attachment-image-overlay">
            <button
              className="attachment-action"
              onClick={() => setShowLightbox(true)}
              title="View full size"
            >
              <ExternalLink size={16} />
            </button>
            <button
              className={`attachment-action ${downloaded ? 'downloaded' : ''}`}
              title={downloaded ? 'Downloaded!' : 'Download'}
              onClick={handleDownload}
            >
              {downloaded ? <Check size={16} /> : <Download size={16} />}
            </button>
          </div>
        </div>

        {/* Image Lightbox Modal */}
        <ImageLightbox
          isOpen={showLightbox}
          imageUrl={attachment.url}
          imageName={attachment.name}
          onClose={() => setShowLightbox(false)}
          channels={channels}
          currentChannelId={currentChannelId}
          currentUserEmail={currentUserEmail}
          members={teamMembers}
          onShareToChat={
            onShareToChat
              ? (targetChannelId, message) => onShareToChat(attachment.url, attachment.name, targetChannelId, message)
              : undefined
          }
        />
      </>
    );
  }

  // PDF attachment - clickable to open lightbox
  if (isPDF) {
    return (
      <>
        <div
          className="attachment-file attachment-file-clickable"
          onClick={() => setShowPdfLightbox(true)}
        >
          <div className="attachment-file-icon pdf">
            <FileText size={24} />
          </div>
          <div className="attachment-file-info">
            <span className="attachment-file-name clickable">
              {attachment.name}
            </span>
            <span className="attachment-file-size">{formatFileSize(attachment.size)}</span>
          </div>
          <button
            className={`attachment-download-btn ${downloaded ? 'downloaded' : ''}`}
            title={downloaded ? 'Downloaded!' : 'Download'}
            onClick={handleDownload}
          >
            {downloaded ? <Check size={16} /> : <Download size={16} />}
          </button>
        </div>

        {/* PDF Lightbox Modal */}
        <PdfLightbox
          isOpen={showPdfLightbox}
          pdfUrl={attachment.url}
          pdfName={attachment.name}
          onClose={() => setShowPdfLightbox(false)}
        />
      </>
    );
  }

  // Viewable document attachments (DOCX, XLSX, PPTX)
  if (isViewableDocument && documentType) {
    return (
      <>
        <div
          className="attachment-file attachment-file-clickable"
          onClick={() => setShowFileLightbox(true)}
        >
          <div className="attachment-file-icon document">
            <FileText size={24} />
          </div>
          <div className="attachment-file-info">
            <span className="attachment-file-name clickable">
              {attachment.name}
            </span>
            <span className="attachment-file-size">{formatFileSize(attachment.size)}</span>
          </div>
          <button
            className={`attachment-download-btn ${downloaded ? 'downloaded' : ''}`}
            title={downloaded ? 'Downloaded!' : 'Download'}
            onClick={handleDownload}
          >
            {downloaded ? <Check size={16} /> : <Download size={16} />}
          </button>
        </div>

        {/* File Lightbox Modal */}
        <FileLightbox
          isOpen={showFileLightbox}
          fileUrl={attachment.url}
          fileName={attachment.name}
          fileType={documentType}
          onClose={() => setShowFileLightbox(false)}
        />
      </>
    );
  }

  // Other file attachments (non-viewable)
  return (
    <div className="attachment-file">
      <div className="attachment-file-icon">
        <FileIcon size={24} />
      </div>
      <div className="attachment-file-info">
        <span className="attachment-file-name">
          {attachment.name}
        </span>
        <span className="attachment-file-size">{formatFileSize(attachment.size)}</span>
      </div>
      <button
        className={`attachment-download-btn ${downloaded ? 'downloaded' : ''}`}
        title={downloaded ? 'Downloaded!' : 'Download'}
        onClick={handleDownload}
      >
        {downloaded ? <Check size={16} /> : <Download size={16} />}
      </button>
    </div>
  );
}
