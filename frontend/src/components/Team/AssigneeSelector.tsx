import { useState, useRef, useEffect } from 'react';
import { TeamMember } from '../../services/teamService';
import { getInitialsFromEmail } from '../../services/teamTodoTypes';
import { ChevronDownIcon, CheckIcon, UserIcon } from '@heroicons/react/24/outline';
import './AssigneeSelector.css';

interface AssigneeSelectorProps {
  members: TeamMember[];
  selectedEmails: string[];
  onChange: (emails: string[]) => void;
  currentUserEmail: string;
  placeholder?: string;
  disabled?: boolean;
}

export default function AssigneeSelector({
  members,
  selectedEmails,
  onChange,
  currentUserEmail,
  placeholder = 'Assign to...',
  disabled = false,
}: AssigneeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const toggleMember = (email: string) => {
    if (selectedEmails.includes(email)) {
      onChange(selectedEmails.filter(e => e !== email));
    } else {
      onChange([...selectedEmails, email]);
    }
  };

  const assignToMe = () => {
    if (!selectedEmails.includes(currentUserEmail)) {
      onChange([...selectedEmails, currentUserEmail]);
    }
    setIsOpen(false);
  };

  const clearAll = () => {
    onChange([]);
  };

  // Sort members: current user first, then alphabetically
  const sortedMembers = [...members].sort((a, b) => {
    if (a.email === currentUserEmail) return -1;
    if (b.email === currentUserEmail) return 1;
    return (a.displayName || a.email).localeCompare(b.displayName || b.email);
  });

  return (
    <div className={`assignee-selector ${disabled ? 'disabled' : ''}`} ref={containerRef}>
      <button
        type="button"
        className={`assignee-selector-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        {selectedEmails.length === 0 ? (
          <span className="placeholder">
            <UserIcon className="placeholder-icon" />
            {placeholder}
          </span>
        ) : (
          <div className="selected-avatars">
            {selectedEmails.slice(0, 3).map(email => {
              const member = members.find(m => m.email === email);
              return (
                <div
                  key={email}
                  className="mini-avatar"
                  title={member?.displayName || email}
                >
                  {(member?.customAvatar || member?.photoURL) ? (
                    <img src={member.customAvatar || member.photoURL} alt={member.displayName || email} className="avatar-image" />
                  ) : (
                    getInitialsFromEmail(email)
                  )}
                </div>
              );
            })}
            {selectedEmails.length > 3 && (
              <span className="more-count">+{selectedEmails.length - 3}</span>
            )}
          </div>
        )}
        <ChevronDownIcon className={`dropdown-arrow ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="assignee-dropdown">
          {/* Quick actions */}
          <div className="assignee-quick-actions">
            <button
              type="button"
              className="quick-action-btn"
              onClick={assignToMe}
            >
              <UserIcon className="action-icon" />
              Assign to me
            </button>
            {selectedEmails.length > 0 && (
              <button
                type="button"
                className="quick-action-btn clear"
                onClick={clearAll}
              >
                Clear all
              </button>
            )}
          </div>

          <div className="assignee-divider" />

          {/* Members list */}
          <div className="assignee-list">
            {sortedMembers.map(member => {
              const isSelected = selectedEmails.includes(member.email);
              const isCurrentUser = member.email === currentUserEmail;

              return (
                <button
                  key={member.email}
                  type="button"
                  className={`assignee-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleMember(member.email)}
                >
                  <div className="assignee-avatar">
                    {(member.customAvatar || member.photoURL) ? (
                      <img src={member.customAvatar || member.photoURL} alt={member.displayName || member.email} className="avatar-image" />
                    ) : (
                      getInitialsFromEmail(member.email)
                    )}
                  </div>
                  <div className="assignee-info">
                    <span className="assignee-name">
                      {member.displayName || member.email.split('@')[0]}
                      {isCurrentUser && <span className="you-label">(You)</span>}
                    </span>
                    <span className="assignee-email">{member.email}</span>
                  </div>
                  {isSelected && (
                    <CheckIcon className="check-icon" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
