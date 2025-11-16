import { useState } from 'react';
import { User } from '../../services/authServiceTauri';
import { createTeam } from '../../services/teamService';
import { hasDriverAccess } from '../../services/googleDriveService';
import './CreateTeamModal.css';

interface CreateTeamModalProps {
  user: User;
  onClose: () => void;
  onTeamCreated: () => void;
}

export default function CreateTeamModal({ user, onClose, onTeamCreated }: CreateTeamModalProps) {
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDriveConnect, setShowDriveConnect] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate
    if (!teamName.trim()) {
      setError('Team name is required');
      return;
    }

    // Create team using service account (no user Drive access needed)
    try {
      setIsCreating(true);
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

        <form onSubmit={handleSubmit}>
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
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description (optional)</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this team for?"
              rows={3}
              maxLength={200}
              disabled={isCreating}
            />
          </div>

          <div className="info-box">
            <strong>What happens next?</strong>
            <ul>
              <li>A folder will be created in your Google Drive</li>
              <li>You can invite team members to collaborate</li>
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
        </form>
      </div>
    </div>
  );
}
