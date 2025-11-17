import { useState, useEffect } from 'react';
import { Team, TeamInvitation, getTeamPendingInvites, cancelInvitation, resendInvitation } from '../../services/teamService';
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
      // Get the invite code from team's inviteCodes
      const inviteCode = Object.entries(team.inviteCodes || {}).find(
        ([_, data]) => data.email === invite.memberEmail && !data.used
      )?.[0];

      if (!inviteCode) {
        alert('Invite code not found. The invitation may have expired.');
        return;
      }

      const inviteData = team.inviteCodes![inviteCode];
      await resendInvitation(team.id, team.name, invite.memberEmail, inviteCode, inviteData.role);
      alert(`Invitation resent to ${invite.memberEmail}`);
    } catch (err: any) {
      alert(`Failed to resend invitation: ${err.message}`);
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

        <div className="team-info">
          <h3>{team.name}</h3>
          {team.description && <p className="team-description">{team.description}</p>}
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
                  {membersList.map((member) => (
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
                      <div className="member-role">
                        <span className={`role-badge role-${member.role}`}>
                          {member.role}
                        </span>
                      </div>
                    </div>
                  ))}
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
                    // Find the invite code for this email
                    const inviteCode = Object.entries(team.inviteCodes || {}).find(
                      ([_, data]) => data.email === invite.memberEmail && !data.used
                    )?.[0];
                    const inviteData = inviteCode ? team.inviteCodes![inviteCode] : null;

                    return (
                      <div key={invite.id} className="invitation-item">
                        <div className="invitation-info">
                          <div className="invitation-email">{invite.memberEmail}</div>
                          <div className="invitation-meta">
                            Invited by {invite.invitedBy} · {formatDate(invite.invitedAt)}
                          </div>
                          {inviteCode && (
                            <div className="invitation-code">
                              Code: <span className="code-value">{inviteCode}</span>
                              <button
                                className="btn-copy-code"
                                onClick={() => {
                                  navigator.clipboard.writeText(inviteCode);
                                }}
                                title="Copy code"
                              >
                                Copy
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="invitation-actions">
                          {inviteData && (
                            <span className={`role-badge role-${inviteData.role}`}>
                              {inviteData.role}
                            </span>
                          )}
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
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
