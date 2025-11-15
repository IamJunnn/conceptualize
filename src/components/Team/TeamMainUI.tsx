import { useState, useEffect } from 'react';
import { User } from '../../services/authServiceTauri';
import { getUserTeams, Team } from '../../services/teamService';
import './TeamMainUI.css';

interface TeamMainUIProps {
  user: User;
}

export default function TeamMainUI({ user }: TeamMainUIProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateTeam, setShowCreateTeam] = useState(false);

  // Load user's teams on mount
  useEffect(() => {
    loadTeams();
  }, [user.email]);

  const loadTeams = async () => {
    try {
      setLoading(true);
      const userTeams = await getUserTeams(user.email);
      setTeams(userTeams);

      // Auto-select first team if available
      if (userTeams.length > 0 && !selectedTeam) {
        setSelectedTeam(userTeams[0]);
      }
    } catch (error) {
      console.error('Failed to load teams:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="team-main-ui">
        <div className="loading-state">
          <p>Loading your teams...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="team-main-ui">
      {/* Header */}
      <div className="team-header">
        <div className="team-header-left">
          <h1>Conceptualize Teams</h1>
          <p className="user-info">Signed in as {user.email}</p>
        </div>
        <div className="team-header-right">
          <button
            className="create-team-btn"
            onClick={() => setShowCreateTeam(true)}
          >
            + Create Team
          </button>
        </div>
      </div>

      {/* Main Content */}
      {teams.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-content">
            <h2>Welcome to Team Mode!</h2>
            <p>You're not part of any teams yet.</p>
            <p>Create a team to start collaborating with others.</p>
            <button
              className="create-team-btn-large"
              onClick={() => setShowCreateTeam(true)}
            >
              Create Your First Team
            </button>
          </div>
        </div>
      ) : (
        <div className="team-content">
          {/* Sidebar with team list */}
          <div className="team-sidebar">
            <h3>Your Teams</h3>
            <div className="teams-list">
              {teams.map(team => (
                <div
                  key={team.id}
                  className={`team-item ${selectedTeam?.id === team.id ? 'active' : ''}`}
                  onClick={() => setSelectedTeam(team)}
                >
                  <div className="team-item-name">{team.name}</div>
                  <div className="team-item-members">
                    {Object.keys(team.members).length} members
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Main area with selected team content */}
          <div className="team-main-content">
            {selectedTeam ? (
              <>
                <div className="team-info">
                  <h2>{selectedTeam.name}</h2>
                  {selectedTeam.description && (
                    <p className="team-description">{selectedTeam.description}</p>
                  )}
                  <div className="team-meta">
                    <span>Drive Folder: {selectedTeam.driveFolderId}</span>
                    <span>Owner: {selectedTeam.driveOwnerEmail}</span>
                  </div>
                </div>

                <div className="team-notes-area">
                  <h3>Team Notes</h3>
                  <p className="placeholder">Notes from Google Drive will appear here...</p>
                  <p className="dev-info">
                    📂 Folder ID: <code>{selectedTeam.driveFolderId}</code>
                  </p>
                  <p className="dev-info">
                    🔗 <a
                      href={`https://drive.google.com/drive/folders/${selectedTeam.driveFolderId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open in Google Drive
                    </a>
                  </p>
                </div>
              </>
            ) : (
              <div className="no-team-selected">
                <p>Select a team from the sidebar</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TODO: Create Team Modal */}
      {showCreateTeam && (
        <div className="modal-overlay" onClick={() => setShowCreateTeam(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Create Team Modal</h2>
            <p>Coming next...</p>
            <button onClick={() => setShowCreateTeam(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
