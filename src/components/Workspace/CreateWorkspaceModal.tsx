import React, { useState } from 'react';
import { X } from 'lucide-react';
import './CreateWorkspaceModal.css';

interface CreateWorkspaceModalProps {
  onClose: () => void;
  onCreate: (workspaceName: string) => Promise<void>;
}

const CreateWorkspaceModal: React.FC<CreateWorkspaceModalProps> = ({ onClose, onCreate }) => {
  const [workspaceName, setWorkspaceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!workspaceName.trim()) {
      setError('Please enter a workspace name');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      await onCreate(workspaceName.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create workspace');
      setIsCreating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="create-workspace-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Your Workspace</h2>
          <button className="close-button" onClick={onClose} aria-label="Close">
            <X size={24} />
          </button>
        </div>

        <div className="modal-content">
          <p className="modal-description">
            Welcome! Let's set up your team workspace. You'll be the admin and can invite team members after creation.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="workspace-name">Workspace Name</label>
              <input
                id="workspace-name"
                type="text"
                placeholder="e.g., Your Team Name"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                disabled={isCreating}
                autoFocus
                maxLength={100}
              />
              <span className="input-hint">
                Choose a name that represents your team or organization
              </span>
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={isCreating || !workspaceName.trim()}
              >
                {isCreating ? 'Creating...' : 'Create Workspace'}
              </button>
            </div>
          </form>

          <div className="info-box">
            <h4>What happens next?</h4>
            <ul>
              <li>You'll become the workspace admin</li>
              <li>You can invite team members via email</li>
              <li>You can assign roles: Admin, Leader, or Member</li>
              <li>Team members will receive an email invitation</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateWorkspaceModal;
