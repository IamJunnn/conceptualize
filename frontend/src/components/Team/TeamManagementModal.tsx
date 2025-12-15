import { useState, useEffect } from 'react';
import { Team, TeamInvitation, getTeamPendingInvites, cancelInvitation, resendInvitation, updateInvitationRole, reshareTeamContents, removeTeamMember } from '../../services/teamService';
import { User } from '../../services/authServiceTauri';
import ConfirmModal, { ModalVariant } from '../UI/ConfirmModal';
import './TeamManagementModal.css';

interface TeamManagementModalProps {
  team: Team;
  currentUser: User;
  onClose: () => void;
  onInviteMore?: () => void;
  onMemberRemoved?: () => void;
}

// Modal state interface
interface ModalState {
  isOpen: boolean;
  variant: ModalVariant;
  title: string;
  message: string;
  onConfirm: () => void;
}

export default function TeamManagementModal({ team, currentUser, onClose, onInviteMore, onMemberRemoved }: TeamManagementModalProps) {
  const [pendingInvites, setPendingInvites] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');
  const [resharingMember, setResharingMember] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);

  // Modal state for styled dialogs
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    variant: 'confirm',
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Show styled modal
  const showModal = (variant: ModalVariant, title: string, message: string, onConfirm?: () => void) => {
    setModal({
      isOpen: true,
      variant,
      title,
      message,
      onConfirm: onConfirm || (() => setModal(m => ({ ...m, isOpen: false }))),
    });
  };

  // Close modal
  const closeModal = () => {
    setModal(m => ({ ...m, isOpen: false }));
  };

  // Get current user's role in the team (use lowercase for lookup)
  const currentUserRole = team.members[currentUser.email.toLowerCase()]?.role;
  const canManageMembers = currentUserRole === 'owner' || currentUserRole === 'admin';

  useEffect(() => {
    loadPendingInvites();
  }, [team.id]);

  const loadPendingInvites = async () => {
    try {
      setLoading(true);
      const invites = await getTeamPendingInvites(team.id);
      setPendingInvites(invites);
    } catch (err: any) {
      console.error('Failed to load pending invites:', err);
      setError(err.message || 'Failed to load pending invites');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelInvite = (inviteId: string) => {
    showModal('warning', 'Cancel Invitation', 'Are you sure you want to cancel this invitation?', async () => {
      closeModal();
      try {
        await cancelInvitation(inviteId);
        // Refresh the list
        await loadPendingInvites();
        showModal('success', 'Invitation Cancelled', 'The invitation has been cancelled.');
      } catch (err: any) {
        showModal('danger', 'Error', `Failed to cancel invitation: ${err.message}`);
      }
    });
  };

  const handleResendInvite = async (invite: TeamInvitation) => {
    try {
      if (!invite.inviteCode || !invite.role) {
        showModal('warning', 'Invitation Expired', 'Invite code not found. The invitation may have expired.');
        return;
      }

      await resendInvitation(team.id, team.name, invite.memberEmail, invite.inviteCode, invite.role);
      showModal('success', 'Invitation Resent', `Invitation resent to ${invite.memberEmail}`);
    } catch (err: any) {
      showModal('danger', 'Error', `Failed to resend invitation: ${err.message}`);
    }
  };

  const handleRoleChange = async (inviteId: string, newRole: 'admin' | 'leader' | 'member') => {
    try {
      await updateInvitationRole(inviteId, newRole);
      // Refresh the list
      await loadPendingInvites();
    } catch (err: any) {
      showModal('danger', 'Error', `Failed to update role: ${err.message}`);
    }
  };

  const handleReshareContents = (memberEmail: string) => {
    showModal(
      'warning',
      'Re-share Contents',
      `Re-sharing will grant ${memberEmail} access to all existing folders and files, but Google will send them a separate email notification for EACH item. If you have many folders/files, this could spam their inbox with dozens of emails. Continue anyway?`,
      async () => {
        closeModal();
        try {
          setResharingMember(memberEmail);
          await reshareTeamContents(team.id, memberEmail);
          showModal('success', 'Contents Shared', `Successfully shared all team contents with ${memberEmail}. Note: They will receive multiple email notifications from Google Drive.`);
        } catch (err: any) {
          showModal('danger', 'Error', `Failed to re-share contents: ${err.message}`);
        } finally {
          setResharingMember(null);
        }
      }
    );
  };

  const handleRemoveMember = (memberEmail: string) => {
    const member = team.members[memberEmail.toLowerCase()];
    const memberName = member?.displayName || memberEmail;

    showModal(
      'danger',
      'Remove Member',
      `Are you sure you want to remove ${memberName} from the team? This will revoke their access to all team files.`,
      async () => {
        closeModal();
        try {
          setRemovingMember(memberEmail);
          await removeTeamMember(team.id, memberEmail);

          // Show success and refresh (stay on Members tab)
          showModal('success', 'Member Removed', `Successfully removed ${memberName} from the team`, () => {
            closeModal();
            // Trigger parent refresh to update team data (don't close modal)
            if (onMemberRemoved) {
              onMemberRemoved();
            }
          });
        } catch (err: any) {
          showModal('danger', 'Error', `Failed to remove member: ${err.message}`);
        } finally {
          setRemovingMember(null);
        }
      }
    );
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const membersList = Object.values(team.members || {});

  return (
    <div className="modal-overlay">
      <div className="modal-content team-management-modal">
        <div className="modal-header">
          <h2>Team Management</h2>
          <button className="btn-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="tabs">
          <button
            className={`modal-tab ${activeTab === 'members' ? 'active' : ''}`}
            onClick={() => setActiveTab('members')}
          >
            Members ({membersList.length})
          </button>
          <button
            className={`modal-tab ${activeTab === 'invitations' ? 'active' : ''}`}
            onClick={() => setActiveTab('invitations')}
          >
            Pending Invitations ({pendingInvites.length})
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'members' && (
            <div className="members-section">
              {membersList.length === 0 ? (
                <p className="empty-state">No members yet</p>
              ) : (
                <div className="members-list">
                  {membersList.map((member, index) => {
                    // Handle incomplete member data
                    if (!member.email) {
                      return (
                        <div key={`incomplete-${index}`} className="member-item">
                          <div className="member-info">
                            <div className="member-name" style={{ color: '#f59e0b' }}>
                              Incomplete member data
                            </div>
                            <div className="member-email" style={{ color: '#f59e0b' }}>
                              Invalid member entry
                            </div>
                            {member.joinedAt && (
                              <div className="member-meta">
                                Joined {formatDate(member.joinedAt)}
                              </div>
                            )}
                          </div>
                          <div className="member-actions">
                            <span className="role-badge role-member" style={{ background: '#f59e0b', color: 'white' }}>
                              Invalid
                            </span>
                            {canManageMembers && (
                              <button
                                className="btn-danger btn-sm"
                                onClick={() => {
                                  // For invalid entries, we need to find the key
                                  const memberKey = Object.keys(team.members).find(
                                    (key, idx) => idx === index && !team.members[key].email
                                  );
                                  if (memberKey) {
                                    handleRemoveMember(memberKey);
                                  }
                                }}
                                disabled={removingMember !== null}
                                title="Remove invalid entry"
                              >
                                {removingMember === Object.keys(team.members)[index] ? 'Removing...' : 'Remove'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={member.email} className="member-item">
                        <div className="member-info">
                          <div className="member-name">
                            {member.displayName || member.email}
                          </div>
                          <div className="member-email">{member.email}</div>
                          <div className="member-meta">
                            Joined {formatDate(member.joinedAt)}
                          </div>
                        </div>
                        <div className="member-actions">
                          <span className={`role-badge role-${member.role || 'member'}`}>
                            {member.role || 'member'}
                          </span>
                          {member.role !== 'owner' && (
                            <>
                              <button
                                className="btn-secondary btn-sm"
                                onClick={() => handleReshareContents(member.email)}
                                disabled={resharingMember === member.email}
                                title="Grant access to all existing folders and files"
                              >
                                {resharingMember === member.email ? 'Sharing...' : 'Re-share Contents'}
                              </button>
                              {canManageMembers && (
                                <button
                                  className="btn-danger btn-sm"
                                  onClick={() => handleRemoveMember(member.email)}
                                  disabled={removingMember === member.email}
                                  title="Remove member from team"
                                >
                                  {removingMember === member.email ? 'Removing...' : 'Remove'}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'invitations' && (
            <div className="invitations-section">
              {loading ? (
                <p className="loading-state">Loading invitations...</p>
              ) : error ? (
                <p className="error-state">{error}</p>
              ) : pendingInvites.length === 0 ? (
                <div className="empty-state">
                  <p>No pending invitations</p>
                  {onInviteMore && (
                    <button className="btn-primary" onClick={onInviteMore}>
                      Invite Team Members
                    </button>
                  )}
                </div>
              ) : (
                <div className="invitations-list">
                  {pendingInvites.map((invite) => {
                    return (
                      <div key={invite.id} className="invitation-item">
                        <div className="invitation-info">
                          <div className="invitation-email">{invite.memberEmail}</div>
                          <div className="invitation-meta">
                            Invited by {invite.invitedBy} · {formatDate(invite.invitedAt)}
                          </div>
                        </div>
                        <div className="invitation-actions">
                          <select
                            className="role-select"
                            value={invite.role || 'member'}
                            onChange={(e) => handleRoleChange(invite.id, e.target.value as 'admin' | 'leader' | 'member')}
                            title="Change role"
                          >
                            <option value="member">Member</option>
                            <option value="leader">Leader</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button
                            className="btn-secondary btn-small"
                            onClick={() => handleResendInvite(invite)}
                            title="Resend invitation email"
                          >
                            Resend
                          </button>
                          <button
                            className="btn-danger btn-small"
                            onClick={() => handleCancelInvite(invite.id)}
                            title="Cancel invitation"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {onInviteMore && (
            <button className="btn-primary" onClick={onInviteMore}>
              Invite More Members
            </button>
          )}
        </div>
      </div>

      {/* Styled modal for confirmations and messages */}
      <ConfirmModal
        isOpen={modal.isOpen}
        variant={modal.variant}
        title={modal.title}
        message={modal.message}
        onConfirm={modal.onConfirm}
        onCancel={closeModal}
      />
    </div>
  );
}
