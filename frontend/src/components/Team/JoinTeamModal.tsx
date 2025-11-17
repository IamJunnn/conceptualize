import { useState } from 'react';
import { User } from '../../services/authServiceTauri';
import { joinTeamWithCode } from '../../services/teamService';
import './JoinTeamModal.css';

interface JoinTeamModalProps {
  user: User;
  onClose: () => void;
  onTeamJoined: () => void;
}

export default function JoinTeamModal({ user, onClose, onTeamJoined }: JoinTeamModalProps) {
  const [inviteCode, setInviteCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate
    if (!inviteCode.trim()) {
      setError('Please enter an invite code');
      return;
    }

    if (inviteCode.trim().length !== 6) {
      setError('Invite code must be 6 characters');
      return;
    }

    // Join team
    try {
      setIsJoining(true);
      const team = await joinTeamWithCode(
        inviteCode.trim().toUpperCase(),
        user.email,
        user.displayName || user.email.split('@')[0]
      );

      console.log(`✅ Successfully joined team: ${team.name}`);
      onTeamJoined();
      onClose();
    } catch (err: any) {
      console.error('Failed to join team:', err);
      setError(err.message || 'Failed to join team. Please check your invite code and try again.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content join-team-modal">
        <h2>Join Existing Team</h2>

        <div className="join-team-info">
          <p>Enter the invite code provided by your team admin to join.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="inviteCode">Invite Code *</label>
            <input
              id="inviteCode"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              disabled={isJoining}
              autoFocus
              className="invite-code-input"
            />
            <div className="input-hint">6-character code (case-insensitive)</div>
          </div>

          <div className="info-box">
            <strong>What happens next?</strong>
            <ul>
              <li>You'll be added to the team with your assigned role</li>
              <li>You'll get access to all team notes and folders</li>
              <li>The invite code can only be used once</li>
            </ul>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isJoining}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isJoining || !inviteCode.trim()}
            >
              {isJoining ? 'Joining...' : 'Join Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
