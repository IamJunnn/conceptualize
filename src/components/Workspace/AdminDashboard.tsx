import React, { useState, useEffect } from 'react';
import { X, UserPlus, Shield, Star, User, Trash2, Edit2, Crown, Clock, RefreshCw, Send } from 'lucide-react';
import {
  getWorkspaceMembers,
  WorkspaceMember,
  WorkspaceRole,
  updateMemberRole,
  removeMemberFromWorkspace,
  createInvitation,
  Workspace,
  getPendingInvitations,
  cancelInvitation,
  resendInvitation,
  Invitation
} from '../../services/workspaceService';
import { sendInvitationEmail } from '../../services/emailService';
import { useAuth } from '../../contexts/AuthContext';
import InviteMembersModal from './InviteMembersModal';
import './AdminDashboard.css';

interface AdminDashboardProps {
  workspace: Workspace;
  onClose: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ workspace, onClose }) => {
  const { user } = useAuth();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendingInvite, setResendingInvite] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [workspace.id]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Load both members and pending invitations in parallel
      const [workspaceMembers, invitations] = await Promise.all([
        getWorkspaceMembers(workspace.id),
        getPendingInvitations(workspace.id)
      ]);
      setMembers(workspaceMembers);
      setPendingInvitations(invitations);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = loadData; // Keep for compatibility

  const handleInvite = async (email: string, role: WorkspaceRole) => {
    if (!user) return;

    try {
      // Create invitation
      const invitation = await createInvitation(
        workspace.id,
        email,
        role,
        user.uid,
        user.displayName
      );

      // Send email
      await sendInvitationEmail(invitation);

      // Refresh members list
      await loadMembers();
    } catch (err: any) {
      throw new Error(err.message);
    }
  };

  const handleChangeRole = async (member: WorkspaceMember, newRole: WorkspaceRole) => {
    if (!user) return;

    try {
      await updateMemberRole(workspace.id, member.uid, newRole, user.uid);
      setShowRoleModal(false);
      setSelectedMember(null);
      await loadMembers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRemoveMember = async (member: WorkspaceMember) => {
    if (!user) return;

    const confirmed = confirm(
      `Are you sure you want to remove ${member.displayName} from the workspace?`
    );

    if (!confirmed) return;

    try {
      await removeMemberFromWorkspace(workspace.id, member.uid, user.uid);
      await loadMembers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCancelInvitation = async (invitation: Invitation) => {
    if (!user) return;

    const confirmed = confirm(
      `Are you sure you want to cancel the invitation to ${invitation.email}?`
    );

    if (!confirmed) return;

    try {
      await cancelInvitation(invitation.id, user.uid);
      await loadData(); // Reload to update the list
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResendInvitation = async (invitation: Invitation) => {
    if (!user) return;

    try {
      setResendingInvite(invitation.id);
      const updatedInvitation = await resendInvitation(invitation.id, user.uid);
      await sendInvitationEmail(updatedInvitation);

      // Show success message
      setError(null); // Clear any previous errors
      alert(`Invitation resent to ${invitation.email}`);

      await loadData(); // Reload to update the list
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResendingInvite(null);
    }
  };

  const getRoleIcon = (role: WorkspaceRole) => {
    switch (role) {
      case 'admin':
        return <Crown size={16} />;
      case 'leader':
        return <Star size={16} />;
      case 'member':
        return <User size={16} />;
    }
  };

  const getRoleBadgeClass = (role: WorkspaceRole) => {
    switch (role) {
      case 'admin':
        return 'role-badge admin';
      case 'leader':
        return 'role-badge leader';
      case 'member':
        return 'role-badge member';
    }
  };

  // Sort members: admins first, then leaders, then members
  const sortedMembers = [...members].sort((a, b) => {
    const roleOrder = { admin: 0, leader: 1, member: 2 };
    return roleOrder[a.role] - roleOrder[b.role];
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="admin-dashboard" onClick={(e) => e.stopPropagation()}>
        <div className="dashboard-header">
          <div className="header-content">
            <Shield size={24} />
            <div>
              <h2>Admin Dashboard</h2>
              <p className="workspace-name">{workspace.name}</p>
            </div>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close">
            <X size={24} />
          </button>
        </div>

        <div className="dashboard-content">
          {/* Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{members.length}</div>
              <div className="stat-label">Total Members</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {pendingInvitations.length}
              </div>
              <div className="stat-label">Pending Invites</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {members.filter(m => m.role === 'admin').length}
              </div>
              <div className="stat-label">Admins</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {members.filter(m => m.role === 'leader').length}
              </div>
              <div className="stat-label">Leaders</div>
            </div>
          </div>

          {/* Invite Button */}
          <div className="action-bar">
            <button
              className="primary-button invite-button"
              onClick={() => setShowInviteModal(true)}
            >
              <UserPlus size={18} />
              Invite Members
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="error-message">
              {error}
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}

          {/* Pending Invitations */}
          {pendingInvitations.length > 0 && (
            <div className="members-section" style={{ marginBottom: '32px' }}>
              <h3>Pending Invitations ({pendingInvitations.length})</h3>
              <div className="members-list">
                {pendingInvitations.map(invitation => (
                  <div key={invitation.id} className="member-card" style={{ opacity: 0.8 }}>
                    <div className="member-avatar" style={{ background: 'linear-gradient(135deg, #808080 0%, #606060 100%)' }}>
                      <Clock size={20} />
                    </div>

                    <div className="member-info">
                      <div className="member-name">
                        {invitation.email}
                        <span className="you-badge" style={{ background: '#808080' }}>Pending</span>
                      </div>
                      <div className="member-email">
                        Invited by {invitation.invitedByName}
                      </div>
                      <div className="member-meta">
                        Invited {new Date(invitation.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="member-actions invitation-actions">
                      <button
                        className="action-button-text"
                        onClick={() => handleResendInvitation(invitation)}
                        disabled={resendingInvite === invitation.id}
                      >
                        {resendingInvite === invitation.id ? (
                          <>
                            <RefreshCw size={14} className="spinning" />
                            <span>Sending...</span>
                          </>
                        ) : (
                          <>
                            <Send size={14} />
                            <span>Resend</span>
                          </>
                        )}
                      </button>
                      <button
                        className="action-button-text danger"
                        onClick={() => handleCancelInvitation(invitation)}
                      >
                        <X size={14} />
                        <span>Cancel</span>
                      </button>
                    </div>

                    <div className={getRoleBadgeClass(invitation.role)}>
                      {getRoleIcon(invitation.role)}
                      <span>{invitation.role}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Members List */}
          <div className="members-section">
            <h3>Team Members</h3>

            {loading ? (
              <div className="loading-state">Loading members...</div>
            ) : (
              <div className="members-list">
                {sortedMembers.map(member => (
                  <div key={member.uid} className="member-card">
                    <div className="member-avatar">
                      {member.displayName.charAt(0).toUpperCase()}
                    </div>

                    <div className="member-info">
                      <div className="member-name">
                        {member.displayName}
                        {user?.uid === member.uid && (
                          <span className="you-badge">You</span>
                        )}
                      </div>
                      <div className="member-email">{member.email}</div>
                      <div className="member-meta">
                        Joined {new Date(member.joinedAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div className={getRoleBadgeClass(member.role)}>
                      {getRoleIcon(member.role)}
                      <span>{member.role}</span>
                    </div>

                    {user?.uid !== member.uid && (
                      <div className="member-actions">
                        <button
                          className="action-button"
                          onClick={() => {
                            setSelectedMember(member);
                            setShowRoleModal(true);
                          }}
                          title="Change role"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          className="action-button danger"
                          onClick={() => handleRemoveMember(member)}
                          title="Remove member"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Invite Modal */}
        {showInviteModal && (
          <InviteMembersModal
            workspaceId={workspace.id}
            workspaceName={workspace.name}
            onClose={() => setShowInviteModal(false)}
            onInvite={handleInvite}
          />
        )}

        {/* Change Role Modal */}
        {showRoleModal && selectedMember && (
          <div className="modal-overlay" onClick={() => setShowRoleModal(false)}>
            <div className="role-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Change Role</h3>
              <p>
                Change role for <strong>{selectedMember.displayName}</strong>
              </p>

              <div className="role-options">
                <button
                  className={`role-option ${selectedMember.role === 'member' ? 'active' : ''}`}
                  onClick={() => handleChangeRole(selectedMember, 'member')}
                >
                  <User size={20} />
                  <div>
                    <div className="role-title">Member</div>
                    <div className="role-desc">View and edit notes</div>
                  </div>
                </button>

                <button
                  className={`role-option ${selectedMember.role === 'leader' ? 'active' : ''}`}
                  onClick={() => handleChangeRole(selectedMember, 'leader')}
                >
                  <Star size={20} />
                  <div>
                    <div className="role-title">Leader</div>
                    <div className="role-desc">Manage members</div>
                  </div>
                </button>

                <button
                  className={`role-option ${selectedMember.role === 'admin' ? 'active' : ''}`}
                  onClick={() => handleChangeRole(selectedMember, 'admin')}
                >
                  <Crown size={20} />
                  <div>
                    <div className="role-title">Admin</div>
                    <div className="role-desc">Full control</div>
                  </div>
                </button>
              </div>

              <div className="modal-actions">
                <button
                  className="secondary-button"
                  onClick={() => {
                    setShowRoleModal(false);
                    setSelectedMember(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
