import { useState, useEffect } from 'react';
import { Team, TeamInvitation, getTeamPendingInvites, cancelInvitation, resendInvitation, updateInvitationRole, reshareTeamContents } from '../../services/teamService';
import './TeamManagementModal.css';

interface TeamManagementModalProps {
  team: Team;
  onClose: () => void;
  onInviteMore?: () => void;
}

export default function TeamManagementModal({ team, onClose, onInviteMore }: TeamManagementModalProps) {
  const [pendingInvites, setPendingInvites] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');
  const [resharingMember, setResharingMember] = useState<string | null>(null);

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

  const handleCancelInvite = async (inviteId: string) => {
    if (!confirm('Are you sure you want to cancel this invitation?')) {
      return;
    }

    try {
      await cancelInvitation(inviteId);
      // Refresh the list
      await loadPendingInvites();
    } catch (err: any) {
      alert(`Failed to cancel invitation: ${err.message}`);
    }
  };

  const handleResendInvite = async (invite: TeamInvitation) => {
    try {
      if (!invite.inviteCode || !invite.role) {
        alert('Invite code not found. The invitation may have expired.');
        return;
      }

      await resendInvitation(team.id, team.name, invite.memberEmail, invite.inviteCode, invite.role);
      alert(`Invitation resent to ${invite.memberEmail}`);
    } catch (err: any) {
      alert(`Failed to resend invitation: ${err.message}`);
    }
  };

  const handleRoleChange = async (inviteId: string, newRole: 'admin' | 'leader' | 'member') => {
    try {
      await updateInvitationRole(inviteId, newRole);
      // Refresh the list
      await loadPendingInvites();
    } catch (err: any) {
      alert(`Failed to update role: ${err.message}`);
    }
  };

  const handleReshareContents = async (memberEmail: string) => {
    if (!confirm(`⚠️ WARNING: Email Notifications\n\nRe-sharing will grant ${memberEmail} access to all existing folders and files, but Google will send them a separate email notification for EACH item.\n\nIf you have many folders/files, this could spam their inbox with dozens of emails.\n\nContinue anyway?`)) {
      return;
    }

    try {
      setResharingMember(memberEmail);
      await reshareTeamContents(team.id, memberEmail);
      alert(`✅ Successfully shared all team contents with ${memberEmail}\n\nNote: They will receive multiple email notifications from Google Drive.`);
    } catch (err: any) {
      alert(`Failed to re-share contents: ${err.message}`);
    } finally {
      setResharingMember(null);
    }
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
            className={`tab ${activeTab === 'members' ? 'active' : ''}`}
            onClick={() => setActiveTab('members')}
          >
            Members ({membersList.length})
          </button>
          <button
            className={`tab ${activeTab === 'invitations' ? 'active' : ''}`}
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
                              Please re-invite this member
                            </div>
                            {member.joinedAt && (
                              <div className="member-meta">
                                Joined {formatDate(member.joinedAt)}
                              </div>
                            )}
                          </div>
                          <div className="member-role">
                            <span className="role-badge role-member" style={{ background: '#f59e0b', color: 'white' }}>
                              Invalid
                            </span>
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
                            <button
                              className="btn-secondary btn-sm"
                              onClick={() => handleReshareContents(member.email)}
                              disabled={resharingMember === member.email}
                              title="Grant access to all existing folders and files"
                            >
                              {resharingMember === member.email ? 'Sharing...' : 'Re-share Contents'}
                            </button>
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
    </div>
  );
}
