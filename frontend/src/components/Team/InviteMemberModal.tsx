import { useState } from 'react';
import { User } from '../../services/authServiceTauri';
import { Team, inviteTeamMember } from '../../services/teamService';
import './InviteMemberModal.css';

interface InviteMemberModalProps {
  team: Team;
  user: User;
  onClose: () => void;
  onMemberInvited: () => void;
}

export default function InviteMemberModal({ team, user, onClose, onMemberInvited }: InviteMemberModalProps) {
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'admin' | 'leader' | 'member'>('member');
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validate email
    if (!memberEmail.trim()) {
      setError('Email is required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(memberEmail.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    // Check if user is trying to invite themselves
    if (memberEmail.trim().toLowerCase() === user.email.toLowerCase()) {
      setError("You can't invite yourself");
      return;
    }

    // Check if user is already a member
    if (team.memberEmails.includes(memberEmail.trim().toLowerCase())) {
      setError('This user is already a member of this team');
      return;
    }

    try {
      setIsInviting(true);

      await inviteTeamMember(
        team.id,
        memberEmail.trim().toLowerCase(),
        user.email,
        user.displayName || user.email.split('@')[0],
        memberRole
      );

      setSuccess(`Invitation sent to ${memberEmail}!`);
      setMemberEmail('');

      // Refresh team data
      setTimeout(() => {
        onMemberInvited();
        onClose();
      }, 1500);

    } catch (err: any) {
      console.error('Failed to invite member:', err);
      setError(err.message || 'Failed to invite member. Please try again.');
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content invite-member-modal">
        <h2>Invite Team Member</h2>
        <p className="modal-subtitle">Add a collaborator to "{team.name}"</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="memberEmail">Email Address *</label>
            <input
              id="memberEmail"
              type="email"
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              placeholder="colleague@example.com"
              disabled={isInviting}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="memberRole">Role *</label>
            <select
              id="memberRole"
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value as 'admin' | 'leader' | 'member')}
              disabled={isInviting}
            >
              <option value="member">Member - Can view and edit notes</option>
              <option value="leader">Leader - Can manage content and guide team</option>
              <option value="admin">Admin - Full team management access</option>
            </select>
          </div>

          <div className="info-box">
            <strong>What happens next?</strong>
            <ul>
              <li>An invitation will be sent via the app</li>
              <li>The team folder will be shared in Google Drive</li>
              <li>They'll receive an email from Google about the shared folder</li>
              <li>Once they accept, they can view and edit team notes</li>
            </ul>
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isInviting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isInviting || !memberEmail.trim()}
            >
              {isInviting ? 'Sending Invite...' : 'Send Invite'}
            </button>
          </div>
        </form>

        {/* Current Members */}
        <div className="current-members">
          <h3>Current Members ({Object.keys(team.members).length})</h3>
          <div className="members-list">
            {Object.values(team.members).map((member) => (
              <div key={member.email} className="member-item">
                <div className="member-avatar">
                  {(member.displayName || member.email)[0].toUpperCase()}
                </div>
                <div className="member-info">
                  <div className="member-name">
                    {member.displayName || member.email.split('@')[0]}
                  </div>
                  <div className="member-email">{member.email}</div>
                </div>
                <div className={`member-role role-${member.role}`}>
                  {member.role}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
