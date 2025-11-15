import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getAppMode, setAppMode, clearAppMode } from '../../services/appModeService';
import { invoke } from '@tauri-apps/api/core';
import { isAdmin, isLeaderOrAdmin } from '../../services/authService';
import { Folder, Users, X, Crown, Star, User, Shield } from 'lucide-react';
import './SettingsPanel.css';

interface SettingsPanelProps {
  onClose: () => void;
  onOpenUserManagement?: () => void;
  onModeSwitch: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  onClose,
  onOpenUserManagement,
  onModeSwitch
}) => {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'general' | 'account'>('general');
  const [appMode, setAppModeState] = useState<'local' | 'team' | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string>('');

  React.useEffect(() => {
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
      onModeSwitch();
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
      onModeSwitch();
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

              {/* Folder Location */}
              <div className="setting-item">
                <div className="setting-label">
                  <span className="setting-title">Notes Folder</span>
                  <span className="setting-description">{currentFolder || 'Not set'}</span>
                </div>
                <button className="secondary-button" onClick={handleChangeFolder}>
                  Change Folder
                </button>
              </div>

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
                        {user.role === 'admin' && (
                          <>
                            <Crown size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                            Admin
                          </>
                        )}
                        {user.role === 'leader' && (
                          <>
                            <Star size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                            Leader
                          </>
                        )}
                        {user.role === 'employee' && (
                          <>
                            <User size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                            Employee
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
                        {user.role === 'admin' && 'Full access to all features and user management'}
                        {user.role === 'leader' && 'Can manage team members and access leader-level content'}
                        {user.role === 'employee' && 'Can access employee-level content and collaborate'}
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
