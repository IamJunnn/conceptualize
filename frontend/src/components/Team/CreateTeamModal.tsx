import { useState } from 'react';
import { User } from '../../services/authServiceTauri';
import { createTeam, createInviteCodesAndSendEmails } from '../../services/teamService';
import { hasDriverAccess } from '../../services/googleDriveService';
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
  const [showDriveConnect, setShowDriveConnect] = useState(false);
  const [showInviteCodes, setShowInviteCodes] = useState(false);
  const [inviteCodes, setInviteCodes] = useState<{ [email: string]: string }>({});

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

      // Create invite codes for members and send emails
      const validMembers = members.filter(m => m.email.trim() !== '');
      if (validMembers.length > 0) {
        const codes = await createInviteCodesAndSendEmails(
          team.id,
          teamName.trim(),
          validMembers.map(m => ({
            email: m.email.trim(),
            role: m.role
          }))
        );

        console.log(`✅ Generated ${Object.keys(codes).length} invite codes and sent emails`);

        // Show invite codes to user
        setInviteCodes(codes);
        setShowInviteCodes(true);
      } else {
        // No members to invite, just close
        // Refresh user data to show updated role (should be 'admin' now)
        await refreshUser();
        onTeamCreated();
        onClose();
      }

      // Refresh user data to show updated role (should be 'admin' now)
      await refreshUser();
    } catch (err: any) {
      console.error('Failed to create team:', err);
      setError(err.message || 'Failed to create team. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleConnectDrive = async () => {
    try {
      setIsCreating(true);
      setError(null);

      // Import the signInWithGoogle function dynamically to trigger OAuth
      const { signInWithGoogle } = await import('../../services/authServiceTauri');

      // This will open Google OAuth in browser, which already includes Drive scope
      // The user will be prompted to grant Drive permissions
      await signInWithGoogle();

      // After successful OAuth, tokens are stored in localStorage
      // Close the drive connect dialog and retry creating team
      setShowDriveConnect(false);

      // Automatically retry team creation
      if (teamName.trim()) {
        await createTeam(
          teamName.trim(),
          description.trim(),
          user.email,
          user.displayName || user.email.split('@')[0],
          user.uid
        );

        console.log('✅ Team created successfully!');
        onTeamCreated();
        onClose();
      }
    } catch (err: any) {
      console.error('Failed to connect Google Drive:', err);
      setError(err.message || 'Failed to connect Google Drive. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  // Show invite codes modal after team creation
  if (showInviteCodes) {
    return (
      <div className="modal-overlay">
        <div className="modal-content invite-codes-modal">
          <h2>Team Created Successfully!</h2>

          <div className="invite-codes-info">
            <p>Share these invite codes with your team members:</p>
          </div>

          <div className="invite-codes-list">
            {Object.entries(inviteCodes).map(([email, code]) => (
              <div key={email} className="invite-code-row">
                <div className="invite-code-email">{email}</div>
                <div className="invite-code-code">
                  <span className="code-value">{code}</span>
                  <button
                    className="btn-copy-code"
                    onClick={() => {
                      navigator.clipboard.writeText(code);
                    }}
                    title="Copy code"
                  >
                    Copy
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="info-box">
            <strong>Next Steps:</strong>
            <ul>
              <li>Share these codes with the invited members</li>
              <li>They can join by clicking "Join Existing Team"</li>
              <li>Each code can only be used once</li>
            </ul>
          </div>

          <div className="modal-actions">
            <button
              className="btn-primary"
              onClick={() => {
                onTeamCreated();
                onClose();
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showDriveConnect) {
    return (
      <div className="modal-overlay">
        <div className="modal-content connect-drive-modal">
          <h2>Connect Your Google Drive</h2>

          <div className="drive-connect-info">
            <p>To create teams and sync notes, you need to connect your Google Drive account.</p>
            <p>We'll create a team folder in your Drive that you can share with team members.</p>
          </div>

          <div className="drive-permissions">
            <h3>Permissions Required:</h3>
            <ul>
              <li>Create folders in your Google Drive</li>
              <li>Upload and download files</li>
              <li>Share folders with team members</li>
            </ul>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button
              className="btn-secondary"
              onClick={onClose}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleConnectDrive}
              disabled={isCreating}
            >
              Connect Google Drive
            </button>
          </div>
        </div>
      </div>
    );
  }

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
                Already have an invite code?{' '}
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
