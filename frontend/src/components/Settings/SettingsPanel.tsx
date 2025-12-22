import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { getAppMode, setAppMode } from '../../services/appModeService';
import { updateUserAvatar, updateUserDisplayName } from '../../services/authServiceTauri';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { open } from '@tauri-apps/plugin-shell';
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
  Check,
  RefreshCw,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, setDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
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
  // Cancellation info
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: Date;
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
  onUpdateAvailable?: (available: boolean) => void; // Notify parent when update is available
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  onClose,
  onModeSwitch,
  currentTeam,
  availableTeams,
  onSwitchTeam,
  selectedTeam,
  isTabMode = false,
  onCreateTeam,
  onUpdateAvailable
}) => {
  const { user, signOut, refreshUser } = useAuth();

  // Persist active tab in localStorage
  const [activeTab, setActiveTab] = useLocalStorage<'general' | 'account' | 'subscription'>('settings-active-tab', 'general');

  const [appMode, setAppModeState] = useState<'local' | 'team' | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string>('');
  const [appVersion, setAppVersion] = useState<string>('');
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

  // Update check state
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string>('');
  const [updateNotes, setUpdateNotes] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [manualUpdateRequired, setManualUpdateRequired] = useState(false);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Cancel subscription state
  const [showCancelConfirm, setShowCancelConfirm] = useState<TeamSubscriptionInfo | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isReactivating, setIsReactivating] = useState<string | null>(null); // team ID being reactivated

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

      // Load app version
      try {
        const version = await getVersion();
        setAppVersion(version);
      } catch (error) {
        console.error('Error getting app version:', error);
        setAppVersion('Unknown');
      }
    };
    loadSettings();
  }, []);

  // Helper: Compare semantic versions (returns true if v1 > v2)
  const isNewerVersion = (v1: string, v2: string): boolean => {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return true;
      if (p1 < p2) return false;
    }
    return false;
  };

  // Check for updates
  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (update) {
          setUpdateAvailable(true);
          setLatestVersion(update.version);
          setUpdateNotes(update.body || '');
          setManualUpdateRequired(false);
        }
      } catch (error) {
        console.error('Update check failed:', error);
        // Fallback: fetch latest.json directly
        try {
          const response = await fetch('https://conceptualize-c9a41.web.app/updates/latest.json');
          const data = await response.json();
          if (data.version && appVersion && isNewerVersion(data.version, appVersion)) {
            setUpdateAvailable(true);
            setLatestVersion(data.version);
            setUpdateNotes(data.notes || '');
            setManualUpdateRequired(true);
          }
        } catch (fetchError) {
          console.error('Failed to fetch update info:', fetchError);
        }
      }
    };

    if (appVersion) {
      checkForUpdates();
    }
  }, [appVersion]);

  // Notify parent when update availability changes
  useEffect(() => {
    onUpdateAvailable?.(updateAvailable);
  }, [updateAvailable, onUpdateAvailable]);

  // Handle update download and install
  const handleUpdate = async () => {
    if (manualUpdateRequired) {
      // Open download URL for manual update
      try {
        await open(`https://conceptualize-c9a41.web.app/downloads/conceptualize_${latestVersion}_x64-setup.exe`);
      } catch (error) {
        window.open(`https://conceptualize-c9a41.web.app/downloads/conceptualize_${latestVersion}_x64-setup.exe`, '_blank');
      }
      return;
    }

    setIsUpdating(true);
    setUpdateProgress(0);
    try {
      const update = await check();
      if (update) {
        let downloaded = 0;
        let total = 0;
        await update.downloadAndInstall((event: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => {
          if (event.event === 'Started' && event.data?.contentLength) {
            total = event.data.contentLength;
          } else if (event.event === 'Progress' && event.data?.chunkLength) {
            downloaded += event.data.chunkLength;
            if (total > 0) {
              setUpdateProgress(Math.round((downloaded / total) * 100));
            }
          } else if (event.event === 'Finished') {
            setUpdateProgress(100);
          }
        });
        await relaunch();
      }
    } catch (error) {
      console.error('Update failed:', error);
      setIsUpdating(false);
      setUpdateProgress(0);
    }
  };

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

          // Get cancellation info from billing
          const cancelAtPeriodEnd = team.billing?.subscription?.cancelAtPeriodEnd || false;
          const currentPeriodEndTimestamp = team.billing?.subscription?.currentPeriodEnd;
          const currentPeriodEnd = currentPeriodEndTimestamp
            ? new Date(currentPeriodEndTimestamp * 1000)
            : undefined;

          return {
            team,
            isOwner,
            subscriptionStatus,
            promoInfo: promoInfo || undefined,
            storageUsed,
            storageLimit,
            memberCount,
            cancelAtPeriodEnd,
            currentPeriodEnd
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

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const functions = getFunctions();
      const deleteUserAccount = httpsCallable(functions, 'deleteUserAccount');
      await deleteUserAccount({});

      // Account deleted successfully - redirect to login
      window.location.reload();
    } catch (error: any) {
      console.error('Error deleting account:', error);
      setDeleteError(error.message || 'Failed to delete account. Please try again.');
      setIsDeleting(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!showCancelConfirm) return;

    const currentUser = auth.currentUser;
    if (!currentUser?.email) {
      alert('User not authenticated');
      return;
    }

    setIsCancelling(true);
    try {
      // Use Firestore trigger approach to bypass IAM/CORS issues
      const teamId = showCancelConfirm.team.id;
      const requestId = `${teamId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const requestRef = doc(db, 'cancelSubscriptionRequests', requestId);

      // Write the cancellation request to Firestore
      await setDoc(requestRef, {
        teamId,
        userEmail: currentUser.email,
        requestedBy: currentUser.uid,
        requestedAt: Timestamp.now(),
        status: 'pending',
      });

      // Wait for the Cloud Function to process the request
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsubscribe();
          reject(new Error('Cancellation request timed out'));
        }, 30000);

        const unsubscribe = onSnapshot(requestRef, (snapshot) => {
          const data = snapshot.data();
          if (!data) return;

          if (data.status === 'completed') {
            clearTimeout(timeout);
            unsubscribe();
            resolve();
          } else if (data.status === 'error') {
            clearTimeout(timeout);
            unsubscribe();
            reject(new Error(data.error || 'Cancellation failed'));
          }
        });
      });

      // Refresh subscriptions to show updated status
      setShowCancelConfirm(null);
      setIsLoadingSubscriptions(true);
      // Reload to refresh team data
      window.location.reload();
    } catch (error: any) {
      console.error('Error cancelling subscription:', error);
      alert(error.message || 'Failed to cancel subscription. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleReactivateSubscription = async (teamId: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser?.email) {
      alert('User not authenticated');
      return;
    }

    setIsReactivating(teamId);
    try {
      // Use Firestore trigger approach to bypass IAM/CORS issues
      const requestId = `${teamId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const requestRef = doc(db, 'reactivateSubscriptionRequests', requestId);

      // Write the reactivation request to Firestore
      await setDoc(requestRef, {
        teamId,
        userEmail: currentUser.email,
        requestedBy: currentUser.uid,
        requestedAt: Timestamp.now(),
        status: 'pending',
      });

      // Wait for the Cloud Function to process the request
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsubscribe();
          reject(new Error('Reactivation request timed out'));
        }, 30000);

        const unsubscribe = onSnapshot(requestRef, (snapshot) => {
          const data = snapshot.data();
          if (!data) return;

          if (data.status === 'completed') {
            clearTimeout(timeout);
            unsubscribe();
            resolve();
          } else if (data.status === 'error') {
            clearTimeout(timeout);
            unsubscribe();
            reject(new Error(data.error || 'Reactivation failed'));
          }
        });
      });

      // Refresh subscriptions to show updated status
      setIsLoadingSubscriptions(true);
      window.location.reload();
    } catch (error: any) {
      console.error('Error reactivating subscription:', error);
      alert(error.message || 'Failed to reactivate subscription. Please try again.');
    } finally {
      setIsReactivating(null);
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
            {updateAvailable && <span className="tab-update-dot" />}
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

              {/* App Version */}
              <div className="section-divider" />
              <div className="setting-item app-version-item">
                <div className="setting-label">
                  <span className="setting-title">App Version</span>
                  <span className="setting-description">Conceptualize Desktop</span>
                </div>
                <span className="version-badge">v{appVersion}</span>
              </div>
              {/* Update Available Notification */}
              {updateAvailable && (
                <div className="update-available-card">
                  <div className="update-available-content">
                    <Sparkles size={18} className="update-sparkle" />
                    <div className="update-available-text">
                      <span className="update-available-title">
                        Conceptualize v{latestVersion} is available!
                      </span>
                      {updateNotes && (
                        <span className="update-available-notes">{updateNotes.split('\n')[0]}</span>
                      )}
                    </div>
                  </div>
                  {isUpdating ? (
                    <div className="update-progress-container">
                      <div className="update-progress-bar">
                        <div className="update-progress-fill" style={{ width: `${updateProgress}%` }} />
                      </div>
                      <span className="update-progress-text">
                        {updateProgress < 100 ? `${updateProgress}%` : 'Installing...'}
                      </span>
                    </div>
                  ) : (
                    <button className="update-now-button" onClick={handleUpdate}>
                      {manualUpdateRequired ? (
                        <>
                          <Download size={14} />
                          Download
                        </>
                      ) : (
                        <>
                          <RefreshCw size={14} />
                          Update
                        </>
                      )}
                    </button>
                  )}
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

                  {/* Delete Account */}
                  <div className="section-divider" />
                  <div className="delete-account-section">
                    <h4>
                      <Trash2 size={18} />
                      Danger Zone
                    </h4>
                    <p className="delete-account-warning">
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                    <button
                      className="delete-account-button"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      <Trash2 size={16} />
                      Delete My Account
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
                          <>
                            <div className="subscription-price-info">
                              <CreditCard size={14} />
                              <span>$3/user/month</span>
                            </div>
                            {sub.cancelAtPeriodEnd && sub.currentPeriodEnd && (
                              <div className="subscription-cancel-pending">
                                <Clock size={14} />
                                <span>
                                  Cancels on {sub.currentPeriodEnd.toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </span>
                              </div>
                            )}
                          </>
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
                              {sub.cancelAtPeriodEnd ? (
                                <button
                                  className="subscription-reactivate-btn"
                                  onClick={() => handleReactivateSubscription(sub.team.id)}
                                  disabled={isReactivating === sub.team.id}
                                >
                                  <RefreshCw size={14} className={isReactivating === sub.team.id ? 'spinning' : ''} />
                                  {isReactivating === sub.team.id ? 'Reactivating...' : 'Undo Cancellation'}
                                </button>
                              ) : (
                                <button
                                  className="subscription-cancel-btn"
                                  onClick={() => setShowCancelConfirm(sub)}
                                >
                                  Cancel Subscription
                                </button>
                              )}
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

        {/* Delete Account Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="delete-confirm-overlay" onClick={() => !isDeleting && setShowDeleteConfirm(false)}>
            <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
              <div className="delete-confirm-header">
                <AlertTriangle size={24} className="delete-warning-icon" />
                <h3>Delete Account</h3>
              </div>
              <div className="delete-confirm-content">
                <p className="delete-confirm-warning">
                  This will permanently delete your account and all associated data including:
                </p>
                <ul className="delete-confirm-list">
                  <li>All teams you own and their data</li>
                  <li>Your membership in other teams</li>
                  <li>All uploaded files and avatars</li>
                  <li>Your profile and settings</li>
                </ul>
                <p className="delete-confirm-final">
                  <strong>This action cannot be undone.</strong>
                </p>
                <div className="delete-confirm-input">
                  <label>Type <strong>DELETE</strong> to confirm:</label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    disabled={isDeleting}
                    autoFocus
                  />
                </div>
                {deleteError && (
                  <p className="delete-error">{deleteError}</p>
                )}
              </div>
              <div className="delete-confirm-actions">
                <button
                  className="delete-cancel-btn"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                    setDeleteError(null);
                  }}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  className="delete-confirm-btn"
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete My Account'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Subscription Confirmation Modal */}
        {showCancelConfirm && (
          <div className="cancel-confirm-overlay" onClick={() => !isCancelling && setShowCancelConfirm(null)}>
            <div className="cancel-confirm-modal" onClick={(e) => e.stopPropagation()}>
              <div className="cancel-confirm-header">
                <AlertTriangle size={24} className="cancel-warning-icon" />
                <h3>Cancel Subscription</h3>
              </div>
              <div className="cancel-confirm-content">
                <p className="cancel-confirm-team">
                  Cancel Pro subscription for <strong>{showCancelConfirm.team.name}</strong>?
                </p>
                <p className="cancel-confirm-warning">
                  Your subscription will remain active until the end of your current billing period. After that:
                </p>
                <ul className="cancel-confirm-list">
                  <li>Team chat will be disabled</li>
                  <li>Voice/video calls will be disabled</li>
                  <li>Recordings will be inaccessible</li>
                  <li>Storage will be limited to 2GB</li>
                </ul>
                <p className="cancel-confirm-note">
                  You can reactivate your subscription at any time before the period ends.
                </p>
              </div>
              <div className="cancel-confirm-actions">
                <button
                  className="cancel-keep-btn"
                  onClick={() => setShowCancelConfirm(null)}
                  disabled={isCancelling}
                >
                  Keep Subscription
                </button>
                <button
                  className="cancel-confirm-btn"
                  onClick={handleCancelSubscription}
                  disabled={isCancelling}
                >
                  {isCancelling ? 'Cancelling...' : 'Yes, Cancel'}
                </button>
              </div>
            </div>
          </div>
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
            {updateAvailable && <span className="tab-update-dot" />}
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

              {/* App Version */}
              <div className="section-divider" />
              <div className="setting-item app-version-item">
                <div className="setting-label">
                  <span className="setting-title">App Version</span>
                  <span className="setting-description">Conceptualize Desktop</span>
                </div>
                <span className="version-badge">v{appVersion}</span>
              </div>
              {/* Update Available Notification */}
              {updateAvailable && (
                <div className="update-available-card">
                  <div className="update-available-content">
                    <Sparkles size={18} className="update-sparkle" />
                    <div className="update-available-text">
                      <span className="update-available-title">
                        Conceptualize v{latestVersion} is available!
                      </span>
                      {updateNotes && (
                        <span className="update-available-notes">{updateNotes.split('\n')[0]}</span>
                      )}
                    </div>
                  </div>
                  {isUpdating ? (
                    <div className="update-progress-container">
                      <div className="update-progress-bar">
                        <div className="update-progress-fill" style={{ width: `${updateProgress}%` }} />
                      </div>
                      <span className="update-progress-text">
                        {updateProgress < 100 ? `${updateProgress}%` : 'Installing...'}
                      </span>
                    </div>
                  ) : (
                    <button className="update-now-button" onClick={handleUpdate}>
                      {manualUpdateRequired ? (
                        <>
                          <Download size={14} />
                          Download
                        </>
                      ) : (
                        <>
                          <RefreshCw size={14} />
                          Update
                        </>
                      )}
                    </button>
                  )}
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

                  {/* Delete Account */}
                  <div className="section-divider" />
                  <div className="delete-account-section">
                    <h4>
                      <Trash2 size={18} />
                      Danger Zone
                    </h4>
                    <p className="delete-account-warning">
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                    <button
                      className="delete-account-button"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      <Trash2 size={16} />
                      Delete My Account
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
                          <>
                            <div className="subscription-price-info">
                              <CreditCard size={14} />
                              <span>$3/user/month</span>
                            </div>
                            {sub.cancelAtPeriodEnd && sub.currentPeriodEnd && (
                              <div className="subscription-cancel-pending">
                                <Clock size={14} />
                                <span>
                                  Cancels on {sub.currentPeriodEnd.toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </span>
                              </div>
                            )}
                          </>
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
                              {sub.cancelAtPeriodEnd ? (
                                <button
                                  className="subscription-reactivate-btn"
                                  onClick={() => handleReactivateSubscription(sub.team.id)}
                                  disabled={isReactivating === sub.team.id}
                                >
                                  <RefreshCw size={14} className={isReactivating === sub.team.id ? 'spinning' : ''} />
                                  {isReactivating === sub.team.id ? 'Reactivating...' : 'Undo Cancellation'}
                                </button>
                              ) : (
                                <button
                                  className="subscription-cancel-btn"
                                  onClick={() => setShowCancelConfirm(sub)}
                                >
                                  Cancel Subscription
                                </button>
                              )}
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

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="delete-confirm-overlay" onClick={() => !isDeleting && setShowDeleteConfirm(false)}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-confirm-header">
              <AlertTriangle size={24} className="delete-warning-icon" />
              <h3>Delete Account</h3>
            </div>
            <div className="delete-confirm-content">
              <p className="delete-confirm-warning">
                This will permanently delete your account and all associated data including:
              </p>
              <ul className="delete-confirm-list">
                <li>All teams you own and their data</li>
                <li>Your membership in other teams</li>
                <li>All uploaded files and avatars</li>
                <li>Your profile and settings</li>
              </ul>
              <p className="delete-confirm-final">
                <strong>This action cannot be undone.</strong>
              </p>
              <div className="delete-confirm-input">
                <label>Type <strong>DELETE</strong> to confirm:</label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  disabled={isDeleting}
                  autoFocus
                />
              </div>
              {deleteError && (
                <p className="delete-error">{deleteError}</p>
              )}
            </div>
            <div className="delete-confirm-actions">
              <button
                className="delete-cancel-btn"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText('');
                  setDeleteError(null);
                }}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="delete-confirm-btn"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Subscription Confirmation Modal */}
      {showCancelConfirm && (
        <div className="cancel-confirm-overlay" onClick={() => !isCancelling && setShowCancelConfirm(null)}>
          <div className="cancel-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cancel-confirm-header">
              <AlertTriangle size={24} className="cancel-warning-icon" />
              <h3>Cancel Subscription</h3>
            </div>
            <div className="cancel-confirm-content">
              <p className="cancel-confirm-team">
                Cancel Pro subscription for <strong>{showCancelConfirm.team.name}</strong>?
              </p>
              <p className="cancel-confirm-warning">
                Your subscription will remain active until the end of your current billing period. After that:
              </p>
              <ul className="cancel-confirm-list">
                <li>Team chat will be disabled</li>
                <li>Voice/video calls will be disabled</li>
                <li>Recordings will be inaccessible</li>
                <li>Storage will be limited to 2GB</li>
              </ul>
              <p className="cancel-confirm-note">
                You can reactivate your subscription at any time before the period ends.
              </p>
            </div>
            <div className="cancel-confirm-actions">
              <button
                className="cancel-keep-btn"
                onClick={() => setShowCancelConfirm(null)}
                disabled={isCancelling}
              >
                Keep Subscription
              </button>
              <button
                className="cancel-confirm-btn"
                onClick={handleCancelSubscription}
                disabled={isCancelling}
              >
                {isCancelling ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;
