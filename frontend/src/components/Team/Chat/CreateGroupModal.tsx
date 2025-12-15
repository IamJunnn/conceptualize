/**
 * CreateGroupModal - Select team members to create or add to a group chat
 */

import { useState, useEffect } from 'react';
import { X, Users, UserPlus } from 'lucide-react';
import { TeamMember } from '../../../services/teamService';
import './CreateGroupModal.css';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: { [email: string]: TeamMember };
  currentUserEmail: string;
  onCreateGroup: (selectedEmails: string[], groupName: string) => void;
  // For adding members to existing group
  mode?: 'create' | 'add';
  existingParticipants?: string[];
  onAddMembers?: (selectedEmails: string[]) => void;
}

export default function CreateGroupModal({
  isOpen,
  onClose,
  members,
  currentUserEmail,
  onCreateGroup,
  mode = 'create',
  existingParticipants = [],
  onAddMembers,
}: CreateGroupModalProps) {
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [groupName, setGroupName] = useState('');

  // Initialize selected members with existing participants when in 'add' mode
  useEffect(() => {
    if (isOpen && mode === 'add' && existingParticipants.length > 0) {
      setSelectedMembers(new Set(existingParticipants.filter(e => e !== currentUserEmail)));
    }
  }, [isOpen, mode, existingParticipants, currentUserEmail]);

  if (!isOpen) return null;

  const isAddMode = mode === 'add';

  // Get all team members (including current user for group creation)
  // Filter out malformed duplicate entries (e.g., "user@gmail" vs "user@gmail.com")
  const currentEmailLower = currentUserEmail.toLowerCase();
  const currentEmailBase = currentEmailLower.split('@')[0];

  const allMembers = Object.entries(members)
    .filter(([memberEmail]) => {
      const emailLower = memberEmail.toLowerCase();
      // Keep the current user's proper email
      if (emailLower === currentEmailLower) return true;
      // Filter out malformed emails that are partial matches of the current user
      const emailBase = emailLower.split('@')[0];
      if (emailBase === currentEmailBase && emailLower.startsWith(currentEmailBase + '@')) {
        if (currentEmailLower.startsWith(emailLower) || emailLower.startsWith(currentEmailLower)) {
          // This is a malformed duplicate - filter it out
          if (emailLower !== currentEmailLower) return false;
        }
      }
      return true;
    })
    .map(([memberEmail, member]) => ({ ...member, email: memberEmail }));

  // Filter by search query
  const filteredMembers = allMembers.filter(member => {
    const name = member.displayName || member.email.split('@')[0];
    return name.toLowerCase().includes(searchQuery.toLowerCase()) ||
           member.email.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Check if member is already in the group (for add mode)
  const isExistingMember = (email: string) => {
    return existingParticipants.includes(email);
  };

  // Toggle member selection
  const toggleMember = (email: string) => {
    // In add mode, don't allow deselecting existing members
    if (isAddMode && isExistingMember(email)) return;

    const newSelected = new Set(selectedMembers);
    if (newSelected.has(email)) {
      newSelected.delete(email);
    } else {
      newSelected.add(email);
    }
    setSelectedMembers(newSelected);
  };

  // Get display name
  const getDisplayName = (email: string, member: TeamMember) => {
    return member.displayName || email.split('@')[0];
  };

  // Get initials for avatar
  const getInitials = (email: string, member: TeamMember) => {
    const name = getDisplayName(email, member);
    return name.substring(0, 2).toUpperCase();
  };

  // Handle create/add action
  const handleAction = () => {
    if (isAddMode) {
      // Get only newly added members
      const newMembers = Array.from(selectedMembers).filter(
        email => !existingParticipants.includes(email)
      );
      if (newMembers.length === 0) {
        onClose();
        return;
      }
      if (onAddMembers) {
        onAddMembers(newMembers);
      }
    } else {
      if (selectedMembers.size === 0) return;
      onCreateGroup(Array.from(selectedMembers), groupName);
    }
    // Reset state
    setSelectedMembers(new Set());
    setSearchQuery('');
    setGroupName('');
    onClose();
  };

  // Handle close
  const handleClose = () => {
    setSelectedMembers(new Set());
    setSearchQuery('');
    setGroupName('');
    onClose();
  };

  // Count new selections (for add mode)
  const newSelectionsCount = isAddMode
    ? Array.from(selectedMembers).filter(e => !existingParticipants.includes(e)).length
    : selectedMembers.size;

  return (
    <div className="create-group-backdrop" onClick={handleClose}>
      <div className="create-group-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="create-group-header">
          <div className="header-title">
            {isAddMode ? <UserPlus size={20} /> : <Users size={20} />}
            <h3>{isAddMode ? 'Add Members' : 'Create Group'}</h3>
          </div>
          <button className="close-btn" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        {/* Subheader */}
        <div className="create-group-subheader">
          <p>
            {isAddMode
              ? `${selectedMembers.size} member${selectedMembers.size !== 1 ? 's' : ''} selected${newSelectionsCount > 0 ? ` (${newSelectionsCount} new)` : ''}`
              : `Select team members to add to the group`
            }
          </p>
        </div>

        {/* Group name input - only show for create mode */}
        {!isAddMode && (
          <div className="group-name-input-wrapper">
            <input
              type="text"
              placeholder="Group name (optional)"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="group-name-input"
            />
          </div>
        )}

        {/* Search input */}
        <div className="search-input-wrapper">
          <input
            type="text"
            placeholder="Search team members"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        {/* Members list */}
        <div className="members-list-container">
          {filteredMembers.length === 0 ? (
            <div className="no-members">
              <p>No team members found</p>
            </div>
          ) : (
            filteredMembers.map(member => {
              const isExisting = isAddMode && isExistingMember(member.email);
              return (
                <div
                  key={member.email}
                  className={`member-row ${selectedMembers.has(member.email) ? 'selected' : ''} ${isExisting ? 'existing' : ''}`}
                  onClick={() => toggleMember(member.email)}
                >
                  <div className="member-avatar-lg">
                    {(member.customAvatar || member.photoURL) ? (
                      <img src={member.customAvatar || member.photoURL} alt={getDisplayName(member.email, member)} className="avatar-image" />
                    ) : (
                      getInitials(member.email, member)
                    )}
                  </div>
                  <div className="member-details">
                    <span className="member-display-name">
                      {getDisplayName(member.email, member)}
                      {member.email.toLowerCase() === currentEmailLower && <span className="you-badge">You</span>}
                      {isExisting && <span className="existing-badge">In group</span>}
                    </span>
                    <span className="member-role-text">
                      {member.role || 'member'}
                    </span>
                  </div>
                  <div className={`checkbox ${selectedMembers.has(member.email) ? 'checked' : ''} ${isExisting ? 'disabled' : ''}`}>
                    {selectedMembers.has(member.email) && (
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

        {/* Footer buttons */}
        <div className="create-group-footer">
          <button className="btn-cancel-group" onClick={handleClose}>
            Cancel
          </button>
          <button
            className="btn-create-group"
            onClick={handleAction}
            disabled={isAddMode ? newSelectionsCount === 0 : selectedMembers.size === 0}
          >
            {isAddMode ? 'Add Members' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}
