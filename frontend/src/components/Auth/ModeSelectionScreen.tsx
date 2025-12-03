import React, { useState } from 'react';
import SimpleTitleBar from '../UI/SimpleTitleBar';
import CreateLocalWorkspaceModal from '../Workspace/CreateLocalWorkspaceModal';
import './ModeSelectionScreen.css';

interface ModeSelectionScreenProps {
  onModeSelected: (mode: 'local' | 'team') => void;
  onLocalWorkspaceCreated?: (path: string, name: string) => void;
}

const ModeSelectionScreen: React.FC<ModeSelectionScreenProps> = ({ onModeSelected, onLocalWorkspaceCreated }) => {
  const [showLocalWorkspaceModal, setShowLocalWorkspaceModal] = useState(false);

  const handleLocalClick = () => {
    setShowLocalWorkspaceModal(true);
  };

  const handleLocalWorkspaceCreate = (path: string, name: string) => {
    setShowLocalWorkspaceModal(false);
    if (onLocalWorkspaceCreated) {
      onLocalWorkspaceCreated(path, name);
    }
    onModeSelected('local');
  };

  return (
    <div className="mode-selection-screen">
      <SimpleTitleBar />
      <div className="mode-selection-container">
        <div className="mode-header">
          <img src="/logo.svg" alt="Conceptualize" className="mode-logo" />
          <h1>Conceptualize</h1>
          <p className="mode-subtitle">Collaborative Knowledge Management</p>
        </div>

        <div className="mode-content">
          <h2>How would you like to use Conceptualize?</h2>
          <p className="mode-description">
            Choose your preferred mode to get started.
          </p>

          <div className="mode-options">
            {/* Local Mode */}
            <button
              className="mode-option"
              onClick={handleLocalClick}
            >
              <div className="mode-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="mode-info">
                <h3>Use Locally</h3>
                <p>
                  Store all your notes on your device. Perfect for personal use
                  without requiring an internet connection or login.
                </p>
              </div>
              <div className="mode-features">
                <div className="feature-tag">No sign-in required</div>
                <div className="feature-tag">Offline access</div>
                <div className="feature-tag">Private & secure</div>
              </div>
            </button>

            {/* Team Mode */}
            <button
              className="mode-option mode-option-team"
              onClick={() => onModeSelected('team')}
            >
              <div className="mode-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="mode-info">
                <h3>Start as a Team</h3>
                <p>
                  Collaborate with your team. Create shared workspaces, invite members, and keep everyone's knowledge in sync.
                </p>
              </div>
              <div className="mode-features">
                <div className="feature-tag">Google sign-in</div>
                <div className="feature-tag">Cloud sync</div>
                <div className="feature-tag">Team management</div>
              </div>
            </button>
          </div>

          <p className="mode-footer">
            You can change this setting later in preferences.
          </p>
        </div>
      </div>

      {showLocalWorkspaceModal && (
        <CreateLocalWorkspaceModal
          onClose={() => setShowLocalWorkspaceModal(false)}
          onCreate={handleLocalWorkspaceCreate}
        />
      )}
    </div>
  );
};

export default ModeSelectionScreen;
