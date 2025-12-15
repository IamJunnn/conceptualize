/**
 * MessageSearchDropdown - Dropdown for searching messages in current chat
 * Shows matching messages with highlighted search terms
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { FileText, File as FileIcon, Image, ArrowRight, MessageSquare, StickyNote, Folder } from 'lucide-react';
import { ChatMessage } from '../../../services/teamChatTypes';
import { formatMessageTime } from '../../../services/teamChatTypes';
import './MessageSearchDropdown.css';

type SearchTab = 'messages' | 'notes' | 'files';

interface MessageSearchDropdownProps {
  isOpen: boolean;
  searchQuery: string;
  messages: ChatMessage[];
  channelName: string;
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
  onClearSearch: () => void;
}

interface SearchResult {
  message: ChatMessage;
  matchType: 'content' | 'attachment' | 'filename';
  relevanceScore: number;
}

export default function MessageSearchDropdown({
  isOpen,
  searchQuery,
  messages,
  channelName,
  onClose,
  onJumpToMessage,
  onClearSearch: _onClearSearch,
}: MessageSearchDropdownProps) {
  const [activeTab, setActiveTab] = useState<SearchTab>('messages');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        // Don't close if clicking on search input
        const searchInput = document.querySelector('.header-search-input');
        if (searchInput && searchInput.contains(e.target as Node)) {
          return;
        }
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Search and filter messages
  const searchResults = useMemo((): SearchResult[] => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];

    const query = searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    messages.forEach(message => {
      let matchType: 'content' | 'attachment' | 'filename' | null = null;
      let relevanceScore = 0;

      // Search in message content
      if (message.content && message.content.toLowerCase().includes(query)) {
        matchType = 'content';
        // Higher score for exact match, more occurrences
        const occurrences = (message.content.toLowerCase().match(new RegExp(query, 'g')) || []).length;
        relevanceScore = occurrences * 10;
        // Boost if query is at start
        if (message.content.toLowerCase().startsWith(query)) {
          relevanceScore += 20;
        }
      }

      // Search in attachment names
      if (message.attachments && message.attachments.length > 0) {
        for (const attachment of message.attachments) {
          if (attachment.name.toLowerCase().includes(query)) {
            if (!matchType) matchType = 'filename';
            relevanceScore += 15;
          }
        }
      }

      // Search in shared file names
      if (message.sharedFile && message.sharedFile.name.toLowerCase().includes(query)) {
        if (!matchType) matchType = 'attachment';
        relevanceScore += 15;
      }

      if (matchType) {
        results.push({ message, matchType, relevanceScore });
      }
    });

    return results;
  }, [messages, searchQuery]);

  // Sort results by newest first
  const sortedResults = useMemo(() => {
    const sorted = [...searchResults];
    sorted.sort((a, b) => b.message.createdAt.getTime() - a.message.createdAt.getTime());
    return sorted;
  }, [searchResults]);

  // Filter results based on active tab
  const filteredResults = useMemo(() => {
    if (activeTab === 'messages') {
      // Show message content matches
      return sortedResults.filter(r => r.matchType === 'content');
    } else if (activeTab === 'files') {
      // Show file/attachment matches
      return sortedResults.filter(r => r.matchType === 'filename' || r.matchType === 'attachment');
    }
    // Notes tab - placeholder for future implementation
    return [];
  }, [sortedResults, activeTab]);

  // Get counts for each tab
  const messageCounts = useMemo(() => {
    const messageCount = sortedResults.filter(r => r.matchType === 'content').length;
    const fileCount = sortedResults.filter(r => r.matchType === 'filename' || r.matchType === 'attachment').length;
    return { messages: messageCount, notes: 0, files: fileCount };
  }, [sortedResults]);

  // Highlight search terms in text
  const highlightText = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text;

    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));

    return parts.map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={index} className="search-highlight">{part}</mark>
      ) : (
        part
      )
    );
  };

  // Get file icon for attachment
  const getAttachmentIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image size={14} />;
    if (type.includes('pdf')) return <FileText size={14} />;
    return <FileIcon size={14} />;
  };

  // Truncate content for preview
  const getContentPreview = (content: string, query: string, maxLength: number = 150): string => {
    if (content.length <= maxLength) return content;

    // Find the position of the query
    const queryIndex = content.toLowerCase().indexOf(query.toLowerCase());

    if (queryIndex === -1) {
      return content.substring(0, maxLength) + '...';
    }

    // Show context around the query
    const start = Math.max(0, queryIndex - 40);
    const end = Math.min(content.length, queryIndex + query.length + 80);

    let preview = content.substring(start, end);
    if (start > 0) preview = '...' + preview;
    if (end < content.length) preview = preview + '...';

    return preview;
  };

  if (!isOpen || searchQuery.length < 2) return null;

  return (
    <div className="message-search-dropdown" ref={dropdownRef}>
      {/* Header with category tabs */}
      <div className="search-dropdown-header">
        <div className="search-category-tabs">
          <button
            className={`category-tab ${activeTab === 'messages' ? 'active' : ''}`}
            onClick={() => setActiveTab('messages')}
          >
            <MessageSquare size={14} />
            Messages
            {messageCounts.messages > 0 && (
              <span className="tab-count">{messageCounts.messages}</span>
            )}
          </button>
          <button
            className={`category-tab ${activeTab === 'notes' ? 'active' : ''}`}
            onClick={() => setActiveTab('notes')}
          >
            <StickyNote size={14} />
            Notes
            {messageCounts.notes > 0 && (
              <span className="tab-count">{messageCounts.notes}</span>
            )}
          </button>
          <button
            className={`category-tab ${activeTab === 'files' ? 'active' : ''}`}
            onClick={() => setActiveTab('files')}
          >
            <Folder size={14} />
            Files
            {messageCounts.files > 0 && (
              <span className="tab-count">{messageCounts.files}</span>
            )}
          </button>
        </div>
      </div>

      {/* Results list */}
      <div className="search-results-list">
        {filteredResults.length > 0 ? (
          <>
            {/* Channel indicator */}
            <div className="search-channel-indicator">
              @ {channelName}
            </div>

            {filteredResults.map(({ message, matchType }) => (
              <div
                key={message.id}
                className="search-result-item"
                onClick={() => {
                  onJumpToMessage(message.id);
                  onClose();
                }}
              >
                {/* Avatar */}
                <div className="search-result-avatar">
                  {message.senderPhotoURL ? (
                    <img src={message.senderPhotoURL} alt={message.senderName} />
                  ) : (
                    message.senderName.substring(0, 2).toUpperCase()
                  )}
                </div>

                {/* Content */}
                <div className="search-result-content">
                  <div className="search-result-header">
                    <span className="search-result-sender">{message.senderName}</span>
                    <span className="search-result-time">{formatMessageTime(message.createdAt)}</span>
                  </div>

                  {/* Message content preview */}
                  {message.content && matchType === 'content' && (
                    <div className="search-result-preview">
                      {highlightText(getContentPreview(message.content, searchQuery), searchQuery)}
                    </div>
                  )}

                  {/* Attachment indicator */}
                  {matchType === 'filename' && message.attachments && (
                    <div className="search-result-attachment">
                      {message.attachments
                        .filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((attachment, idx) => (
                          <span key={idx} className="attachment-badge">
                            {getAttachmentIcon(attachment.type)}
                            {highlightText(attachment.name, searchQuery)}
                          </span>
                        ))}
                    </div>
                  )}

                  {/* Shared file indicator */}
                  {matchType === 'attachment' && message.sharedFile && (
                    <div className="search-result-attachment">
                      <span className="attachment-badge">
                        <FileText size={14} />
                        {highlightText(message.sharedFile.name, searchQuery)}
                      </span>
                    </div>
                  )}

                  {/* Show content preview even for attachment matches */}
                  {matchType !== 'content' && message.content && (
                    <div className="search-result-preview secondary">
                      {message.content.length > 80 ? message.content.substring(0, 80) + '...' : message.content}
                    </div>
                  )}
                </div>

                {/* Jump button */}
                <button className="search-result-jump" title="Jump to message">
                  Jump
                  <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </>
        ) : (
          <div className="search-empty-state">
            <div className="search-empty-icon">
              {activeTab === 'messages' && <MessageSquare size={48} />}
              {activeTab === 'notes' && <StickyNote size={48} />}
              {activeTab === 'files' && <Folder size={48} />}
            </div>
            <p className="search-empty-title">
              {activeTab === 'notes' ? 'Notes search coming soon' : 'No results found'}
            </p>
            <p className="search-empty-subtitle">
              {activeTab === 'messages' && 'No messages match your search.'}
              {activeTab === 'notes' && 'Search shared notes in this channel.'}
              {activeTab === 'files' && 'No files match your search.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
