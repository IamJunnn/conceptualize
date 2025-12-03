import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Folder, FolderOpen } from 'lucide-react';
import './CreateLocalWorkspaceModal.css';

interface CreateLocalWorkspaceModalProps {
  onClose: () => void;
  onCreate: (path: string, workspaceName: string) => void;
}

const CreateLocalWorkspaceModal: React.FC<CreateLocalWorkspaceModalProps> = ({ onClose, onCreate }) => {
  const [workspaceName, setWorkspaceName] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChooseFolder = async () => {
    try {
      const selectedPath = await invoke<string | null>('select_folder');
      if (selectedPath) {
        setSelectedFolder(selectedPath);
        setError(null);
      }
    } catch (err) {
      console.error('Error selecting folder:', err);
      setError('Failed to select folder');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!workspaceName.trim()) {
      setError('Please enter a workspace name');
      return;
    }

    if (!selectedFolder) {
      setError('Please choose a folder location');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Create the workspace folder path: selectedFolder/Conceptualize - workspaceName
      const sanitizedName = workspaceName.trim().replace(/[<>:"/\\|?*]/g, '-');
      const workspaceFolderName = `Conceptualize - ${sanitizedName}`;

      // Create the folder via Tauri (using parent_path and folder_name)
      const result = await invoke<{ success: boolean; path: string | null; error: string | null }>(
        'create_folder',
        { parentPath: selectedFolder, folderName: workspaceFolderName }
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to create folder');
      }

      const workspacePath = result.path!;

      // Save as root folder
      await invoke('save_root_folder', { folderPath: workspacePath });

      onCreate(workspacePath, workspaceName.trim());
    } catch (err: any) {
      console.error('Error creating workspace:', err);
      setError(err.message || 'Failed to create workspace');
      setIsCreating(false);
    }
  };

  const getDisplayPath = (path: string) => {
    // Show a truncated path if too long
    if (path.length > 45) {
      return '...' + path.slice(-42);
    }
    return path;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="create-local-workspace-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Your Workspace</h2>
          <button className="close-button" onClick={onClose} aria-label="Close">
            <X size={24} />
          </button>
        </div>

        <div className="modal-content">
          <p className="modal-description">
            Set up your local workspace to store all your notes securely on your device.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="workspace-name">Workspace Name</label>
              <input
                id="workspace-name"
                type="text"
                placeholder="e.g., My Notes, Research, Projects"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                disabled={isCreating}
                autoFocus
                maxLength={100}
              />
              <span className="input-hint">
                A folder will be created: <strong>Conceptualize - {workspaceName || '[Name]'}</strong>
              </span>
            </div>

            <div className="form-group">
              <label>Location</label>
              <button
                type="button"
                className="folder-selector"
                onClick={handleChooseFolder}
                disabled={isCreating}
              >
                {selectedFolder ? (
                  <>
                    <FolderOpen size={20} className="folder-icon" />
                    <span className="folder-path">{getDisplayPath(selectedFolder)}</span>
                  </>
                ) : (
                  <>
                    <Folder size={20} className="folder-icon" />
                    <span className="folder-placeholder">Choose folder location...</span>
                  </>
                )}
              </button>
              <span className="input-hint">
                Select where you want to create your workspace folder
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
                disabled={isCreating || !workspaceName.trim() || !selectedFolder}
              >
                {isCreating ? 'Creating...' : 'Create Workspace'}
              </button>
            </div>
          </form>

          <div className="info-box">
            <h4>What happens next?</h4>
            <ul>
              <li>A new folder will be created at your chosen location</li>
              <li>All your notes will be stored as markdown files</li>
              <li>Your data stays private and local to your device</li>
              <li>You can access your notes anytime, even offline</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateLocalWorkspaceModal;
