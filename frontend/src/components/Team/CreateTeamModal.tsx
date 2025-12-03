import { useState } from 'react';
import { User } from '../../services/authServiceTauri';
import { createTeam, inviteTeamMember, sendInvitationEmails } from '../../services/teamService';
import { useAuth } from '../../contexts/AuthContext';
import './CreateTeamModal.css';

interface CreateTeamModalProps {
  user: User;
  onClose: () => void;
  onTeamCreated: () => void;
  onSwitchToJoin?: () => void;
}

interface TeamMember {
  email: string;
  role: 'admin' | 'leader' | 'member';
}

export default function CreateTeamModal({ user, onClose, onTeamCreated, onSwitchToJoin }: CreateTeamModalProps) {
  const { refreshUser } = useAuth();
  const [teamName, setTeamName] = useState('');
  const [members, setMembers] = useState<TeamMember[]>([{ email: '', role: 'member' }]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddMember = () => {
    setMembers([...members, { email: '', role: 'member' }]);
  };

  const handleRemoveMember = (index: number) => {
    const newMembers = members.filter((_, i) => i !== index);
    setMembers(newMembers.length === 0 ? [{ email: '', role: 'member' }] : newMembers);
  };

  const handleMemberChange = (index: number, field: 'email' | 'role', value: string) => {
    const newMembers = [...members];
    newMembers[index] = { ...newMembers[index], [field]: value as any };
    setMembers(newMembers);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate
    if (!teamName.trim()) {
      setError('Team name is required');
      return;
    }

    // Create team
    try {
      setIsCreating(true);
      const team = await createTeam(
        teamName.trim(),
        '', // No description
        user.email,
        user.displayName || user.email.split('@')[0],
        user.uid
      );

      console.log('✅ Team created successfully!');

      // Invite members and send emails
      const validMembers = members.filter(m => m.email.trim() !== '');
      if (validMembers.length > 0) {
        // Create pending invitations for each member
        for (const member of validMembers) {
          await inviteTeamMember(
            team.id,
            member.email.trim(),
            user.email,
            user.displayName || user.email.split('@')[0],
            member.role
          );
        }

        // Send invitation emails
        await sendInvitationEmails(
          teamName.trim(),
          validMembers.map(m => ({
            email: m.email.trim(),
            role: m.role
          }))
        );

        console.log(`✅ Sent invitations to ${validMembers.length} members`);
      }

      // Refresh user data to show updated role (should be 'admin' now)
      await refreshUser();
      onTeamCreated();
      onClose();
    } catch (err: any) {
      console.error('Failed to create team:', err);
      setError(err.message || 'Failed to create team. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content create-team-modal">
        <h2>Create New Team</h2>

        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <label htmlFor="teamName">Team Name *</label>
            <input
              id="teamName"
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Marketing Team, Engineering, etc."
              maxLength={50}
              disabled={isCreating}
              autoFocus
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label>Invite Team Members (optional)</label>
            <div className="members-list">
              {members.map((member, index) => (
                <div key={index} className="member-row">
                  <input
                    type="text"
                    placeholder="email@example.com"
                    value={member.email}
                    onChange={(e) => handleMemberChange(index, 'email', e.target.value)}
                    disabled={isCreating}
                    className="member-email-input"
                    autoComplete="chrome-off"
                    name={`member-email-${index}`}
                  />
                  <select
                    value={member.role}
                    onChange={(e) => handleMemberChange(index, 'role', e.target.value)}
                    disabled={isCreating}
                    className="member-role-select"
                  >
                    <option value="admin">Admin</option>
                    <option value="leader">Leader</option>
                    <option value="member">Member</option>
                  </select>
                  {members.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(index)}
                      disabled={isCreating}
                      className="btn-remove-member"
                      aria-label="Remove member"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddMember}
                disabled={isCreating}
                className="btn-add-member"
              >
                + Add More
              </button>
            </div>
          </div>

          <div className="info-box">
            <strong>What happens next?</strong>
            <ul>
              <li>A folder will be created in your Google Drive</li>
              <li>Invited members will get email notifications</li>
              <li>All team notes will be synced to this folder</li>
            </ul>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isCreating || !teamName.trim()}
            >
              {isCreating ? 'Creating...' : 'Create Team'}
            </button>
          </div>

          {onSwitchToJoin && (
            <div className="modal-footer-link">
              <p>
                Want to join an existing team?{' '}
                <button
                  type="button"
                  className="link-button"
                  onClick={onSwitchToJoin}
                  disabled={isCreating}
                >
                  Join a team
                </button>
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
