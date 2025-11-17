import React, { useState, useEffect } from 'react';
import { X, Shield, Star, User, Trash2, Edit2, Crown, Clock } from 'lucide-react';
import {
  getWorkspaceMembers,
  WorkspaceMember,
  WorkspaceRole,
  updateMemberRole,
  removeMemberFromWorkspace,
  Workspace,
  getPendingInvitations,
  Invitation
} from '../../services/workspaceService';
import { useAuth } from '../../contexts/AuthContext';
import './AdminDashboard.css'; // Reuse the same styles

interface LeaderDashboardProps {
  workspace: Workspace;
  onClose: () => void;
}

const LeaderDashboard: React.FC<LeaderDashboardProps> = ({ workspace, onClose }) => {
  const { user } = useAuth();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleChangeRole = async (member: WorkspaceMember, newRole: WorkspaceRole) => {
    if (!user) return;

    // Leaders can only promote members to leader
    if (newRole === 'admin') {
      setError('Leaders cannot promote users to admin');
      return;
    }

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

    // Leaders can only remove members
    if (member.role !== 'member') {
      setError('Leaders can only remove members');
      return;
    }

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

  // Filter: Leaders can only manage members
  const manageableMembers = members.filter(m => m.role === 'member');
  const otherMembers = members.filter(m => m.role !== 'member');

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
            <Star size={24} />
            <div>
              <h2>Leader Dashboard</h2>
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
            <div className="stat-card">
              <div className="stat-value">{pendingInvitations.length}</div>
              <div className="stat-label">Pending Invites</div>
            </div>
          </div>

          {/* Info Banner */}
          <div className="info-banner">
            <Shield size={16} />
            <span>
              As a Leader, you can manage Members (promote to Leader or remove). You cannot
              manage other Leaders or Admins.
            </span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="error-message">
              {error}
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}

          {/* Pending Invitations - Read Only for Leaders */}
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
                {sortedMembers.map(member => {
                  const canManage = member.role === 'member' && user?.uid !== member.uid;

                  return (
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

                      {canManage && (
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
                  );
                })}
              </div>
            )}
          </div>
        </div>

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
                  className="role-option disabled"
                  disabled
                  title="Leaders cannot promote to Admin"
                >
                  <Crown size={20} />
                  <div>
                    <div className="role-title">Admin</div>
                    <div className="role-desc">Requires Admin permission</div>
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

export default LeaderDashboard;
