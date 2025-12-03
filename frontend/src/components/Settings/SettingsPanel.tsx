import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getAppMode, setAppMode } from '../../services/appModeService';
import { invoke } from '@tauri-apps/api/core';
import { isAdmin, isLeaderOrAdmin } from '../../services/authServiceTauri';
import {
  Folder,
  Users,
  X,
  Crown,
  Star,
  User,
  Shield,
  FolderOpen,
  ExternalLink,
  Download
} from 'lucide-react';
import './SettingsPanel.css';

interface Team {
  id: string;
  name: string;
  description?: string;
  [key: string]: any;
}

interface SettingsPanelProps {
  onClose: () => void;
  onOpenUserManagement?: () => void;
  onModeSwitch?: () => void;
  currentTeam?: Team;
  availableTeams?: Team[];
  onSwitchTeam?: (team: Team) => void;
  selectedTeam?: any;
  isTabMode?: boolean; // When true, renders as inline content instead of modal
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  onClose,
  onOpenUserManagement,
  onModeSwitch,
  currentTeam,
  availableTeams,
  onSwitchTeam,
  selectedTeam,
  isTabMode = false
}) => {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'general' | 'account'>('general');
  const [appMode, setAppModeState] = useState<'local' | 'team' | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  // Get team-specific role if in team mode
  // Use lowercase email for lookup since members are stored with lowercase keys
  const userEmailLower = user?.email?.toLowerCase();
  const displayRole = selectedTeam && user && userEmailLower ?
    (selectedTeam.members?.[userEmailLower]?.role || user.role) :
    user?.role;

  useEffect(() => {
    const loadSettings = async () => {
      const mode = await getAppMode();
      setAppModeState(mode);

      const folder = await invoke<string | null>('get_root_folder');
      if (folder) setCurrentFolder(folder);
    };
    loadSettings();
  }, []);

  const handleChangeFolder = async () => {
    try {
      const newFolder = await invoke<string | null>('select_folder');
      if (newFolder) {
        await invoke('save_root_folder', { folderPath: newFolder });
        setCurrentFolder(newFolder);
        // Trigger app reload
        window.location.reload();
      }
    } catch (error) {
      console.error('Error changing folder:', error);
    }
  };

  const handleSwitchToTeam = async () => {
    try {
      await setAppMode('team');
      onModeSwitch?.();
    } catch (error) {
      console.error('Error switching to team mode:', error);
    }
  };

  const handleSwitchToLocal = async () => {
    try {
      if (user) {
        await signOut();
      }
      await setAppMode('local');
      onModeSwitch?.();
    } catch (error) {
      console.error('Error switching to local mode:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      onClose();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleOpenInExplorer = async () => {
    try {
      await invoke('reveal_in_explorer', { filePath: currentFolder });
    } catch (error) {
      console.error('Error opening in explorer:', error);
    }
  };

  const handleExportNotes = async () => {
    setIsExporting(true);
    try {
      // Use Tauri to create a zip file
      const result = await invoke<{ success: boolean; path?: string; error?: string }>('export_workspace_zip', {
        rootPath: currentFolder
      });

      if (result.success && result.path) {
        // Open the folder containing the exported file
        await invoke('reveal_in_explorer', { filePath: result.path });
      } else {
        console.error('Export failed:', result.error);
        alert('Export failed: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error exporting notes:', error);
      alert('Export feature requires the export_workspace_zip command. Please update the app.');
    } finally {
      setIsExporting(false);
    }
  };

  // Get workspace name from folder path
  const workspaceName = currentFolder ? currentFolder.split(/[/\\]/).pop() || 'Workspace' : 'Workspace';

  // Tab mode - render as inline content
  if (isTabMode) {
    return (
      <div className="settings-tab-container">
        {/* Header */}
        <div className="settings-tab-header">
          <h2>Settings</h2>
        </div>

        {/* Tabs */}
        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            className={`settings-tab ${activeTab === 'account' ? 'active' : ''}`}
            onClick={() => setActiveTab('account')}
          >
            Account
          </button>
        </div>

        {/* Content */}
        <div className="settings-content">
          {activeTab === 'general' && (
            <div className="settings-section">
              {/* Workspace Info Section - Only for local mode */}
              {appMode === 'local' && (
                <>
                  <h3>Workspace</h3>
                  <div className="workspace-header">
                    <div className="workspace-name-display">
                      <FolderOpen size={24} className="workspace-icon" />
                      <div>
                        <h4>{workspaceName}</h4>
                        <span className="workspace-path">{currentFolder}</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="quick-actions-row">
                    <button className="action-btn" onClick={handleChangeFolder}>
                      <Folder size={16} />
                      Change Folder
                    </button>
                    <button className="action-btn" onClick={handleOpenInExplorer}>
                      <ExternalLink size={16} />
                      Open in Explorer
                    </button>
                    <button className="action-btn" onClick={handleExportNotes} disabled={isExporting}>
                      <Download size={16} />
                      {isExporting ? 'Exporting...' : 'Export Backup'}
                    </button>
                  </div>

                  <div className="section-divider" />
                </>
              )}

              <h3>General Settings</h3>

              {/* Current Mode */}
              <div className="setting-item">
                <div className="setting-label">
                  <span className="setting-title">Current Mode</span>
                  <span className="setting-description">
                    {appMode === 'local' ? 'Using locally on your device' : 'Working as a team in the cloud'}
                  </span>
                </div>
                <span className="mode-badge">
                  {appMode === 'local' ? (
                    <>
                      <Folder size={16} /> Local
                    </>
                  ) : (
                    <>
                      <Users size={16} /> Team
                    </>
                  )}
                </span>
              </div>

              {/* Current Team - Only show in team mode */}
              {currentTeam && (
                <div className="setting-item">
                  <div className="setting-label">
                    <span className="setting-title">Current Team</span>
                    <span className="setting-description">{currentTeam.name}</span>
                  </div>
                  {availableTeams && availableTeams.length > 1 && (
                    <select
                      className="team-selector"
                      value={currentTeam.id}
                      onChange={(e) => {
                        const selectedTeam = availableTeams.find(t => t.id === e.target.value);
                        if (selectedTeam && onSwitchTeam) {
                          onSwitchTeam(selectedTeam);
                        }
                      }}
                    >
                      {availableTeams.map(team => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Switch Mode */}
              <div className="setting-item">
                <div className="setting-label">
                  <span className="setting-title">Switch Mode</span>
                  <span className="setting-description">
                    {appMode === 'local'
                      ? 'Switch to team mode to collaborate with others'
                      : 'Switch to local mode to work offline'}
                  </span>
                </div>
                <button
                  className="primary-button"
                  onClick={appMode === 'local' ? handleSwitchToTeam : handleSwitchToLocal}
                >
                  {appMode === 'local' ? 'Switch to Team' : 'Switch to Local'}
                </button>
              </div>

              {/* Admin Dashboard (only for admins) */}
              {user && isAdmin(user) && (
                <div className="setting-item highlight">
                  <div className="setting-label">
                    <span className="setting-title">
                      <Shield size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                      Admin Dashboard
                    </span>
                    <span className="setting-description">
                      Manage users, roles, and team permissions
                    </span>
                  </div>
                  <button
                    className="primary-button"
                    onClick={onOpenUserManagement}
                  >
                    Open Dashboard
                  </button>
                </div>
              )}

              {/* Leader Dashboard (only for leaders, not admins) */}
              {user && !isAdmin(user) && isLeaderOrAdmin(user) && (
                <div className="setting-item highlight">
                  <div className="setting-label">
                    <span className="setting-title">⭐ Leader Dashboard</span>
                    <span className="setting-description">
                      Manage team members
                    </span>
                  </div>
                  <button
                    className="primary-button"
                    onClick={onOpenUserManagement}
                  >
                    Open Dashboard
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'account' && (
            <div className="settings-section">
              <h3>Account Settings</h3>

              {user ? (
                <>
                  {/* User Info */}
                  <div className="user-info-card">
                    <div className="user-avatar">
                      {user.displayName?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="user-details">
                      <h4>{user.displayName}</h4>
                      <p>{user.email}</p>
                      <span className="role-badge">
                        {displayRole === 'owner' && (
                          <>
                            <Crown size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                            OWNER
                          </>
                        )}
                        {displayRole === 'admin' && (
                          <>
                            <Crown size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                            ADMIN
                          </>
                        )}
                        {displayRole === 'leader' && (
                          <>
                            <Star size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                            LEADER
                          </>
                        )}
                        {displayRole === 'member' && (
                          <>
                            <User size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                            MEMBER
                          </>
                        )}
                        {/* Fallback for any other role or undefined */}
                        {!displayRole || !['owner', 'admin', 'leader', 'member'].includes(displayRole) && (
                          <>
                            <User size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                            {displayRole?.toUpperCase() || 'USER'}
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Role Permissions */}
                  <div className="setting-item">
                    <div className="setting-label">
                      <span className="setting-title">Your Permissions</span>
                      <span className="setting-description">
                        {displayRole === 'owner' && 'Full control over the team and all its resources'}
                        {displayRole === 'admin' && 'Full access to all features and user management'}
                        {displayRole === 'leader' && 'Can manage team members and access leader-level content'}
                        {displayRole === 'member' && 'Can view and edit team notes and collaborate'}
                        {(!displayRole || !['owner', 'admin', 'leader', 'member'].includes(displayRole)) && 'Can access team content and collaborate'}
                      </span>
                    </div>
                  </div>

                  {/* Sign Out */}
                  <div className="setting-item">
                    <button className="danger-button" onClick={handleSignOut}>
                      Sign Out
                    </button>
                  </div>
                </>
              ) : (
                <div className="no-account-message">
                  <p>You are using Conceptualize in local mode.</p>
                  <p>Switch to team mode to sign in and collaborate with your team.</p>
                  <button className="primary-button" onClick={handleSwitchToTeam}>
                    Switch to Team Mode
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Modal mode - original overlay rendering
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-button" onClick={onClose} aria-label="Close">
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            className={`settings-tab ${activeTab === 'account' ? 'active' : ''}`}
            onClick={() => setActiveTab('account')}
          >
            Account
          </button>
        </div>

        {/* Content */}
        <div className="settings-content">
          {activeTab === 'general' && (
            <div className="settings-section">
              {/* Workspace Info Section - Only for local mode */}
              {appMode === 'local' && (
                <>
                  <h3>Workspace</h3>
                  <div className="workspace-header">
                    <div className="workspace-name-display">
                      <FolderOpen size={24} className="workspace-icon" />
                      <div>
                        <h4>{workspaceName}</h4>
                        <span className="workspace-path">{currentFolder}</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="quick-actions-row">
                    <button className="action-btn" onClick={handleChangeFolder}>
                      <Folder size={16} />
                      Change Folder
                    </button>
                    <button className="action-btn" onClick={handleOpenInExplorer}>
                      <ExternalLink size={16} />
                      Open in Explorer
                    </button>
                    <button className="action-btn" onClick={handleExportNotes} disabled={isExporting}>
                      <Download size={16} />
                      {isExporting ? 'Exporting...' : 'Export Backup'}
                    </button>
                  </div>

                  <div className="section-divider" />
                </>
              )}

              <h3>General Settings</h3>

              {/* Current Mode */}
              <div className="setting-item">
                <div className="setting-label">
                  <span className="setting-title">Current Mode</span>
                  <span className="setting-description">
                    {appMode === 'local' ? 'Using locally on your device' : 'Working as a team in the cloud'}
                  </span>
                </div>
                <span className="mode-badge">
                  {appMode === 'local' ? (
                    <>
                      <Folder size={16} /> Local
                    </>
                  ) : (
                    <>
                      <Users size={16} /> Team
                    </>
                  )}
                </span>
              </div>

              {/* Current Team - Only show in team mode */}
              {currentTeam && (
                <div className="setting-item">
                  <div className="setting-label">
                    <span className="setting-title">Current Team</span>
                    <span className="setting-description">{currentTeam.name}</span>
                  </div>
                  {availableTeams && availableTeams.length > 1 && (
                    <select
                      className="team-selector"
                      value={currentTeam.id}
                      onChange={(e) => {
                        const selectedTeam = availableTeams.find(t => t.id === e.target.value);
                        if (selectedTeam && onSwitchTeam) {
                          onSwitchTeam(selectedTeam);
                        }
                      }}
                    >
                      {availableTeams.map(team => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Switch Mode */}
              <div className="setting-item">
                <div className="setting-label">
                  <span className="setting-title">Switch Mode</span>
                  <span className="setting-description">
                    {appMode === 'local'
                      ? 'Switch to team mode to collaborate with others'
                      : 'Switch to local mode to work offline'}
                  </span>
                </div>
                <button
                  className="primary-button"
                  onClick={appMode === 'local' ? handleSwitchToTeam : handleSwitchToLocal}
                >
                  {appMode === 'local' ? 'Switch to Team' : 'Switch to Local'}
                </button>
              </div>

              {/* Admin Dashboard (only for admins) */}
              {user && isAdmin(user) && (
                <div className="setting-item highlight">
                  <div className="setting-label">
                    <span className="setting-title">
                      <Shield size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                      Admin Dashboard
                    </span>
                    <span className="setting-description">
                      Manage users, roles, and team permissions
                    </span>
                  </div>
                  <button
                    className="primary-button"
                    onClick={onOpenUserManagement}
                  >
                    Open Dashboard
                  </button>
                </div>
              )}

              {/* Leader Dashboard (only for leaders, not admins) */}
              {user && !isAdmin(user) && isLeaderOrAdmin(user) && (
                <div className="setting-item highlight">
                  <div className="setting-label">
                    <span className="setting-title">⭐ Leader Dashboard</span>
                    <span className="setting-description">
                      Manage team members
                    </span>
                  </div>
                  <button
                    className="primary-button"
                    onClick={onOpenUserManagement}
                  >
                    Open Dashboard
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'account' && (
            <div className="settings-section">
              <h3>Account Settings</h3>

              {user ? (
                <>
                  {/* User Info */}
                  <div className="user-info-card">
                    <div className="user-avatar">
                      {user.displayName?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="user-details">
                      <h4>{user.displayName}</h4>
                      <p>{user.email}</p>
                      <span className="role-badge">
                        {displayRole === 'owner' && (
                          <>
                            <Crown size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                            OWNER
                          </>
                        )}
                        {displayRole === 'admin' && (
                          <>
                            <Crown size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                            ADMIN
                          </>
                        )}
                        {displayRole === 'leader' && (
                          <>
                            <Star size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                            LEADER
                          </>
                        )}
                        {displayRole === 'member' && (
                          <>
                            <User size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                            MEMBER
                          </>
                        )}
                        {/* Fallback for any other role or undefined */}
                        {!displayRole || !['owner', 'admin', 'leader', 'member'].includes(displayRole) && (
                          <>
                            <User size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                            {displayRole?.toUpperCase() || 'USER'}
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Role Permissions */}
                  <div className="setting-item">
                    <div className="setting-label">
                      <span className="setting-title">Your Permissions</span>
                      <span className="setting-description">
                        {displayRole === 'owner' && 'Full control over the team and all its resources'}
                        {displayRole === 'admin' && 'Full access to all features and user management'}
                        {displayRole === 'leader' && 'Can manage team members and access leader-level content'}
                        {displayRole === 'member' && 'Can view and edit team notes and collaborate'}
                        {(!displayRole || !['owner', 'admin', 'leader', 'member'].includes(displayRole)) && 'Can access team content and collaborate'}
                      </span>
                    </div>
                  </div>

                  {/* Sign Out */}
                  <div className="setting-item">
                    <button className="danger-button" onClick={handleSignOut}>
                      Sign Out
                    </button>
                  </div>
                </>
              ) : (
                <div className="no-account-message">
                  <p>You are using Conceptualize in local mode.</p>
                  <p>Switch to team mode to sign in and collaborate with your team.</p>
                  <button className="primary-button" onClick={handleSwitchToTeam}>
                    Switch to Team Mode
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
