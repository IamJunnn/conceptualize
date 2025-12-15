/**
 * ChatInput - Discord-style message composition
 * Handles text input with + button menu, placeholder, and send
 * Supports draft saving per channel, @mentions, drag/drop files, and paste images
 */

import React, { useState, useRef, KeyboardEvent, useEffect, useCallback } from 'react';
import { Plus, Send, Upload, BarChart2, X, Image, FileText, File as FileIcon, Reply, CheckSquare, Calendar, Video, PenTool } from 'lucide-react';
import MentionSuggestions, { MentionableUser } from './MentionSuggestions';
import ConfirmModal from '../../UI/ConfirmModal';
import { ChatMessage } from '../../../services/teamChatTypes';
import { getLocalStorage, setLocalStorage, removeLocalStorage } from '../../../hooks/useLocalStorage';
import './ChatInput.css';

interface ChatInputProps {
  channelName: string;
  channelId?: string; // Used for saving drafts per channel
  onSendMessage: (content: string, attachments?: File[]) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  onFileUpload?: () => void;
  onCreatePoll?: () => void;
  // Insert content from app callbacks
  onInsertNote?: () => void;
  onInsertTask?: () => void;
  onInsertMeeting?: () => void;
  onInsertRecording?: () => void;
  onInsertWhiteboard?: () => void;
  mentionableUsers?: MentionableUser[]; // Users that can be @mentioned
  maxFileSizeMB?: number; // Max file size in MB (default 500)
  externalFiles?: File[]; // Files dropped on parent component
  onExternalFilesProcessed?: () => void; // Called after external files are processed
  // Reply functionality
  replyingTo?: ChatMessage | null;
  onCancelReply?: () => void;
}

// Helper to get draft key for localStorage
const getDraftKey = (channelId: string) => `chat_draft_${channelId}`;

// Helper to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function ChatInput({
  channelName,
  channelId,
  onSendMessage,
  disabled = false,
  placeholder,
  onFileUpload,
  onCreatePoll,
  onInsertNote,
  onInsertTask,
  onInsertMeeting,
  onInsertRecording,
  onInsertWhiteboard,
  mentionableUsers = [],
  maxFileSizeMB = 500,
  externalFiles,
  onExternalFilesProcessed,
  replyingTo,
  onCancelReply,
}: ChatInputProps) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Mention state
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null);

  // File attachment state
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [showFileTooLargeModal, setShowFileTooLargeModal] = useState(false);
  const [rejectedFileName, setRejectedFileName] = useState<string>('');
  const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;

  // Load draft from localStorage when channel changes
  useEffect(() => {
    if (channelId) {
      const savedDraft = getLocalStorage<string>(getDraftKey(channelId), '');
      if (savedDraft) {
        setContent(savedDraft);
        // Auto-resize textarea for loaded draft
        // Use double requestAnimationFrame to ensure React has rendered and browser has painted
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              const maxHeight = window.innerHeight * 0.5;
              textareaRef.current.style.height = 'auto';
              textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, maxHeight) + 'px';
            }
          });
        });
      } else {
        setContent('');
        // Reset height when no draft
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      }
    }
  }, [channelId]);

  // Save draft to localStorage (debounced)
  const saveDraft = useCallback((text: string) => {
    if (!channelId) return;

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save by 500ms
    saveTimeoutRef.current = setTimeout(() => {
      if (text.trim()) {
        setLocalStorage(getDraftKey(channelId), text);
      } else {
        removeLocalStorage(getDraftKey(channelId));
      }
    }, 500);
  }, [channelId]);

  // Clear draft from localStorage
  const clearDraft = useCallback(() => {
    if (channelId) {
      removeLocalStorage(getDraftKey(channelId));
    }
  }, [channelId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  // Clear attached files when channel changes
  useEffect(() => {
    setAttachedFiles([]);
    setShowFileTooLargeModal(false);
    setRejectedFileName('');
  }, [channelId]);

  // Validate file size
  const validateFile = (file: File): string | null => {
    if (file.size > maxFileSizeBytes) {
      return `File "${file.name}" is too large. Maximum size is ${maxFileSizeMB}MB.`;
    }
    return null;
  };

  // Add files to attachment list
  const addFiles = useCallback((files: FileList | File[]) => {
    const newFiles: File[] = [];
    let firstTooLargeFile: string | null = null;

    Array.from(files).forEach(file => {
      const error = validateFile(file);
      if (error) {
        if (!firstTooLargeFile) {
          firstTooLargeFile = file.name;
        }
      } else {
        newFiles.push(file);
      }
    });

    // Show modal for the first file that's too large
    if (firstTooLargeFile) {
      setRejectedFileName(firstTooLargeFile);
      setShowFileTooLargeModal(true);
    }

    if (newFiles.length > 0) {
      setAttachedFiles(prev => [...prev, ...newFiles]);
    }
  }, [maxFileSizeBytes]);

  // Handle external files (dropped on parent component)
  useEffect(() => {
    if (externalFiles && externalFiles.length > 0) {
      addFiles(externalFiles);
      onExternalFilesProcessed?.();
    }
  }, [externalFiles, addFiles, onExternalFilesProcessed]);

  // Remove file from attachment list
  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      addFiles(files);
    }
  }, [addFiles]);

  // Handle paste (for images/screenshots)
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          // Create a named file for pasted images
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const namedFile = new File([file], `pasted-image-${timestamp}.png`, {
            type: file.type,
          });
          imageFiles.push(namedFile);
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault(); // Prevent pasting image data as text
      addFiles(imageFiles);
    }
  }, [addFiles]);

  // Get file icon based on type
  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <Image size={16} />;
    }
    if (file.type.includes('pdf') || file.type.includes('document')) {
      return <FileText size={16} />;
    }
    return <FileIcon size={16} />;
  };

  const handleSend = async () => {
    const trimmedContent = content.trim();
    const hasContent = trimmedContent.length > 0;
    const hasFiles = attachedFiles.length > 0;

    if ((!hasContent && !hasFiles) || sending || disabled) return;

    setSending(true);
    try {
      await onSendMessage(trimmedContent, attachedFiles.length > 0 ? attachedFiles : undefined);
      setContent('');
      setAttachedFiles([]); // Clear attached files after send
      clearDraft(); // Clear draft after successful send

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Filter mentionable users based on search
  const filteredMentionUsers = mentionableUsers.filter(user => {
    if (!mentionSearch) return true;
    const searchLower = mentionSearch.toLowerCase();
    const displayName = user.displayName || user.email.split('@')[0];
    return (
      displayName.toLowerCase().includes(searchLower) ||
      user.email.toLowerCase().includes(searchLower)
    );
  });

  // Reset mention index when search changes
  useEffect(() => {
    setMentionIndex(0);
  }, [mentionSearch]);

  // Handle selecting a mention
  const handleSelectMention = useCallback((user: MentionableUser) => {
    if (mentionStartPos === null) return;

    const beforeMention = content.substring(0, mentionStartPos);
    const afterMention = content.substring(mentionStartPos + 1 + mentionSearch.length);
    // Use display name instead of email for cleaner mentions
    const displayName = user.displayName || user.email.split('@')[0];
    const mentionText = `@${displayName} `;

    const newContent = beforeMention + mentionText + afterMention;
    setContent(newContent);
    saveDraft(newContent);

    // Close mention dropdown
    setShowMentions(false);
    setMentionSearch('');
    setMentionStartPos(null);

    // Focus textarea and set cursor after mention
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newCursorPos = mentionStartPos + mentionText.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  }, [content, mentionStartPos, mentionSearch, saveDraft]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle mention navigation
    if (showMentions && filteredMentionUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev =>
          prev < filteredMentionUsers.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev =>
          prev > 0 ? prev - 1 : filteredMentionUsers.length - 1
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectMention(filteredMentionUsers[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentions(false);
        setMentionSearch('');
        setMentionStartPos(null);
        return;
      }
    }

    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    setContent(newValue);
    saveDraft(newValue); // Save draft as user types

    // Auto-resize textarea up to 50% of viewport height
    const textarea = e.target;
    const maxHeight = window.innerHeight * 0.5;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';

    // Mention detection: Check if we're typing after an @
    if (mentionableUsers.length > 0) {
      // Find the last @ before cursor
      const textBeforeCursor = newValue.substring(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');

      if (lastAtIndex !== -1) {
        // Check if @ is at start or preceded by space/newline
        const charBeforeAt = lastAtIndex > 0 ? newValue[lastAtIndex - 1] : ' ';
        if (charBeforeAt === ' ' || charBeforeAt === '\n' || lastAtIndex === 0) {
          // Check there's no space between @ and cursor
          const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
          if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
            setShowMentions(true);
            setMentionSearch(textAfterAt);
            setMentionStartPos(lastAtIndex);
            return;
          }
        }
      }

      // No valid mention trigger found
      setShowMentions(false);
      setMentionSearch('');
      setMentionStartPos(null);
    }
  };

  const handleFileUploadClick = () => {
    setShowMenu(false);
    onFileUpload?.();
  };

  const handleInsertNoteClick = () => {
    setShowMenu(false);
    onInsertNote?.();
  };

  const handleInsertTaskClick = () => {
    setShowMenu(false);
    onInsertTask?.();
  };

  const handleInsertMeetingClick = () => {
    setShowMenu(false);
    onInsertMeeting?.();
  };

  const handleInsertRecordingClick = () => {
    setShowMenu(false);
    onInsertRecording?.();
  };

  const handleInsertWhiteboardClick = () => {
    setShowMenu(false);
    onInsertWhiteboard?.();
  };

  const handleCreatePollClick = () => {
    setShowMenu(false);
    onCreatePoll?.();
  };

  const defaultPlaceholder = placeholder || `Message @${channelName}`;

  // Render content with highlighted mentions for the backdrop
  const renderHighlightedContent = () => {
    // Match @username mentions (word characters after @)
    const mentionRegex = /@([a-zA-Z0-9_.-]+)(?=\s|$)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      // Add text before mention
      if (match.index > lastIndex) {
        parts.push(content.substring(lastIndex, match.index));
      }

      // Add highlighted mention
      parts.push(
        <span key={match.index} className="input-mention-highlight">
          {match[0]}
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    // Add a trailing space to match textarea behavior
    parts.push(' ');

    return parts;
  };

  // Sync scroll between backdrop and textarea
  const handleScroll = () => {
    const textarea = textareaRef.current;
    const backdrop = document.querySelector('.input-highlight-backdrop') as HTMLElement;
    if (textarea && backdrop) {
      backdrop.scrollTop = textarea.scrollTop;
    }
  };

  return (
    <div
      className={`chat-input-container ${dragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Reply bar - shows when replying to a message */}
      {replyingTo && (
        <div className="reply-bar">
          <div className="reply-bar-content">
            <Reply size={14} className="reply-bar-icon" />
            <span className="reply-bar-label">Replying to</span>
            <span className="reply-bar-name">{replyingTo.senderName}</span>
          </div>
          <button
            className="reply-bar-close"
            onClick={onCancelReply}
            title="Cancel reply"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Drag overlay */}
      {dragOver && (
        <div className="drag-overlay">
          <Upload size={32} />
          <span>Drop files here</span>
        </div>
      )}

      {/* Attached files preview */}
      {attachedFiles.length > 0 && (
        <div className="attached-files-preview">
          {attachedFiles.map((file, index) => (
            <div key={index} className="attached-file-item">
              {file.type.startsWith('image/') ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="attached-image-thumbnail"
                />
              ) : (
                <div className="attached-file-icon">
                  {getFileIcon(file)}
                </div>
              )}
              <div className="attached-file-info">
                <span className="attached-file-name">{file.name}</span>
                <span className="attached-file-size">{formatFileSize(file.size)}</span>
              </div>
              <button
                className="remove-attached-file"
                onClick={() => removeFile(index)}
                title="Remove file"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="chat-input-wrapper">
        {/* Plus button with dropdown menu */}
        <div className="plus-btn-container" ref={menuRef}>
          <button
            className={`plus-btn ${showMenu ? 'active' : ''}`}
            onClick={() => setShowMenu(!showMenu)}
            disabled={disabled || sending}
            title="Attach"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>

          {/* Dropdown menu */}
          {showMenu && (
            <div className="plus-menu">
              {/* App Content Section */}
              {(onInsertNote || onInsertTask || onInsertMeeting || onInsertRecording || onInsertWhiteboard) && (
                <>
                  <div className="plus-menu-section">APP CONTENT</div>
                  {onInsertNote && (
                    <button className="plus-menu-item" onClick={handleInsertNoteClick}>
                      <FileText size={16} />
                      <span>Note or file from app</span>
                    </button>
                  )}
                  {onInsertTask && (
                    <button className="plus-menu-item" onClick={handleInsertTaskClick}>
                      <CheckSquare size={16} />
                      <span>Tasks from app</span>
                    </button>
                  )}
                  {onInsertMeeting && (
                    <button className="plus-menu-item" onClick={handleInsertMeetingClick}>
                      <Calendar size={16} />
                      <span>Meeting from app</span>
                    </button>
                  )}
                  {onInsertRecording && (
                    <button className="plus-menu-item" onClick={handleInsertRecordingClick}>
                      <Video size={16} />
                      <span>Recording from app</span>
                    </button>
                  )}
                  {onInsertWhiteboard && (
                    <button className="plus-menu-item" onClick={handleInsertWhiteboardClick}>
                      <PenTool size={16} />
                      <span>Whiteboard from app</span>
                    </button>
                  )}
                </>
              )}

              {/* Media Section */}
              <div className="plus-menu-section">MEDIA</div>
              <button className="plus-menu-item" onClick={handleFileUploadClick}>
                <Upload size={16} />
                <span>Upload File</span>
              </button>
              <button className="plus-menu-item" onClick={handleCreatePollClick}>
                <BarChart2 size={16} />
                <span>Create Poll</span>
              </button>
            </div>
          )}
        </div>

        {/* Main input area */}
        <div className="input-area">
          {/* Mention suggestions dropdown */}
          {showMentions && filteredMentionUsers.length > 0 && (
            <MentionSuggestions
              users={filteredMentionUsers}
              searchText={mentionSearch}
              onSelect={handleSelectMention}
              onClose={() => {
                setShowMentions(false);
                setMentionSearch('');
                setMentionStartPos(null);
              }}
              selectedIndex={mentionIndex}
            />
          )}
          {/* Highlight backdrop - shows mentions with colored background */}
          <div className="input-highlight-backdrop">
            {renderHighlightedContent()}
          </div>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            onPaste={handlePaste}
            placeholder={defaultPlaceholder}
            disabled={disabled || sending}
            className="message-input"
            rows={1}
          />
        </div>

        {/* Send button on right */}
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={(!content.trim() && attachedFiles.length === 0) || sending || disabled}
          title="Send message (Enter)"
        >
          {sending ? (
            <div className="send-spinner" />
          ) : (
            <Send size={18} />
          )}
        </button>
      </div>

      {/* File too large modal */}
      <ConfirmModal
        isOpen={showFileTooLargeModal}
        title="File Too Large"
        message={`"${rejectedFileName}" is too large to share. Maximum file size is ${maxFileSizeMB}MB.`}
        confirmText="OK"
        variant="info"
        hideCancel={true}
        onConfirm={() => setShowFileTooLargeModal(false)}
        onCancel={() => setShowFileTooLargeModal(false)}
      />
    </div>
  );
}
