import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { getAppMode, setAppMode } from '../../services/appModeService';
import { updateUserAvatar, updateUserDisplayName } from '../../services/authServiceTauri';
import { invoke } from '@tauri-apps/api/core';
import { Team, getUserTeams, isInternalProEmail } from '../../services/teamService';
import { getPromoStatusFromBilling } from '../../services/promoService';
import { getTeamStorageUsage } from '../../services/storageTrackingService';
import type { ActivePromoInfo } from '../../services/promoTypes';
import { formatBytes } from '../../services/billingTypes';
import {
  Folder,
  Users,
  X,
  Crown,
  Star,
  User,
  FolderOpen,
  ExternalLink,
  Download,
  Plus,
  Pencil,
  CreditCard,
  Clock,
  HardDrive,
  Sparkles,
  AlertCircle,
  Check
} from 'lucide-react';
import AvatarPicker from './AvatarPicker';
import UpgradeModal from '../Billing/UpgradeModal';
import type { StorageUsage } from '../../services/billingTypes';
import './SettingsPanel.css';

// Type for team subscription info
interface TeamSubscriptionInfo {
  team: Team;
  isOwner: boolean;
  subscriptionStatus: 'free' | 'promo' | 'subscribed';
  promoInfo?: ActivePromoInfo;
  storageUsed: number;
  storageLimit: number;
  memberCount: number;
}

interface SettingsPanelProps {
  onClose: () => void;
  onModeSwitch?: () => void;
  currentTeam?: Team;
  availableTeams?: Team[];
  onSwitchTeam?: (team: Team) => void;
  selectedTeam?: any;
  isTabMode?: boolean; // When true, renders as inline content instead of modal
  onCreateTeam?: () => void; // Open the create team modal
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  onClose,
  onModeSwitch,
  currentTeam,
  availableTeams,
  onSwitchTeam,
  selectedTeam,
  isTabMode = false,
  onCreateTeam
}) => {
  const { user, signOut, refreshUser } = useAuth();

  // Persist active tab in localStorage
  const [activeTab, setActiveTab] = useLocalStorage<'general' | 'account' | 'subscription'>('settings-active-tab', 'general');

  const [appMode, setAppModeState] = useState<'local' | 'team' | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  // Subscription tab state
  const [teamSubscriptions, setTeamSubscriptions] = useState<TeamSubscriptionInfo[]>([]);
  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(false);
  const [upgradeModalTeam, setUpgradeModalTeam] = useState<TeamSubscriptionInfo | null>(null);

  // Get team-specific role if in team mode
  // Use lowercase email for lookup since members are stored with lowercase keys
  const userEmailLower = user?.email?.toLowerCase();
  const displayRole = selectedTeam && user && userEmailLower ?
    // First check if user is the team creator (owner)
    (selectedTeam.createdBy?.toLowerCase() === userEmailLower ? 'owner' :
     // Then check team members for their role
     selectedTeam.members?.[userEmailLower]?.role || user.role) :
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

  // Load subscription data when subscription tab is opened
  useEffect(() => {
    const loadSubscriptionData = async () => {
      if (activeTab !== 'subscription' || !user?.email) return;

      setIsLoadingSubscriptions(true);
      try {
        // Get all teams for user
        const teams = await getUserTeams(user.email);

        // Load subscription info for each team where user is owner
        const subscriptionPromises = teams.map(async (team) => {
          const userEmail = user.email?.toLowerCase() || '';
          const memberInfo = team.members?.[userEmail];
          // Check both createdBy field and member role for robustness
          const isOwner = team.createdBy?.toLowerCase() === userEmail || memberInfo?.role === 'owner';

          // Get promo status
          let promoInfo: ActivePromoInfo | null = null;
          let subscriptionStatus: 'free' | 'promo' | 'subscribed' = 'free';

          try {
            // Check if team owner has internal domain (auto-pro)
            const isInternalTeam = isInternalProEmail(team.createdBy);

            promoInfo = await getPromoStatusFromBilling(team.id);
            if (isInternalTeam || team.billing?.subscription?.status === 'active') {
              subscriptionStatus = 'subscribed';
            } else if (promoInfo) {
              subscriptionStatus = 'promo';
            }
          } catch (err) {
            console.error('Error getting promo status for team:', team.id, err);
          }

          // Get storage usage
          let storageUsed = 0;
          let storageLimit = 2 * 1024 * 1024 * 1024; // 2GB default for free
          try {
            const usage = await getTeamStorageUsage(team.id);
            storageUsed = usage.usedBytes;
            storageLimit = usage.limitBytes;
          } catch (err) {
            console.error('Error getting storage for team:', team.id, err);
          }

          const memberCount = team.memberEmails?.length || Object.keys(team.members || {}).length;

          return {
            team,
            isOwner,
            subscriptionStatus,
            promoInfo: promoInfo || undefined,
            storageUsed,
            storageLimit,
            memberCount
          } as TeamSubscriptionInfo;
        });

        const subscriptions = await Promise.all(subscriptionPromises);
        // Only show subscriptions for teams where the user is the owner
        // Non-owners should not see or manage subscriptions for teams they were invited to
        const ownerSubscriptions = subscriptions.filter(sub => sub.isOwner);
        // Sort by team name
        ownerSubscriptions.sort((a, b) => a.team.name.localeCompare(b.team.name));
        setTeamSubscriptions(ownerSubscriptions);
      } catch (error) {
        console.error('Error loading subscription data:', error);
      } finally {
        setIsLoadingSubscriptions(false);
      }
    };

    loadSubscriptionData();
  }, [activeTab, user?.email]);

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

  const handleAvatarSelect = async (avatarUrl: string) => {
    if (!user) return;

    setIsUpdatingAvatar(true);
    try {
      await updateUserAvatar(user.uid, avatarUrl);
      refreshUser(); // Refresh user data to show new avatar
    } catch (error) {
      console.error('Error updating avatar:', error);
    } finally {
      setIsUpdatingAvatar(false);
    }
  };

  const handleStartEditName = () => {
    setEditingName(user?.displayName || '');
    setIsEditingName(true);
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditingName('');
  };

  const handleSaveName = async () => {
    if (!user || !editingName.trim()) return;

    setIsUpdatingName(true);
    try {
      await updateUserDisplayName(user.uid, editingName.trim());
      refreshUser(); // Refresh user data to show new name
      setIsEditingName(false);
      setEditingName('');
    } catch (error) {
      console.error('Error updating name:', error);
    } finally {
      setIsUpdatingName(false);
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
          {appMode === 'team' && (
            <button
              className={`settings-tab ${activeTab === 'subscription' ? 'active' : ''}`}
              onClick={() => setActiveTab('subscription')}
            >
              Subscription
            </button>
          )}
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

            </div>
          )}

          {activeTab === 'account' && (
            <div className="settings-section">
              <h3>Account Settings</h3>

              {user ? (
                <>
                  {/* User Info */}
                  <div className="user-info-card">
                    <div
                      className={`user-avatar clickable ${isUpdatingAvatar ? 'updating' : ''}`}
                      onClick={() => setShowAvatarPicker(true)}
                      title="Click to change avatar"
                    >
                      {user.customAvatar ? (
                        <img src={user.customAvatar} alt="Avatar" className="avatar-image" />
                      ) : (
                        user.displayName?.charAt(0).toUpperCase() || 'U'
                      )}
                      <div className="avatar-edit-overlay">
                        <Pencil size={16} />
                      </div>
                    </div>
                    <div className="user-details">
                      {isEditingName ? (
                        <div className="name-edit-container">
                          <input
                            type="text"
                            className="name-edit-input"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveName();
                              if (e.key === 'Escape') handleCancelEditName();
                            }}
                            autoFocus
                            disabled={isUpdatingName}
                          />
                          <div className="name-edit-actions">
                            <button
                              className="name-edit-btn save"
                              onClick={handleSaveName}
                              disabled={isUpdatingName || !editingName.trim()}
                              title="Save"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              className="name-edit-btn cancel"
                              onClick={handleCancelEditName}
                              disabled={isUpdatingName}
                              title="Cancel"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="name-display-container">
                          <h4>{user.displayName}</h4>
                          <button
                            className="name-edit-trigger"
                            onClick={handleStartEditName}
                            title="Edit name"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      )}
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

                  {/* Start New Team */}
                  {onCreateTeam && (
                    <div className="setting-item">
                      <div className="setting-label">
                        <span className="setting-title">Start New Team</span>
                        <span className="setting-description">
                          Create a new team and invite members to collaborate
                        </span>
                      </div>
                      <button className="new-team-button" onClick={onCreateTeam} title="Create New Team">
                        <Plus size={18} className="new-team-icon" />
                        <span className="new-team-text">New Team</span>
                      </button>
                    </div>
                  )}

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

          {activeTab === 'subscription' && (
            <div className="settings-section subscription-section">
              <h3>
                <CreditCard size={20} />
                Your Subscriptions
              </h3>

              {isLoadingSubscriptions ? (
                <div className="subscription-loading">
                  <div className="loading-spinner" />
                  <p>Loading subscriptions...</p>
                </div>
              ) : teamSubscriptions.length === 0 ? (
                <div className="no-subscriptions">
                  <p>You don't own any teams. Only team owners can view and manage subscriptions.</p>
                </div>
              ) : (
                <div className="subscription-list">
                  {teamSubscriptions.map((sub) => (
                    <div key={sub.team.id} className={`subscription-card ${sub.subscriptionStatus}`}>
                      <div className="subscription-header">
                        <div className="subscription-team-info">
                          <h4>{sub.team.name}</h4>
                          <div className="subscription-meta">
                            <span className="member-count">
                              <Users size={14} />
                              {sub.memberCount} member{sub.memberCount !== 1 ? 's' : ''}
                            </span>
                            {sub.isOwner && (
                              <span className="owner-badge">
                                <Crown size={12} />
                                Owner
                              </span>
                            )}
                          </div>
                        </div>
                        <div className={`subscription-status-badge ${sub.subscriptionStatus}`}>
                          {sub.subscriptionStatus === 'promo' && (
                            <>
                              <Sparkles size={14} />
                              Pro Trial
                            </>
                          )}
                          {sub.subscriptionStatus === 'subscribed' && (
                            <>
                              <CreditCard size={14} />
                              Pro
                            </>
                          )}
                          {sub.subscriptionStatus === 'free' && (
                            <>
                              <AlertCircle size={14} />
                              Free
                            </>
                          )}
                        </div>
                      </div>

                      <div className="subscription-details">
                        {/* Status Info */}
                        {sub.subscriptionStatus === 'promo' && sub.promoInfo && (
                          <div className="subscription-promo-info">
                            <Clock size={14} />
                            <span>
                              {sub.promoInfo.daysRemaining} day{sub.promoInfo.daysRemaining !== 1 ? 's' : ''} remaining
                              {sub.promoInfo.daysRemaining <= 3 && (
                                <span className="expiring-warning"> - Expiring soon!</span>
                              )}
                            </span>
                          </div>
                        )}
                        {sub.subscriptionStatus === 'subscribed' && (
                          <div className="subscription-price-info">
                            <CreditCard size={14} />
                            <span>$3/user/month</span>
                          </div>
                        )}

                        {/* Storage */}
                        <div className="subscription-storage">
                          <div className="storage-label">
                            <HardDrive size={14} />
                            <span>Storage: {formatBytes(sub.storageUsed)} / {formatBytes(sub.storageLimit)}</span>
                          </div>
                          <div className="storage-bar">
                            <div
                              className="storage-fill"
                              style={{ width: `${Math.min(100, (sub.storageUsed / sub.storageLimit) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Actions - Only show for owners */}
                      {sub.isOwner && (
                        <div className="subscription-actions">
                          {sub.subscriptionStatus === 'promo' && (
                            <button
                              className="subscription-upgrade-btn"
                              onClick={() => setUpgradeModalTeam(sub)}
                            >
                              <Sparkles size={14} />
                              Upgrade to Pro
                            </button>
                          )}
                          {sub.subscriptionStatus === 'subscribed' && (
                            <>
                              <button className="subscription-manage-btn">
                                Manage Subscription
                              </button>
                              <button className="subscription-cancel-btn">
                                Cancel
                              </button>
                            </>
                          )}
                          {sub.subscriptionStatus === 'free' && (
                            <button
                              className="subscription-upgrade-btn"
                              onClick={() => setUpgradeModalTeam(sub)}
                            >
                              <Sparkles size={14} />
                              Upgrade to Pro
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Avatar Picker Modal */}
        {showAvatarPicker && (
          <AvatarPicker
            currentAvatar={user?.customAvatar}
            onSelect={handleAvatarSelect}
            onClose={() => setShowAvatarPicker(false)}
          />
        )}

        {/* Upgrade Modal */}
        {upgradeModalTeam && (
          <UpgradeModal
            isOpen={true}
            onClose={() => setUpgradeModalTeam(null)}
            teamId={upgradeModalTeam.team.id}
            teamName={upgradeModalTeam.team.name}
            usage={{
              usedBytes: upgradeModalTeam.storageUsed,
              limitBytes: upgradeModalTeam.storageLimit,
              percentUsed: Math.round((upgradeModalTeam.storageUsed / upgradeModalTeam.storageLimit) * 100),
              status: 'ok',
              permissions: {
                canCreateNotes: true,
                canUploadFiles: true,
                canEditNotes: true,
                canDeleteFiles: true,
                canInviteMembers: true,
              },
              usedFormatted: formatBytes(upgradeModalTeam.storageUsed),
              limitFormatted: formatBytes(upgradeModalTeam.storageLimit),
              requiresUpgrade: true,
              monthlyPrice: upgradeModalTeam.memberCount * 3,
              memberCount: upgradeModalTeam.memberCount,
            } as StorageUsage}
            onPromoSuccess={() => {
              setUpgradeModalTeam(null);
              // Refresh subscriptions to show updated status
              setIsLoadingSubscriptions(true);
              setTimeout(() => window.location.reload(), 500);
            }}
          />
        )}
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
          {appMode === 'team' && (
            <button
              className={`settings-tab ${activeTab === 'subscription' ? 'active' : ''}`}
              onClick={() => setActiveTab('subscription')}
            >
              Subscription
            </button>
          )}
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

            </div>
          )}

          {activeTab === 'account' && (
            <div className="settings-section">
              <h3>Account Settings</h3>

              {user ? (
                <>
                  {/* User Info */}
                  <div className="user-info-card">
                    <div
                      className={`user-avatar clickable ${isUpdatingAvatar ? 'updating' : ''}`}
                      onClick={() => setShowAvatarPicker(true)}
                      title="Click to change avatar"
                    >
                      {user.customAvatar ? (
                        <img src={user.customAvatar} alt="Avatar" className="avatar-image" />
                      ) : (
                        user.displayName?.charAt(0).toUpperCase() || 'U'
                      )}
                      <div className="avatar-edit-overlay">
                        <Pencil size={16} />
                      </div>
                    </div>
                    <div className="user-details">
                      {isEditingName ? (
                        <div className="name-edit-container">
                          <input
                            type="text"
                            className="name-edit-input"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveName();
                              if (e.key === 'Escape') handleCancelEditName();
                            }}
                            autoFocus
                            disabled={isUpdatingName}
                          />
                          <div className="name-edit-actions">
                            <button
                              className="name-edit-btn save"
                              onClick={handleSaveName}
                              disabled={isUpdatingName || !editingName.trim()}
                              title="Save"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              className="name-edit-btn cancel"
                              onClick={handleCancelEditName}
                              disabled={isUpdatingName}
                              title="Cancel"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="name-display-container">
                          <h4>{user.displayName}</h4>
                          <button
                            className="name-edit-trigger"
                            onClick={handleStartEditName}
                            title="Edit name"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      )}
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

                  {/* Start New Team */}
                  {onCreateTeam && (
                    <div className="setting-item">
                      <div className="setting-label">
                        <span className="setting-title">Start New Team</span>
                        <span className="setting-description">
                          Create a new team and invite members to collaborate
                        </span>
                      </div>
                      <button className="new-team-button" onClick={onCreateTeam} title="Create New Team">
                        <Plus size={18} className="new-team-icon" />
                        <span className="new-team-text">New Team</span>
                      </button>
                    </div>
                  )}

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

          {activeTab === 'subscription' && (
            <div className="settings-section subscription-section">
              <h3>
                <CreditCard size={20} />
                Your Subscriptions
              </h3>

              {isLoadingSubscriptions ? (
                <div className="subscription-loading">
                  <div className="loading-spinner" />
                  <p>Loading subscriptions...</p>
                </div>
              ) : teamSubscriptions.length === 0 ? (
                <div className="no-subscriptions">
                  <p>You don't own any teams. Only team owners can view and manage subscriptions.</p>
                </div>
              ) : (
                <div className="subscription-list">
                  {teamSubscriptions.map((sub) => (
                    <div key={sub.team.id} className={`subscription-card ${sub.subscriptionStatus}`}>
                      <div className="subscription-header">
                        <div className="subscription-team-info">
                          <h4>{sub.team.name}</h4>
                          <div className="subscription-meta">
                            <span className="member-count">
                              <Users size={14} />
                              {sub.memberCount} member{sub.memberCount !== 1 ? 's' : ''}
                            </span>
                            {sub.isOwner && (
                              <span className="owner-badge">
                                <Crown size={12} />
                                Owner
                              </span>
                            )}
                          </div>
                        </div>
                        <div className={`subscription-status-badge ${sub.subscriptionStatus}`}>
                          {sub.subscriptionStatus === 'promo' && (
                            <>
                              <Sparkles size={14} />
                              Pro Trial
                            </>
                          )}
                          {sub.subscriptionStatus === 'subscribed' && (
                            <>
                              <CreditCard size={14} />
                              Pro
                            </>
                          )}
                          {sub.subscriptionStatus === 'free' && (
                            <>
                              <AlertCircle size={14} />
                              Free
                            </>
                          )}
                        </div>
                      </div>

                      <div className="subscription-details">
                        {/* Status Info */}
                        {sub.subscriptionStatus === 'promo' && sub.promoInfo && (
                          <div className="subscription-promo-info">
                            <Clock size={14} />
                            <span>
                              {sub.promoInfo.daysRemaining} day{sub.promoInfo.daysRemaining !== 1 ? 's' : ''} remaining
                              {sub.promoInfo.daysRemaining <= 3 && (
                                <span className="expiring-warning"> - Expiring soon!</span>
                              )}
                            </span>
                          </div>
                        )}
                        {sub.subscriptionStatus === 'subscribed' && (
                          <div className="subscription-price-info">
                            <CreditCard size={14} />
                            <span>$3/user/month</span>
                          </div>
                        )}

                        {/* Storage */}
                        <div className="subscription-storage">
                          <div className="storage-label">
                            <HardDrive size={14} />
                            <span>Storage: {formatBytes(sub.storageUsed)} / {formatBytes(sub.storageLimit)}</span>
                          </div>
                          <div className="storage-bar">
                            <div
                              className="storage-fill"
                              style={{ width: `${Math.min(100, (sub.storageUsed / sub.storageLimit) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Actions - Only show for owners */}
                      {sub.isOwner && (
                        <div className="subscription-actions">
                          {sub.subscriptionStatus === 'promo' && (
                            <button
                              className="subscription-upgrade-btn"
                              onClick={() => setUpgradeModalTeam(sub)}
                            >
                              <Sparkles size={14} />
                              Upgrade to Pro
                            </button>
                          )}
                          {sub.subscriptionStatus === 'subscribed' && (
                            <>
                              <button className="subscription-manage-btn">
                                Manage Subscription
                              </button>
                              <button className="subscription-cancel-btn">
                                Cancel
                              </button>
                            </>
                          )}
                          {sub.subscriptionStatus === 'free' && (
                            <button
                              className="subscription-upgrade-btn"
                              onClick={() => setUpgradeModalTeam(sub)}
                            >
                              <Sparkles size={14} />
                              Upgrade to Pro
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Avatar Picker Modal */}
      {showAvatarPicker && (
        <AvatarPicker
          currentAvatar={user?.customAvatar}
          onSelect={handleAvatarSelect}
          onClose={() => setShowAvatarPicker(false)}
        />
      )}

      {/* Upgrade Modal */}
      {upgradeModalTeam && (
        <UpgradeModal
          isOpen={true}
          onClose={() => setUpgradeModalTeam(null)}
          teamId={upgradeModalTeam.team.id}
          teamName={upgradeModalTeam.team.name}
          usage={{
            usedBytes: upgradeModalTeam.storageUsed,
            limitBytes: upgradeModalTeam.storageLimit,
            percentUsed: Math.round((upgradeModalTeam.storageUsed / upgradeModalTeam.storageLimit) * 100),
            status: 'ok',
            permissions: {
              canCreateNotes: true,
              canUploadFiles: true,
              canEditNotes: true,
              canDeleteFiles: true,
              canInviteMembers: true,
            },
            usedFormatted: formatBytes(upgradeModalTeam.storageUsed),
            limitFormatted: formatBytes(upgradeModalTeam.storageLimit),
            requiresUpgrade: true,
            monthlyPrice: upgradeModalTeam.memberCount * 3,
            memberCount: upgradeModalTeam.memberCount,
          } as StorageUsage}
          onPromoSuccess={() => {
            setUpgradeModalTeam(null);
            // Refresh subscriptions to show updated status
            setIsLoadingSubscriptions(true);
            setTimeout(() => window.location.reload(), 500);
          }}
        />
      )}
    </div>
  );
};

export default SettingsPanel;
