import React from 'react';
import SimpleTitleBar from '../UI/SimpleTitleBar';
import './TeamActionSelectionScreen.css';

interface TeamActionSelectionScreenProps {
  onCreateTeam: () => void;
  onJoinTeam: () => void;
  onBack: () => void;
}

const TeamActionSelectionScreen: React.FC<TeamActionSelectionScreenProps> = ({
  onCreateTeam,
  onJoinTeam,
  onBack
}) => {
  return (
    <div className="team-action-selection-screen">
      <SimpleTitleBar />
      <div className="team-action-container">
        <button className="back-button" onClick={onBack} aria-label="Go back">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>

        <div className="team-action-header">
          <img src="/logo.svg" alt="Conceptualize" className="team-action-logo" />
          <h1>Conceptualize</h1>
          <p className="team-action-subtitle">Collaborative Knowledge Management</p>
        </div>

        <div className="team-action-content">
          <h2>What would you like to do?</h2>
          <p className="team-action-description">
            Choose how you want to get started with team collaboration.
          </p>

          <div className="team-action-options">
            {/* Create Team */}
            <button
              className="team-action-option create-team-option"
              onClick={onCreateTeam}
            >
              <div className="team-action-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div className="team-action-info">
                <h3>Create New Team</h3>
                <p>
                  Start your own team and invite others to collaborate.
                  You'll be the team owner.
                </p>
              </div>
            </button>

            {/* Join Team */}
            <button
              className="team-action-option"
              onClick={onJoinTeam}
            >
              <div className="team-action-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div className="team-action-info">
                <h3>Join Existing Team</h3>
                <p>
                  Join a team using an invitation code or link shared with you.
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamActionSelectionScreen;
