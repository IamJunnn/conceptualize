/**
 * MentionSuggestions - Dropdown for @mention autocomplete
 * Shows contextually relevant users based on channel type
 */

import { useEffect, useRef } from 'react';
import './MentionSuggestions.css';

export interface MentionableUser {
  email: string;
  displayName?: string;
  photoURL?: string;
  customAvatar?: string; // DiceBear avatar (priority over photoURL)
  role?: string;
}

interface MentionSuggestionsProps {
  users: MentionableUser[];
  searchText: string; // Text after @ to filter
  onSelect: (user: MentionableUser) => void;
  onClose: () => void;
  selectedIndex: number;
  position?: { top: number; left: number };
}

export default function MentionSuggestions({
  users,
  searchText,
  onSelect,
  onClose,
  selectedIndex,
  position,
}: MentionSuggestionsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter users by search text
  const filteredUsers = users.filter(user => {
    const searchLower = searchText.toLowerCase();
    const displayName = user.displayName || user.email.split('@')[0];
    return (
      displayName.toLowerCase().includes(searchLower) ||
      user.email.toLowerCase().includes(searchLower)
    );
  });

  // Scroll selected item into view
  useEffect(() => {
    if (containerRef.current) {
      const selectedEl = containerRef.current.querySelector('.mention-item.selected');
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (filteredUsers.length === 0) {
    return null;
  }

  const getDisplayName = (user: MentionableUser) => {
    return user.displayName || user.email.split('@')[0];
  };

  // Get proper initials (e.g., "JunSeop Son" → "JS")
  const getInitials = (user: MentionableUser) => {
    const name = getDisplayName(user);
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Get avatar URL (prioritize customAvatar over photoURL)
  const getAvatarUrl = (user: MentionableUser) => {
    return user.customAvatar || user.photoURL;
  };

  return (
    <div
      ref={containerRef}
      className="mention-suggestions"
      style={position ? { bottom: position.top, left: position.left } : undefined}
    >
      <div className="mention-header">
        <span>Members matching <strong>@{searchText}</strong></span>
      </div>
      <div className="mention-list">
        {filteredUsers.map((user, index) => (
          <button
            key={user.email}
            className={`mention-item ${index === selectedIndex ? 'selected' : ''}`}
            onClick={() => onSelect(user)}
            onMouseEnter={() => {}} // Hover handled by CSS
          >
            <div className="mention-avatar">
              {getAvatarUrl(user) ? (
                <img src={getAvatarUrl(user)} alt={getDisplayName(user)} className="avatar-image" />
              ) : (
                getInitials(user)
              )}
            </div>
            <div className="mention-info">
              <span className="mention-name">{getDisplayName(user)}</span>
              <span className="mention-email">{user.email}</span>
            </div>
            {user.role && (
              <span className="mention-role">{user.role}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
