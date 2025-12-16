import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { User } from '../../services/authServiceTauri';
import { getUserTeams, Team, getPendingInvites, acceptTeamInvite, updateMemberProfile, getMemberAccessLevel, getGracePeriodDaysRemaining, TeamMember, isInternalProEmail, decodeEmailKey } from '../../services/teamService';
import TitleBar from '../UI/TitleBar';
import { UnifiedSidebar } from '../../renderer/components/UnifiedSidebar';
import GraphView from '../Graph/GraphView';
import FileViewer from '../Viewers/FileViewer';
import { TabBar, OpenFile } from '../UI/TabBar';
import TeamTodoPanel from './TeamTodoPanel';
import { TeamTodo } from '../../services/teamTodoTypes';
import TeamTimelinePanel from './TeamTimelinePanel';
import TeamChatPanel from './Chat/TeamChatPanel';
import FloatingCallWidget from './Chat/FloatingCallWidget';
import CallOverlay from './Chat/CallOverlay';
import RecordingSavingIndicator from './Chat/RecordingSavingIndicator';
import SettingsPanel from '../Settings/SettingsPanel';
import NotificationsPanel, { Notification } from './NotificationsPanel';
import RecordingsPanel from './RecordingsPanel';
import WhiteboardPanel from '../Whiteboard/WhiteboardPanel';
import { subscribeToWhiteboards, createUntitledWhiteboard, renameWhiteboard, deleteWhiteboard } from '../../services/whiteboardService';
import { WhiteboardMeta } from '../../services/whiteboardTypes';
import { TeamDriveStorage, getTeamDriveStorage } from '../../services/teamDriveStorage';
import { DragDropProvider, useDragDrop, EditorPane } from '../../contexts/DragDropContext';
import { GraphVisibilityProvider } from '../../contexts/GraphVisibilityContext';
import CreateTeamModal from './CreateTeamModal';
import JoinTeamModal from './JoinTeamModal';
import TeamManagementModal from './TeamManagementModal';
import InviteMemberModal from './InviteMemberModal';
import ContextMenu from '../UI/ContextMenu';
import HelpModal from '../UI/HelpModal';
import ConfirmModal from '../UI/ConfirmModal';
import { PencilIcon, TrashIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { AlertTriangle, Video, CheckSquare, Users, X, Send, Check, ExternalLink, PanelRight } from 'lucide-react';
import { DropZoneOverlay } from '../UI/DropZoneOverlay';
import IconRail from '../UI/IconRail';
import TeamDashboardPanel from '../Dashboard/TeamDashboardPanel';
// Billing components
import { StorageLimitBanner, StorageUsageMeter, UpgradeModal } from '../Billing';
import { StorageUsage } from '../../services/billingTypes';
import { getTeamStorageUsage, invalidateStorageCache } from '../../services/storageTrackingService';
import { initializeTeamBilling, syncSubscriptionStatus, handlePaymentSuccess, getTeamBilling } from '../../services/billingService';
import { PromoStatusBanner, ReadOnlyBanner } from '../Billing/PromoStatusBanner';
import { getPromoStatusFromBilling, teamHasActivePromo, redeemPartnerPromo } from '../../services/promoService';
import type { ActivePromoInfo } from '../../services/promoTypes';
import { useAuth } from '../../contexts/AuthContext';
import {
  subscribeToNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllNotifications,
  TeamNotification,
  getChannels,
  getOrCreateDMChannel,
  sendMessage,
  subscribeToUnreadCounts,
  subscribeToChannels,
} from '../../services/teamChatService';
import { Channel, SharedFile, SharedRecording, SharedTodo, SharedWhiteboard, generateDMChannelId } from '../../services/teamChatTypes';
import { toggleTodo, subscribeToTodos } from '../../services/teamTodoService';
import { CallState } from '../../services/callTypes';
import { subscribeToCallState, subscribeToIncomingCalls, answerCall, declineCall } from '../../services/callService';
import IncomingCallModal from './Chat/IncomingCallModal';
import { subscribeToTeamRecordings } from '../../services/recordingService';
import { Recording } from '../../services/recordingTypes';
import ShareToChatModal from './Chat/ShareToChatModal';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import './TeamMainUI.css';

// Development mode flag
const isDev = import.meta.env.DEV;

interface TeamMainUIProps {
  user: User;
}

interface FileTreeNode {
  path: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
  id?: string; // Google Drive file ID
}

interface EditingState {
  path: string;
  type: 'rename' | 'new-note' | 'new-folder';
  id?: string; // Google Drive file ID (for parent folder or item being renamed)
}

// Inner component that uses the DragDropContext
function TeamMainUIInner({ user }: TeamMainUIProps) {
  const { draggedTab, setDraggedTab, dropZone, setDropZone, isDragging, setIsDragging } = useDragDrop();
  const { isPartnerUser, partnerInfo } = useAuth();

  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageBackend, setStorageBackend] = useState<TeamDriveStorage | null>(null);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showJoinTeamModal, setShowJoinTeamModal] = useState(false);
  const [, setShowTeamChoice] = useState(false);
  void setShowTeamChoice; // Reserved for team selection UI
  const [showTeamManagement, setShowTeamManagement] = useState(false);
  const [showInviteMember, setShowInviteMember] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    itemPath: string;
    itemType: 'file' | 'folder';
    itemName: string;
    itemId?: string; // Google Drive file ID
  } | null>(null);

  // Share via message modal state
  const [shareFileModal, setShareFileModal] = useState<{
    isOpen: boolean;
    file: SharedFile | null;
  }>({ isOpen: false, file: null });
  const [whiteboardShareModal, setWhiteboardShareModal] = useState<{
    isOpen: boolean;
    whiteboard: WhiteboardMeta | null;
  }>({ isOpen: false, whiteboard: null });
  const [chatChannels, setChatChannels] = useState<Channel[]>([]);

  // Forward todo to chat state
  const [forwardingTodo, setForwardingTodo] = useState<TeamTodo | null>(null);
  const [selectedForwardChannels, setSelectedForwardChannels] = useState<Set<string>>(new Set());
  const [forwardingInProgress, setForwardingInProgress] = useState(false);
  const [forwardTodoSearch, setForwardTodoSearch] = useState('');
  const [forwardTodoMessage, setForwardTodoMessage] = useState('');

  // Timeline filter state (for navigating from dashboard to timeline with a specific filter)
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'tasks' | 'meetings' | undefined>(undefined);
  const [timelineMeetingId, setTimelineMeetingId] = useState<string | undefined>(undefined);

  // Todos filter state (for navigating from dashboard to todos with a specific filter)
  const [todosFilter, setTodosFilter] = useState<'all' | 'my-tasks' | 'unassigned' | undefined>(undefined);
  const [todosHighlightTaskId, setTodosHighlightTaskId] = useState<string | undefined>(undefined);

  // MainUI-like state
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeTab, setActiveTab] = useState<string>('graph');
  const [showGraphTab, setShowGraphTab] = useState(true); // Track Graph tab visibility in single-pane mode
  const [graphTabIndex, setGraphTabIndex] = useState(0); // Position of Graph tab in tab bar
  const [leftPaneGraphIndex, setLeftPaneGraphIndex] = useState(0); // Graph position in left pane
  const [rightPaneGraphIndex, setRightPaneGraphIndex] = useState(0); // Graph position in right pane
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [graphKey, setGraphKey] = useState(0);
  const [, setTodoKey] = useState(0);
  void setTodoKey; // Reserved for todo refresh
  const [filesWithIncomingLinks] = useState<Set<string>>(new Set());

  // Folder access status
  const [folderAccessStatus, setFolderAccessStatus] = useState<{
    hasAccess: boolean;
    loading: boolean;
    message?: string;
    issues?: string[];
  }>({ hasAccess: true, loading: false });

  // Split view state (same as MainUI)
  const [splitView, setSplitView] = useState(false);
  const [activePane, setActivePane] = useState<EditorPane>('left');
  const [leftPaneTab, setLeftPaneTab] = useState<string>('graph');
  const [rightPaneTab, setRightPaneTab] = useState<string>('graph');
  const [leftPaneFiles, setLeftPaneFiles] = useState<OpenFile[]>([]);
  const [rightPaneFiles, setRightPaneFiles] = useState<OpenFile[]>([]);
  // Track which pane shows the Graph tab (for movable Graph)
  const [leftPaneShowGraph, setLeftPaneShowGraph] = useState(true);
  const [rightPaneShowGraph, setRightPaneShowGraph] = useState(false);

  // Resizable split view
  const [leftPaneWidth, setLeftPaneWidth] = useState(50); // Percentage
  const [isResizingPane, setIsResizingPane] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  // Help modal state
  const [activeGuide, setActiveGuide] = useState<'shortcuts' | 'markdown' | null>(null);

  // Delete confirmation modal state
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ show: boolean; itemPath: string; itemName: string } | null>(null);

  // Session persistence
  const [sessionLoaded, setSessionLoaded] = useState(false);

  // Drag start position
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);

  // Storage and billing state
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [storageBannerDismissed, setStorageBannerDismissed] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('free');

  // Promo state
  const [activePromo, setActivePromo] = useState<ActivePromoInfo | null>(null);
  const [isReadOnlyMode, setIsReadOnlyMode] = useState(false);
  const [partnerPromoApplied, setPartnerPromoApplied] = useState(false);

  // Storage warning modal state
  const [storageWarning, setStorageWarning] = useState<{
    show: boolean;
    message: string;
    canUpgrade: boolean;
  }>({ show: false, message: '', canUpgrade: false });

  // Notifications state
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Whiteboard state for sidebar
  const [whiteboards, setWhiteboards] = useState<WhiteboardMeta[]>([]);
  const [activeWhiteboardId, setActiveWhiteboardId] = useState<string | null>(null);

  // Whiteboard context menu state
  const [whiteboardContextMenu, setWhiteboardContextMenu] = useState<{
    x: number;
    y: number;
    whiteboard: WhiteboardMeta;
  } | null>(null);
  const [whiteboardRenaming, setWhiteboardRenaming] = useState<string | null>(null);
  const [whiteboardDeleteConfirm, setWhiteboardDeleteConfirm] = useState<WhiteboardMeta | null>(null);

  // Unread chat message count
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  // New recordings count (for badge)
  const [newRecordingsCount, setNewRecordingsCount] = useState(0);
  const lastViewedRecordingsRef = useRef<number>(
    parseInt(localStorage.getItem('lastViewedRecordingsTimestamp') || '0', 10)
  );

  // Todos and recordings lists (for WhiteboardPanel)
  const [teamTodos, setTeamTodos] = useState<TeamTodo[]>([]);
  const [teamRecordings, setTeamRecordings] = useState<Recording[]>([]);

  // Global call state for persistent floating widget
  const [globalCallState, setGlobalCallState] = useState<CallState | null>(null);
  const [globalCallChannelId, setGlobalCallChannelId] = useState<string | null>(null);
  const [globalCallChannelName, setGlobalCallChannelName] = useState<string | null>(null);
  // Track which channel user is currently viewing (for floating widget when on different channel)
  const [activeViewingChannelId, setActiveViewingChannelId] = useState<string | null>(null);
  // Navigate to specific channel when expanding from floating widget (for regular chat calls)
  const [navigateToChannelId, setNavigateToChannelId] = useState<string | null>(null);
  // Meeting call overlay expanded state (for standalone meeting calls)
  const [meetingCallExpanded, setMeetingCallExpanded] = useState(false);
  // Auto-play a specific recording when navigating to recordings panel
  const [autoPlayRecordingId, setAutoPlayRecordingId] = useState<string | null>(null);

  // Member billing access state
  const [memberAccessLevel, setMemberAccessLevel] = useState<'full' | 'grace' | 'blocked'>('full');
  const [gracePeriodDays, setGracePeriodDays] = useState(0);
  const [graceBannerDismissed, setGraceBannerDismissed] = useState(false);

  const sidebarRef = useRef<any>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const isSavingRef = useRef(false);

  // Track if we've already processed the redirect (prevents double-processing in React Strict Mode)
  const redirectProcessedRef = useRef(false);

  // Refs to capture latest state values for event handlers
  const isDraggingRef = useRef(isDragging);
  const dropZoneRef = useRef(dropZone);

  // Keep refs in sync with state
  useEffect(() => {
    isDraggingRef.current = isDragging;
    dropZoneRef.current = dropZone;
  }, [isDragging, dropZone]);

  // Close whiteboard context menu when clicking outside
  useEffect(() => {
    if (!whiteboardContextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.context-menu')) {
        setWhiteboardContextMenu(null);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setWhiteboardContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [whiteboardContextMenu]);

  // Tauri native file drop handling - register at TeamMainUI level so it works on all tabs
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let lastDropTime = 0;

    const setupTauriDragDrop = async () => {
      try {
        const appWindow = getCurrentWindow();
        unlisten = await appWindow.onDragDropEvent((event) => {
          if (isDev) console.log('[TAURI DRAG MainUI] Event:', event.payload.type);

          // Debounce drop events (Tauri sometimes fires drop twice)
          if (event.payload.type === 'drop') {
            const now = Date.now();
            if (now - lastDropTime < 500) {
              if (isDev) console.log('[TAURI DRAG MainUI] Ignoring duplicate drop event (within 500ms)');
              return;
            }
            lastDropTime = now;
          }

          // Check if position is over a specific element
          const checkIsOverElement = (position: { x: number; y: number } | undefined, selector: string): boolean => {
            if (!position) return false;
            const element = document.querySelector(selector);
            if (!element) return false;
            const rect = element.getBoundingClientRect();
            return (
              position.x >= rect.left &&
              position.x <= rect.right &&
              position.y >= rect.top &&
              position.y <= rect.bottom
            );
          };

          if (event.payload.type === 'enter' || event.payload.type === 'over') {
            const position = event.payload.position;
            const isOverSidebar = checkIsOverElement(position, '.sidebar-content');
            const isOverWhiteboard = checkIsOverElement(position, '.whiteboard-canvas');

            // Emit custom event for sidebar drag indicator
            window.dispatchEvent(new CustomEvent('sidebar-external-drag', {
              detail: { isDragging: isOverSidebar, position }
            }));

            // Emit custom event for whiteboard drag indicator
            window.dispatchEvent(new CustomEvent('whiteboard-external-drag', {
              detail: { isDragging: isOverWhiteboard, position }
            }));
          } else if (event.payload.type === 'leave') {
            // User left the window - hide all overlays
            window.dispatchEvent(new CustomEvent('sidebar-external-drag', { detail: { isDragging: false } }));
            window.dispatchEvent(new CustomEvent('whiteboard-external-drag', { detail: { isDragging: false } }));
          } else if (event.payload.type === 'drop') {
            // Files were dropped - hide all indicators
            window.dispatchEvent(new CustomEvent('sidebar-external-drag', { detail: { isDragging: false } }));
            window.dispatchEvent(new CustomEvent('whiteboard-external-drag', { detail: { isDragging: false } }));

            const dropPosition = event.payload.position;
            const filePaths = event.payload.paths;

            if (dropPosition) {
              // Check if drop is over the sidebar
              const sidebarElement = document.querySelector('.sidebar-content');
              if (sidebarElement) {
                const sidebarRect = sidebarElement.getBoundingClientRect();
                const isOverSidebar = (
                  dropPosition.x >= sidebarRect.left &&
                  dropPosition.x <= sidebarRect.right &&
                  dropPosition.y >= sidebarRect.top &&
                  dropPosition.y <= sidebarRect.bottom
                );
                if (isOverSidebar) {
                  if (isDev) console.log('[TAURI DRAG MainUI] Drop is over sidebar, dispatching to sidebar handler');
                  window.dispatchEvent(new CustomEvent('sidebar-external-drop', {
                    detail: { paths: filePaths, position: dropPosition }
                  }));
                  return;
                }
              }

              // Check if drop is over the whiteboard canvas
              const whiteboardElement = document.querySelector('.whiteboard-canvas');
              if (whiteboardElement) {
                const whiteboardRect = whiteboardElement.getBoundingClientRect();
                const isOverWhiteboard = (
                  dropPosition.x >= whiteboardRect.left &&
                  dropPosition.x <= whiteboardRect.right &&
                  dropPosition.y >= whiteboardRect.top &&
                  dropPosition.y <= whiteboardRect.bottom
                );
                if (isOverWhiteboard) {
                  if (isDev) console.log('[TAURI DRAG MainUI] Drop is over whiteboard, dispatching to whiteboard handler');
                  window.dispatchEvent(new CustomEvent('whiteboard-external-drop', {
                    detail: { paths: filePaths, position: dropPosition }
                  }));
                  return;
                }
              }
            }
          }
        });
        if (isDev) console.log('[TAURI DRAG MainUI] Event listener registered');
      } catch (err) {
        console.error('[TAURI DRAG MainUI] Failed to setup drag/drop:', err);
      }
    };

    setupTauriDragDrop();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // Debug: Log split view state changes
  useEffect(() => {
    if (isDev) {
      console.log('Split view state changed:', {
        splitView,
        leftPaneFiles: leftPaneFiles.length,
        rightPaneFiles: rightPaneFiles.length,
        leftPaneTab,
        rightPaneTab
      });
    }
  }, [splitView, leftPaneFiles, rightPaneFiles, leftPaneTab, rightPaneTab]);

  // Load session from localStorage on mount
  useEffect(() => {
    try {
      const savedSession = localStorage.getItem('teamEditorSession');
      if (savedSession) {
        const session = JSON.parse(savedSession);
        if (isDev) console.log('📂 Restoring team session:', session);

        if (session.splitView) {
          // Restore split view
          setSplitView(true);
          setLeftPaneFiles(session.leftPaneFiles || []);
          setRightPaneFiles(session.rightPaneFiles || []);
          setLeftPaneTab(session.leftPaneTab || 'graph');
          setRightPaneTab(session.rightPaneTab || 'graph');
          setActivePane(session.activePane || 'left');
          // Restore graph visibility for split view
          if (session.leftPaneShowGraph !== undefined) setLeftPaneShowGraph(session.leftPaneShowGraph);
          if (session.rightPaneShowGraph !== undefined) setRightPaneShowGraph(session.rightPaneShowGraph);
          // Restore graph tab indices for split view
          if (session.leftPaneGraphIndex !== undefined) setLeftPaneGraphIndex(session.leftPaneGraphIndex);
          if (session.rightPaneGraphIndex !== undefined) setRightPaneGraphIndex(session.rightPaneGraphIndex);
        } else {
          // Restore single pane
          setOpenFiles(session.openFiles || []);
          setActiveTab(session.activeTab || 'graph');
          // Restore showGraphTab state (default to true if not saved)
          if (session.showGraphTab !== undefined) setShowGraphTab(session.showGraphTab);
          // Restore graph tab index
          if (session.graphTabIndex !== undefined) setGraphTabIndex(session.graphTabIndex);
        }

        // Restore sidebar width if saved
        if (session.sidebarWidth) {
          setSidebarWidth(session.sidebarWidth);
        }

        setSessionLoaded(true);
      } else {
        setSessionLoaded(true);
      }
    } catch (error) {
      console.error('Failed to restore team session:', error);
      setSessionLoaded(true);
    }
  }, []);

  // Save session to localStorage whenever tabs change (debounced for performance)
  useEffect(() => {
    // Don't save until we've loaded the session
    if (!sessionLoaded) return;

    const timeoutId = setTimeout(() => {
      const session = {
        splitView,
        openFiles,
        activeTab,
        showGraphTab,
        graphTabIndex,
        leftPaneFiles,
        rightPaneFiles,
        leftPaneTab,
        rightPaneTab,
        activePane,
        sidebarWidth,
        leftPaneShowGraph,
        rightPaneShowGraph,
        leftPaneGraphIndex,
        rightPaneGraphIndex
      };

      if (isDev) console.log('💾 Saving team session:', session);
      localStorage.setItem('teamEditorSession', JSON.stringify(session));
    }, 500); // Debounce: wait 500ms after last change before saving

    return () => clearTimeout(timeoutId);
  }, [sessionLoaded, splitView, openFiles, activeTab, showGraphTab, graphTabIndex, leftPaneFiles, rightPaneFiles, leftPaneTab, rightPaneTab, activePane, sidebarWidth, leftPaneShowGraph, rightPaneShowGraph, leftPaneGraphIndex, rightPaneGraphIndex]);

  // Load user's teams on mount
  useEffect(() => {
    loadTeams();
  }, [user.email]);

  // Sync user profile changes to all teams (displayName, avatar)
  // This runs separately from loadTeams so profile updates sync immediately
  useEffect(() => {
    if (!teams.length || !user.email) return;

    const userEmailLower = user.email.toLowerCase();
    let hasChanges = false;

    // Check if any team member data needs updating
    teams.forEach(team => {
      const member = team.members[userEmailLower];
      if (member) {
        const needsUpdate =
          (user.displayName && member.displayName !== user.displayName) ||
          (user.photoURL && member.photoURL !== user.photoURL) ||
          (user.customAvatar && member.customAvatar !== user.customAvatar);

        if (needsUpdate) {
          hasChanges = true;
          // Update Firestore
          updateMemberProfile(team.id, user.email, user.displayName, user.photoURL, user.customAvatar);
          // Update local state
          if (user.displayName) member.displayName = user.displayName;
          if (user.photoURL) member.photoURL = user.photoURL;
          if (user.customAvatar) member.customAvatar = user.customAvatar;
        }
      }
    });

    // Trigger re-render if changes were made
    if (hasChanges) {
      setTeams([...teams]);
      // Also update selectedTeam if it exists
      if (selectedTeam) {
        const updatedTeam = teams.find(t => t.id === selectedTeam.id);
        if (updatedTeam) {
          setSelectedTeam({ ...updatedTeam });
        }
      }
    }
  }, [user.displayName, user.customAvatar, user.photoURL, teams.length]);

  const loadTeams = async () => {
    try {
      setLoading(true);
      if (isDev) console.log('🔄 Loading teams for user:', user.email);

      // First, check for pending invitations and auto-accept them
      try {
        const pendingInvites = await getPendingInvites(user.email);
        if (pendingInvites.length > 0) {
          if (isDev) console.log(`📨 Found ${pendingInvites.length} pending invitation(s) for ${user.email}`);

          // Auto-accept all pending invitations
          for (const invite of pendingInvites) {
            try {
              if (isDev) console.log(`✅ Auto-accepting invite to team "${invite.teamName}" as ${invite.role || 'member'}...`);
              await acceptTeamInvite(invite.teamId, user.email, user.displayName || user.email, user.photoURL);
              if (isDev) console.log(`🎉 Successfully joined team "${invite.teamName}" as ${invite.role || 'member'}`);
            } catch (acceptError) {
              console.error(`❌ Failed to accept invite to team ${invite.teamName}:`, acceptError);
            }
          }
        }
      } catch (inviteError) {
        console.error('⚠️ Error checking pending invites:', inviteError);
        // Continue loading teams even if invite check fails
      }

      const userTeams = await getUserTeams(user.email);
      if (isDev) console.log('✅ Loaded teams:', userTeams);
      const userEmailLower = user.email.toLowerCase();
      if (isDev) console.log('📋 Team details:', userTeams.map(t => ({
        name: t.name,
        driveFolderId: t.driveFolderId,
        createdBy: t.createdBy,
        createdAt: t.createdAt,
        members: Object.keys(t.members),
        yourRole: t.members[userEmailLower]?.role,
        yourJoinedAt: t.members[userEmailLower]?.joinedAt
      })));
      // Sync user's current profile (photoURL, displayName, customAvatar) to all their teams
      // This ensures profile info is shown even for existing members
      // Also update the local state immediately so we don't wait for Firestore
      const userEmailLowerForSync = user.email.toLowerCase();
      if (user.photoURL || user.displayName || user.customAvatar) {
        userTeams.forEach(team => {
          // Update Firestore
          updateMemberProfile(team.id, user.email, user.displayName, user.photoURL, user.customAvatar);
          // Also update local state immediately
          if (team.members[userEmailLowerForSync]) {
            if (user.displayName) team.members[userEmailLowerForSync].displayName = user.displayName;
            if (user.photoURL) team.members[userEmailLowerForSync].photoURL = user.photoURL;
            if (user.customAvatar) team.members[userEmailLowerForSync].customAvatar = user.customAvatar;
          }
        });
      }
      setTeams(userTeams);

      // Check for pending upgrade team (stored in localStorage before Stripe redirect)
      // This is more reliable than URL params in Tauri apps
      const pendingUpgradeTeamId = localStorage.getItem('pendingUpgradeTeamId');
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get('session_id');
      const teamIdFromUrl = urlParams.get('team');

      // Comprehensive logging for debugging payment flow
      if (isDev) {
        console.log('🔄 Team Selection Debug:', {
          pendingUpgradeTeamId,
          teamIdFromUrl,
          sessionId: sessionId ? 'present' : 'none',
          redirectAlreadyProcessed: redirectProcessedRef.current,
          availableTeams: userTeams.map(t => ({ id: t.id, name: t.name })),
          currentURL: window.location.href,
        });
      }

      // Prefer localStorage (more reliable in Tauri), then URL param
      const targetTeamId = pendingUpgradeTeamId || teamIdFromUrl;

      // Only process redirect once (prevents double-processing in React Strict Mode)
      if (targetTeamId && userTeams.length > 0 && !redirectProcessedRef.current) {
        // Mark as processed BEFORE making changes
        redirectProcessedRef.current = true;

        // Select team from stored ID or URL parameter (Stripe redirect case)
        const targetTeam = userTeams.find(t => t.id === targetTeamId);
        if (targetTeam) {
          if (isDev) console.log('✅ REDIRECT: Selecting team:', targetTeam.name, '(ID:', targetTeam.id, ', source:', pendingUpgradeTeamId ? 'localStorage' : 'URL', ')');
          setSelectedTeam(targetTeam);

          // Clean up: remove stored team ID and team URL param AFTER selecting
          // NOTE: Keep session_id in URL so the billing effect can verify the payment
          if (pendingUpgradeTeamId) {
            localStorage.removeItem('pendingUpgradeTeamId');
            if (isDev) console.log('🧹 Cleared pendingUpgradeTeamId from localStorage');
          }
          if (teamIdFromUrl) {
            const url = new URL(window.location.href);
            url.searchParams.delete('team');
            // Keep session_id - it will be cleared by billing effect after verification
            window.history.replaceState({}, '', url.toString());
            if (isDev) console.log('🧹 Cleared team param (keeping session_id for payment verification)');
          }
        } else {
          if (isDev) console.log('⚠️ Team from redirect not found, selecting first team. Target ID:', targetTeamId);
          // Clean up the invalid stored ID
          if (pendingUpgradeTeamId) {
            localStorage.removeItem('pendingUpgradeTeamId');
          }
          setSelectedTeam(userTeams[0]);
        }
      } else if (redirectProcessedRef.current) {
        // Already processed a redirect - skip ALL team selection to let React state settle
        // This prevents the second Strict Mode call from overriding our selection
        if (isDev) console.log('⏭️ Redirect already processed, skipping team selection (letting state settle)');
        return; // Exit early - don't touch team selection
      } else if (userTeams.length > 0) {
        // Check localStorage FIRST - this handles newly created teams
        // (localStorage is set before loadTeams() runs, but React state update is async)
        const lastSelectedTeamId = localStorage.getItem('lastSelectedTeamId');

        if (lastSelectedTeamId) {
          const lastTeam = userTeams.find(t => t.id === lastSelectedTeamId);
          if (lastTeam) {
            // Check if this is different from current selection (newly created team)
            if (!selectedTeam || selectedTeam.id !== lastSelectedTeamId) {
              if (isDev) console.log('📌 Selecting team from localStorage:', lastTeam.name);
              setSelectedTeam(lastTeam);
            } else if (selectedTeam) {
              // Same team, just update with fresh data
              if (isDev) console.log('📌 Updating selected team with fresh data:', lastTeam.name);
              setSelectedTeam(lastTeam);
            }
          } else if (selectedTeam) {
            // localStorage team not found, but we have a selected team - update it
            const updatedTeam = userTeams.find(t => t.id === selectedTeam.id);
            if (updatedTeam) {
              if (isDev) console.log('📌 Updating selected team with fresh data:', updatedTeam.name);
              setSelectedTeam(updatedTeam);
            } else {
              // Selected team no longer exists, select first team
              if (isDev) console.log('📌 Selected team not found, selecting first team:', userTeams[0].name);
              setSelectedTeam(userTeams[0]);
            }
          } else {
            // localStorage team not found and no selected team, select first team
            if (isDev) console.log('📌 Last selected team not found, selecting first team:', userTeams[0].name);
            setSelectedTeam(userTeams[0]);
          }
        } else if (selectedTeam) {
          // No localStorage, but we have a selected team - update it with fresh data
          const updatedTeam = userTeams.find(t => t.id === selectedTeam.id);
          if (updatedTeam) {
            if (isDev) console.log('📌 Updating selected team with fresh data:', updatedTeam.name);
            setSelectedTeam(updatedTeam);
          } else {
            // Selected team no longer exists, select first team
            if (isDev) console.log('📌 Selected team not found, selecting first team:', userTeams[0].name);
            setSelectedTeam(userTeams[0]);
          }
        } else {
          // No localStorage and no selected team, select first team
          if (isDev) console.log('📌 Auto-selecting first team:', userTeams[0].name);
          setSelectedTeam(userTeams[0]);
        }
      } else if (userTeams.length === 0) {
        // If no teams, show create team modal directly
        if (isDev) console.log('ℹ️ No teams found, showing create team modal');
        setShowCreateTeamModal(true);
      }
    } catch (error) {
      console.error('❌ Failed to load teams:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initialize storage backend when team is selected
  useEffect(() => {
    if (selectedTeam && selectedTeam.id) {
      // Use team ID for Firebase Storage (driveFolderId now equals teamId for new teams)
      const storageId = selectedTeam.driveFolderId || selectedTeam.id;

      // Only reinitialize if the storage ID actually changed
      if (storageBackend?.rootFolderId !== storageId) {
        if (isDev) {
          console.log('✅ Initializing team storage with Firebase Cloud Storage...');
          console.log('📁 Team:', selectedTeam.name);
          console.log('📁 Storage ID:', storageId);
        }

        try {
          const backend = getTeamDriveStorage(storageId);
          setStorageBackend(backend);
          loadFileTree(backend);
        } catch (error) {
          console.error('❌ Failed to initialize storage backend:', error);
        }
      }
    }
  }, [selectedTeam?.id, selectedTeam?.driveFolderId]);

  // Persist selected team ID to localStorage for page refresh persistence
  useEffect(() => {
    if (selectedTeam && selectedTeam.id) {
      localStorage.setItem('lastSelectedTeamId', selectedTeam.id);
      if (isDev) console.log('💾 Saved lastSelectedTeamId:', selectedTeam.id, '(', selectedTeam.name, ')');
    }
  }, [selectedTeam?.id]);

  // Subscribe to team notifications from Firestore
  useEffect(() => {
    if (!selectedTeam?.id || !user?.email) {
      setNotifications([]);
      return;
    }

    const unsubscribe = subscribeToNotifications(
      selectedTeam.id,
      user.email,
      (teamNotifications: TeamNotification[]) => {
        // Convert TeamNotification to the Notification type expected by NotificationsPanel
        const converted: Notification[] = teamNotifications.map(n => {
          // Map notification types
          let type: Notification['type'] = 'mention';
          if (n.type === 'mention') type = 'mention';
          else if (n.type === 'reply') type = 'reply';
          else if (n.type === 'message') type = 'message';
          else if (n.type === 'group_invite' || n.type === 'group_added') type = 'group_invite';
          else if (n.type === 'todo_assigned') type = 'todo_assigned';
          else if (n.type === 'member_joined') type = 'member_joined';
          else if (n.type === 'billing_updated' || n.type === 'billing_warning') type = 'billing_updated';

          // Determine the link type
          let link: Notification['link'] | undefined;
          if (n.channelId) {
            link = { type: 'chat' as const, id: n.channelId };
          } else if (n.todoId) {
            link = { type: 'todo' as const, id: n.todoId };
          }

          return {
            id: n.id,
            type,
            title: n.title,
            message: n.message,
            timestamp: n.createdAt,
            read: n.read,
            link,
          };
        });
        setNotifications(converted);
      },
      (error) => {
        console.error('Error subscribing to notifications:', error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [selectedTeam?.id, user?.email]);

  // Subscribe to call state for persistent floating widget
  useEffect(() => {
    const unsubscribe = subscribeToCallState((callState) => {
      setGlobalCallState(callState);

      // Sync channel info from active call
      if (callState.activeCall) {
        const channelId = callState.activeCall.channelId;
        setGlobalCallChannelId(channelId);
        // Set a default channel name based on the channel ID pattern
        if (channelId.startsWith('meeting_')) {
          setGlobalCallChannelName('Meeting');
        } else {
          // For DM/group calls, keep existing name or set default
          setGlobalCallChannelName(prevName => prevName || 'Call');
        }
      } else {
        // Clear channel info and collapse meeting overlay when call ends
        setGlobalCallChannelId(null);
        setGlobalCallChannelName(null);
        setMeetingCallExpanded(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Subscribe to incoming calls (global - works regardless of which tab is active)
  useEffect(() => {
    if (!selectedTeam?.id || !user.email) {
      return;
    }

    const unsubscribe = subscribeToIncomingCalls(
      selectedTeam.id,
      user.email,
      () => {
        // Callback is optional - incomingCall state is managed globally via callState
      }
    );

    return () => {
      unsubscribe();
    };
  }, [selectedTeam?.id, user.email]);

  // Get incoming call from global call state
  const incomingCall = globalCallState?.incomingCall || null;

  // Handle answering an incoming call
  const handleAnswerIncomingCall = useCallback(async () => {
    if (!incomingCall) return;

    try {
      await answerCall(incomingCall, user.email, user.displayName || user.email.split('@')[0]);

      // Navigate to the chat and the call's channel
      if (splitView) {
        setLeftPaneTab('special://chat');
      } else {
        setActiveTab('special://chat');
      }
      setNavigateToChannelId(incomingCall.channelId);
    } catch (error) {
      console.error('Failed to answer call:', error);
    }
  }, [incomingCall, user.email, user.displayName, splitView]);

  // Handle declining an incoming call
  const handleDeclineIncomingCall = useCallback(async () => {
    if (!incomingCall) return;

    try {
      await declineCall(incomingCall, user.email);
    } catch (error) {
      console.error('Failed to decline call:', error);
    }
  }, [incomingCall, user.email]);

  // Subscribe to team recordings for badge count and whiteboard
  useEffect(() => {
    if (!selectedTeam?.id) {
      setNewRecordingsCount(0);
      setTeamRecordings([]);
      return;
    }

    const unsubscribe = subscribeToTeamRecordings(
      selectedTeam.id,
      (recordings: Recording[]) => {
        // Store recordings list for whiteboard
        setTeamRecordings(recordings);

        // Count recordings created after last viewed timestamp
        const lastViewed = lastViewedRecordingsRef.current;
        const newCount = recordings.filter(r => {
          const recordingTime = r.createdAt instanceof Date
            ? r.createdAt.getTime()
            : new Date(r.createdAt).getTime();
          return recordingTime > lastViewed && r.status === 'completed';
        }).length;
        setNewRecordingsCount(newCount);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [selectedTeam?.id]);

  // Subscribe to team todos for whiteboard
  useEffect(() => {
    if (!selectedTeam?.id) {
      setTeamTodos([]);
      return;
    }

    const unsubscribe = subscribeToTodos(
      selectedTeam.id,
      (todos: TeamTodo[]) => {
        setTeamTodos(todos);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [selectedTeam?.id]);

  // Subscribe to unread message counts for all channels (runs regardless of which tab is active)
  useEffect(() => {
    if (!selectedTeam?.id || !user?.email) {
      setUnreadMessageCount(0);
      return;
    }

    const teamId = selectedTeam.id;
    const currentUserEmail = user.email;
    const members = selectedTeam.members || {};
    let unsubscribeChannels: (() => void) | null = null;
    let unsubscribeUnread: (() => void) | null = null;

    // Subscribe to channels to get group chats
    unsubscribeChannels = subscribeToChannels(
      teamId,
      (channels) => {
        // Generate DM channel IDs for all other team members
        const otherMembers = Object.keys(members).filter(email => email.toLowerCase() !== currentUserEmail.toLowerCase());
        const dmChannelIds = otherMembers.map(email => generateDMChannelId(currentUserEmail, email));

        // Get group channel IDs
        const groupChannelIds = channels.filter(c => c.type === 'group').map(c => c.id);

        // Combine all channel IDs
        const allChannelIds = [...dmChannelIds, ...groupChannelIds];

        if (allChannelIds.length === 0) {
          setUnreadMessageCount(0);
          return;
        }

        // Unsubscribe from previous unread subscription if exists
        if (unsubscribeUnread) {
          unsubscribeUnread();
        }

        // Subscribe to unread counts for all channels
        unsubscribeUnread = subscribeToUnreadCounts(
          teamId,
          currentUserEmail,
          allChannelIds,
          (counts) => {
            const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
            setUnreadMessageCount(total);
          }
        );
      }
    );

    return () => {
      if (unsubscribeChannels) {
        unsubscribeChannels();
      }
      if (unsubscribeUnread) {
        unsubscribeUnread();
      }
    };
  }, [selectedTeam?.id, selectedTeam?.members, user?.email]);

  // Subscribe to whiteboards for sidebar display
  useEffect(() => {
    if (!selectedTeam?.id) {
      setWhiteboards([]);
      setActiveWhiteboardId(null);
      return;
    }

    const unsubscribe = subscribeToWhiteboards(selectedTeam.id, (wbs) => {
      setWhiteboards(wbs);
      // Auto-select first whiteboard if none selected and whiteboards exist
      if (!activeWhiteboardId && wbs.length > 0) {
        setActiveWhiteboardId(wbs[0].id);
      }
    });

    return () => unsubscribe();
  }, [selectedTeam?.id]);

  // Subscribe to team member profile changes in real-time
  useEffect(() => {
    if (!selectedTeam?.id) {
      return;
    }

    const teamDocRef = doc(db, 'teams', selectedTeam.id);
    const unsubscribe = onSnapshot(
      teamDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const teamData = snapshot.data();

          // Decode and normalize member keys (Firestore uses encoded keys like user_AT_example_DOT_com)
          const decodedMembers: { [email: string]: TeamMember } = {};
          if (teamData.members) {
            Object.entries(teamData.members).forEach(([encodedEmail, member]: [string, any]) => {
              const email = decodeEmailKey(encodedEmail);
              const normalizedEmail = email.toLowerCase();
              decodedMembers[normalizedEmail] = {
                ...member,
                email: member.email || email,
                joinedAt: member.joinedAt?.toDate?.() || member.joinedAt,
              };
            });
          }

          // Update the selected team with fresh member data
          setSelectedTeam((prevTeam) => {
            if (!prevTeam) return null;

            return {
              ...prevTeam,
              members: decodedMembers,
            };
          });

          // Also update in the teams list
          setTeams((prevTeams) =>
            prevTeams.map((team) =>
              team.id === selectedTeam.id
                ? { ...team, members: decodedMembers }
                : team
            )
          );
        }
      },
      (error) => {
        console.error('Error listening to team member changes:', error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [selectedTeam?.id]);

  // Handler for when TeamChatPanel reports call state changes
  const handleCallStateChange = useCallback((callState: CallState, channelId: string | null, channelName: string | null) => {
    setGlobalCallState(callState);
    setGlobalCallChannelId(channelId);
    setGlobalCallChannelName(channelName);
  }, []);

  // Expand the call overlay from floating widget
  const handleExpandCall = useCallback(() => {
    if (globalCallChannelId) {
      // Check if this is a meeting call (standalone, not tied to chat)
      if (globalCallChannelId.startsWith('meeting_')) {
        // Just expand the meeting overlay (stays on current tab)
        setMeetingCallExpanded(true);
      } else {
        // For regular chat calls, navigate to the chat view
        if (splitView) {
          setLeftPaneTab('special://chat');
        } else {
          setActiveTab('special://chat');
        }
        // Set viewing channel to call's channel so floating widget hides
        setActiveViewingChannelId(globalCallChannelId);
        // Tell TeamChatPanel to navigate to this specific channel
        setNavigateToChannelId(globalCallChannelId);
      }
    }
  }, [globalCallChannelId, splitView]);

  // Handler for when chat panel reports active channel changes
  const handleActiveChannelChange = useCallback((channelId: string | null) => {
    setActiveViewingChannelId(channelId);
  }, []);

  // Clear navigation request after TeamChatPanel has navigated
  const handleNavigationComplete = useCallback(() => {
    setNavigateToChannelId(null);
  }, []);

  // Handler for when meeting call is started from TeamTodoPanel
  const handleMeetingCallStarted = useCallback(() => {
    // Automatically expand the meeting overlay when a meeting call starts
    setMeetingCallExpanded(true);
  }, []);

  // Handler for minimizing the meeting call overlay
  const handleMeetingCallMinimize = useCallback(() => {
    setMeetingCallExpanded(false);
  }, []);

  // Clear navigateToChannelId when user leaves chat tab
  // This prevents auto-navigation when they return to chat later
  useEffect(() => {
    const isOnChatTab = splitView
      ? (leftPaneTab === 'special://chat' || rightPaneTab === 'special://chat')
      : activeTab === 'special://chat';

    if (!isOnChatTab && navigateToChannelId) {
      setNavigateToChannelId(null);
    }
  }, [activeTab, leftPaneTab, rightPaneTab, splitView, navigateToChannelId]);

  // Check member billing access level when team changes
  useEffect(() => {
    if (!selectedTeam || !user?.email) {
      setMemberAccessLevel('full');
      setGracePeriodDays(0);
      return;
    }

    // Find member in the team
    const memberEmailKey = user.email.toLowerCase().replace('.', '_DOT_').replace('@', '_AT_');
    const member = selectedTeam.members[memberEmailKey] || selectedTeam.members[user.email.toLowerCase()];

    if (member) {
      const accessLevel = getMemberAccessLevel(member as TeamMember);
      setMemberAccessLevel(accessLevel);

      if (accessLevel === 'grace') {
        const daysRemaining = getGracePeriodDaysRemaining(member as TeamMember);
        setGracePeriodDays(daysRemaining);
      } else {
        setGracePeriodDays(0);
      }

      if (isDev) {
        console.log(`👤 Member access level for ${user.email}:`, accessLevel,
          accessLevel === 'grace' ? `(${getGracePeriodDaysRemaining(member as TeamMember)} days left)` : '');
      }
    } else {
      // Not found in members - might be an issue
      setMemberAccessLevel('full');
      setGracePeriodDays(0);
    }
  }, [selectedTeam, user?.email]);

  // Check if current user is team owner
  // Check both createdBy field and member role for robustness
  const userEmailLower = user?.email?.toLowerCase();
  const isTeamOwner = selectedTeam && userEmailLower ?
    (selectedTeam.createdBy?.toLowerCase() === userEmailLower ||
     selectedTeam.members?.[userEmailLower]?.role === 'owner') : false;

  // Get current user's team role (for passing to child components)
  // Prioritize createdBy check for owner, then fall back to member lookup
  const currentUserTeamRole: 'owner' | 'admin' | 'leader' | 'member' = selectedTeam && userEmailLower ?
    (selectedTeam.createdBy?.toLowerCase() === userEmailLower ? 'owner' :
     selectedTeam.members?.[userEmailLower]?.role || 'member') : 'member';

  // Initialize billing and load storage usage when team is selected
  useEffect(() => {
    if (selectedTeam && selectedTeam.id && user) {
      const initBillingAndLoadUsage = async () => {
        try {
          // Initialize billing if needed (for team owner)
          const userRole = selectedTeam.members[user.email.toLowerCase()]?.role;
          if (userRole === 'owner') {
            await initializeTeamBilling(selectedTeam.id, user.uid, user.email);

            // Check if returning from Stripe checkout
            const urlParams = new URLSearchParams(window.location.search);
            const sessionId = urlParams.get('session_id');
            if (sessionId) {
              if (isDev) {
                console.log('💳 === PAYMENT VERIFICATION ===');
                console.log('💳 Team:', selectedTeam.name, '(ID:', selectedTeam.id, ')');
                console.log('💳 Session ID:', sessionId);
                console.log('💳 Verifying checkout session...');
              }
              const success = await handlePaymentSuccess(selectedTeam.id);
              if (success) {
                if (isDev) console.log('✅ Payment verified successfully! Subscription is now active.');
                setSubscriptionStatus('active'); // Immediately update status
              } else {
                if (isDev) console.log('⚠️ Payment verification returned false');
              }

              // Clear session_id from URL after verification attempt
              const url = new URL(window.location.href);
              url.searchParams.delete('session_id');
              window.history.replaceState({}, '', url.toString());
              if (isDev) console.log('🧹 Cleared session_id from URL after verification');
            }
          }

          // Check if team owner is an internal user (auto-pro)
          const ownerEmail = selectedTeam.createdBy;
          const isInternalTeam = isInternalProEmail(ownerEmail);

          if (isInternalTeam) {
            // Internal teams always have pro access
            if (isDev) console.log(`🎁 Internal team detected (${ownerEmail}), granting pro access`);
            setSubscriptionStatus('active');
          } else {
            // First, read the billing status directly from Firestore
            // This is more reliable than the sync cloud function
            const billing = await getTeamBilling(selectedTeam.id);
            if (isDev) console.log('📊 Team billing from Firestore:', billing);

            if (billing?.subscription?.status) {
              if (isDev) console.log(`✅ Setting subscription status from Firestore: ${billing.subscription.status}`);
              setSubscriptionStatus(billing.subscription.status);
            } else {
              // Fallback to sync if no billing data yet
              if (isDev) console.log('🔄 No billing data, trying sync...');
              try {
                const syncResult = await syncSubscriptionStatus(selectedTeam.id);
                setSubscriptionStatus(syncResult.status);
              } catch (syncError) {
                console.error('Sync failed:', syncError);
                setSubscriptionStatus('free');
              }
            }
          }

          // Load storage usage
          const usage = await getTeamStorageUsage(selectedTeam.id);
          setStorageUsage(usage);
          if (isDev) console.log('📊 Storage usage loaded:', usage);

          // Reset banner dismissal when switching teams
          setStorageBannerDismissed(false);
        } catch (error) {
          console.error('❌ Failed to load storage usage:', error);
        }
      };

      initBillingAndLoadUsage();
    }
  }, [selectedTeam?.id, user?.uid]);

  // Check for promo status and auto-apply partner promo
  useEffect(() => {
    if (!selectedTeam || !user) return;

    const checkAndApplyPromo = async () => {
      try {
        // Check for active promo
        const promoInfo = await getPromoStatusFromBilling(selectedTeam.id);
        setActivePromo(promoInfo);

        if (promoInfo) {
          if (isDev) console.log(`🎁 Active promo found: ${promoInfo.type}, ${promoInfo.daysRemaining} days remaining`);
        }

        // Check if team owner is an internal user (auto-pro access)
        const ownerEmail = selectedTeam.createdBy;
        const isInternalTeam = isInternalProEmail(ownerEmail);

        // Check if user is partner and team owner, and team doesn't have a promo yet
        // Skip partner promo for internal users - they already have pro access
        const userRole = selectedTeam.members[user.email.toLowerCase()]?.role;
        if (isPartnerUser && partnerInfo && userRole === 'owner' && !promoInfo && !partnerPromoApplied && !isInternalTeam) {
          if (isDev) console.log(`🤝 Partner user detected, checking if promo can be applied...`);

          // Check if team already has any promo redemption
          const hasPromo = await teamHasActivePromo(selectedTeam.id);
          if (!hasPromo) {
            if (isDev) console.log(`🎉 Auto-applying partner promo for ${partnerInfo.partnerName}...`);
            const result = await redeemPartnerPromo(selectedTeam.id);
            if (result.success) {
              if (isDev) console.log(`✅ Partner promo applied: ${result.partnerName}`);
              setPartnerPromoApplied(true);
              // Refresh promo status
              const newPromoInfo = await getPromoStatusFromBilling(selectedTeam.id);
              setActivePromo(newPromoInfo);
            }
          }
        }

        // Determine read-only mode: over 2GB + no active promo + no active subscription
        const billing = await getTeamBilling(selectedTeam.id);
        const isOverLimit = (billing?.storageUsedBytes || 0) > (2 * 1024 * 1024 * 1024); // 2GB
        const hasActiveAccess = promoInfo !== null || billing?.subscription?.status === 'active' || isInternalTeam;
        setIsReadOnlyMode(isOverLimit && !hasActiveAccess);
      } catch (error) {
        console.error('Error checking promo status:', error);
      }
    };

    checkAndApplyPromo();
  }, [selectedTeam?.id, user?.email, isPartnerUser, partnerInfo, partnerPromoApplied]);

  // Debounce ref for loadFileTree
  const loadFileTreeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingFileTreeRef = useRef(false);

  const loadFileTree = async (backend?: TeamDriveStorage) => {
    const backendToUse = backend || storageBackend;
    if (!backendToUse) {
      console.error('❌ Cannot load file tree - storage backend not initialized');
      setFolderAccessStatus({
        hasAccess: false,
        loading: false,
        message: 'Storage backend not initialized'
      });
      return;
    }

    // Prevent concurrent calls
    if (isLoadingFileTreeRef.current) {
      if (isDev) console.log('⏳ File tree load already in progress, skipping...');
      return;
    }

    isLoadingFileTreeRef.current = true;
    setFolderAccessStatus({ hasAccess: true, loading: true, message: 'Loading files...' });

    if (isDev) {
      console.log('🔄 Loading file tree from Firebase Storage...');
      console.log('📁 Team ID:', selectedTeam?.id);
      console.log('👤 Current user:', user.email);
      console.log('👥 User role in team:', selectedTeam?.members?.[user.email.toLowerCase()]?.role);
    }

    try {
      const tree = await backendToUse.getFileTree();
      // Filter out chat-attachments folder from the visible file tree
      const filteredTree = tree.filter(node => node.name !== 'chat-attachments');
      setFileTree(filteredTree);
      if (isDev) console.log(`✅ Loaded ${filteredTree.length} items from Firebase Storage:`, filteredTree);

      if (filteredTree.length === 0) {
        if (isDev) console.log('📝 Team folder is empty - create your first note to get started!');
        setFolderAccessStatus({
          hasAccess: true,
          loading: false,
          message: 'Folder is empty - create your first note to get started!'
        });
      } else {
        setFolderAccessStatus({
          hasAccess: true,
          loading: false,
          message: `Loaded ${filteredTree.length} items`
        });
      }
    } catch (error) {
      console.error('❌ Failed to load file tree:', error);
      console.error('📊 Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        type: error?.constructor?.name,
      });

      // Check for permission errors
      if (error instanceof Error && error.message.includes('permission')) {
        setFolderAccessStatus({
          hasAccess: false,
          loading: false,
          message: 'Permission denied - please sign out and sign back in',
          issues: ['Firebase Storage permission error']
        });
      } else {
        setFolderAccessStatus({
          hasAccess: false,
          loading: false,
          message: error instanceof Error ? error.message : 'Failed to load files'
        });
      }
    } finally {
      isLoadingFileTreeRef.current = false;
    }
  };

  // Debounced version of loadFileTree for use in callbacks (reserved for future use)
  const _loadFileTreeDebounced = useCallback(() => {
    if (loadFileTreeTimeoutRef.current) {
      clearTimeout(loadFileTreeTimeoutRef.current);
    }
    loadFileTreeTimeoutRef.current = setTimeout(() => {
      loadFileTree();
    }, 300);
  }, [storageBackend]);
  void _loadFileTreeDebounced; // Reserved for rate-limited tree updates

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC - Close help modal
      if (e.key === 'Escape' && activeGuide) {
        e.preventDefault();
        setActiveGuide(null);
        return;
      }

      // Ctrl+W or Cmd+W (Mac) - Close active tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault(); // Prevent browser from closing tab/window

        if (!splitView) {
          // Single pane mode: close active file, special tab, or graph
          if (activeTab === 'graph') {
            // Close graph tab
            setShowGraphTab(false);
            if (openFiles.length > 0) {
              setActiveTab(openFiles[0].path);
            } else {
              setActiveTab('');
            }
          } else if (activeTab.startsWith('special://')) {
            // Close special tab (Todos/Timeline/etc)
            const newFiles = openFiles.filter(f => f.path !== activeTab);
            setOpenFiles(newFiles);
            if (newFiles.length > 0) {
              setActiveTab(newFiles[0].path);
            } else if (showGraphTab) {
              setActiveTab('graph');
            } else {
              setActiveTab('');
            }
          } else {
            // Close regular file
            handleCloseFile(activeTab);
          }
        } else {
          // Split view mode: close active file in active pane
          if (activePane === 'left') {
            if (leftPaneTab === 'graph') {
              // Close graph in left pane
              setLeftPaneShowGraph(false);
              if (leftPaneFiles.length > 0) {
                setLeftPaneTab(leftPaneFiles[0].path);
              } else {
                // No files left, close split view
                handleCloseSplitView(rightPaneFiles, rightPaneTab);
              }
            } else {
              const newFiles = leftPaneFiles.filter(f => f.path !== leftPaneTab);
              if (newFiles.length === 0) {
                handleCloseSplitView(rightPaneFiles, rightPaneTab);
              } else {
                setLeftPaneFiles(newFiles);
                setLeftPaneTab(newFiles[0].path);
              }
            }
          } else if (activePane === 'right') {
            if (rightPaneTab === 'graph') {
              // Close graph in right pane
              setRightPaneShowGraph(false);
              if (rightPaneFiles.length > 0) {
                setRightPaneTab(rightPaneFiles[0].path);
              } else {
                // No files left, close split view
                handleCloseSplitView();
              }
            } else {
              const newFiles = rightPaneFiles.filter(f => f.path !== rightPaneTab);
              if (newFiles.length === 0) {
                handleCloseSplitView();
              } else {
                setRightPaneFiles(newFiles);
                setRightPaneTab(newFiles[0].path);
              }
            }
          }
        }
      }

      // Ctrl+\ or Cmd+\ (Mac) - Toggle split view
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        if (splitView) {
          handleCloseSplitView();
        } else {
          // Open split view: Current content on left, empty right pane
          setSplitView(true);

          // Transfer current state to left pane
          setLeftPaneFiles(openFiles);
          setLeftPaneTab(activeTab);
          // Only show graph in left pane if it was visible in single pane
          setLeftPaneShowGraph(showGraphTab);
          // Right pane starts empty without graph
          setRightPaneShowGraph(false);

          // Right pane: empty with null/empty state
          setRightPaneFiles([]);
          setRightPaneTab(''); // Empty string means no content will render

          setActivePane('left');
          // Clear single pane state
          setOpenFiles([]);
          setActiveTab('graph');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeTab, splitView, activeGuide, activePane, leftPaneTab, rightPaneTab, leftPaneFiles, rightPaneFiles, openFiles, showGraphTab]); // Re-bind when active tab, splitView, or activeGuide changes

  // Handle pane resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingPane && mainContentRef.current) {
        const container = mainContentRef.current;
        const containerRect = container.getBoundingClientRect();
        const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

        // Clamp between 20% and 80% to prevent panels from getting too small
        const clampedWidth = Math.min(Math.max(newLeftWidth, 20), 80);
        setLeftPaneWidth(clampedWidth);
      }
    };

    const handleMouseUp = () => {
      if (isResizingPane) {
        setIsResizingPane(false);
      }
    };

    if (isResizingPane) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingPane]);

  const handleDividerMouseDown = () => {
    setIsResizingPane(true);
  };

  // Handle sidebar resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        const newWidth = e.clientX;
        // Clamp between 100px and 500px
        const clampedWidth = Math.min(Math.max(newWidth, 100), 500);
        setSidebarWidth(clampedWidth);
      }
    };

    const handleMouseUp = () => {
      if (isResizingSidebar) {
        setIsResizingSidebar(false);
      }
    };

    if (isResizingSidebar) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingSidebar]);

  // Global mouse listeners for tab dragging
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!dragStartPos || !draggedTab) {
        return;
      }

      const dx = Math.abs(e.clientX - dragStartPos.x);
      const dy = Math.abs(e.clientY - dragStartPos.y);

      // Set dragging flag once threshold is exceeded
      if ((dx > 5 || dy > 5) && !isDraggingRef.current) {
        if (isDev) console.log('🚀 [TEAM] DRAG START (tab):', draggedTab.fileName);
        setIsDragging(true);
      }
    };

    const handleGlobalMouseUp = () => {
      if (dragStartPos || draggedTab) {
        // Use refs to get the latest values
        const currentIsDragging = isDraggingRef.current;
        const currentDropZone = dropZoneRef.current;

        if (isDev) {
          console.log('🏁 [TEAM] DRAG END (tab)', {
            isDragging: currentIsDragging,
            dropZone: currentDropZone,
            draggedTab: draggedTab?.fileName
          });
        }

        // Only handle cross-pane drop if we're dragging AND over a valid drop zone
        // Note: Tab reordering within the same pane is handled by TabBar's mouseup handler (capture phase)
        if (currentIsDragging && currentDropZone && (currentDropZone === 'left' || currentDropZone === 'right')) {
          if (isDev) console.log('✅ [TEAM] Valid drop - handling on', currentDropZone, 'side');
          handleTabDrop();
        }

        // Reset all drag state
        setDragStartPos(null);
        setDraggedTab(null);
        setDropZone(null);
        setIsDragging(false);
      }
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragStartPos, draggedTab]);

  const handleSelectFile = (filePath: string, fileName: string, pane?: EditorPane) => {

    // Find the file ID from the file tree
    const findFileId = (nodes: any[], targetPath: string): string | undefined => {
      for (const node of nodes) {
        if (node.type === 'file' && node.path === targetPath) {
          return node.id;
        }
        if (node.children) {
          const found = findFileId(node.children, targetPath);
          if (found) return found;
        }
      }
      return undefined;
    };

    const fileId = findFileId(fileTree, filePath);

    if (!splitView) {
      // Single pane mode - use functional update to always get latest state
      setOpenFiles(prevFiles => {
        const existingFile = prevFiles.find(f => f.path === filePath);
        if (existingFile) {
          return prevFiles; // File already open, just return current state
        }
        return [...prevFiles, { path: filePath, name: fileName, id: fileId }];
      });
      setActiveTab(filePath);
    } else {
      // Split view mode - if no pane specified, default to left pane
      const targetPane = pane || 'left';
      const setTargetFiles = targetPane === 'left' ? setLeftPaneFiles : setRightPaneFiles;
      const setTargetTab = targetPane === 'left' ? setLeftPaneTab : setRightPaneTab;

      // Use functional update to always get latest state
      setTargetFiles(prevFiles => {
        const existingFile = prevFiles.find(f => f.path === filePath);
        if (existingFile) {
          return prevFiles; // File already open
        }
        return [...prevFiles, { path: filePath, name: fileName, id: fileId }];
      });
      setTargetTab(filePath);
      setActivePane(targetPane);
    }
  };

  const handleCloseFile = (filePath: string) => {
    const newOpenFiles = openFiles.filter(f => f.path !== filePath);
    setOpenFiles(newOpenFiles);

    // If closing active tab, switch to another tab
    if (activeTab === filePath) {
      if (newOpenFiles.length > 0) {
        setActiveTab(newOpenFiles[newOpenFiles.length - 1].path);
      } else if (showGraphTab) {
        setActiveTab('graph');
      } else {
        setActiveTab(''); // Empty state
      }
    }
  };

  // Handler for selecting a whiteboard from the sidebar
  const handleSelectWhiteboard = (whiteboardId: string) => {
    setActiveWhiteboardId(whiteboardId);
    // Find the whiteboard name
    const wb = whiteboards.find(w => w.id === whiteboardId);
    const wbName = wb?.name || 'Whiteboard';
    // Navigate to whiteboard tab with the whiteboard name
    handleSelectFile('special://whiteboard', wbName);
  };

  // Handler for opening a shared whiteboard from chat
  const handleOpenSharedWhiteboard = (sharedWhiteboard: SharedWhiteboard) => {
    setActiveWhiteboardId(sharedWhiteboard.whiteboardId);
    handleSelectFile('special://whiteboard', sharedWhiteboard.name);
  };

  // Handler for creating a new whiteboard from the sidebar
  // Creates with auto-generated "Untitled", "Untitled (1)", etc. name
  const handleCreateWhiteboardFromSidebar = async () => {
    if (!selectedTeam?.id || !user) return;

    try {
      const newWb = await createUntitledWhiteboard(
        selectedTeam.id,
        user.uid,
        user.displayName || user.email || 'Unknown'
      );
      setActiveWhiteboardId(newWb.id);
      // Navigate to whiteboard tab with the new whiteboard name
      handleSelectFile('special://whiteboard', newWb.name);
    } catch (error) {
      console.error('Failed to create whiteboard:', error);
    }
  };

  const handleStartEditing = (path: string, type: 'rename' | 'new-note' | 'new-folder') => {
    setEditing({ path, type });
  };

  const handleFinishEditing = async (newName?: string) => {
    if (!editing || !newName || newName.trim() === '') {
      setEditing(null);
      return;
    }

    // Prevent concurrent saves
    if (isSavingRef.current) {
      if (isDev) console.log('⚠️ Save already in progress, ignoring duplicate call');
      return;
    }

    isSavingRef.current = true;

    try {
      if (!storageBackend) {
        console.error('Storage backend not initialized');
        setEditing(null);
        return;
      }

      if (editing.type === 'new-note') {
        // Check storage limit before creating
        if (storageUsage && !storageUsage.permissions.canCreateNotes) {
          if (isTeamOwner) {
            alert(`Storage limit exceeded (${storageUsage.usedFormatted} / ${storageUsage.limitFormatted}). Please upgrade or delete files to create new notes.`);
            setShowUpgradeModal(true);
          } else {
            alert(`Storage limit exceeded (${storageUsage.usedFormatted} / ${storageUsage.limitFormatted}). Please ask your team owner to upgrade or delete files to create new notes.`);
          }
          setEditing(null);
          isSavingRef.current = false;
          return;
        }

        // Create a new note file in Google Drive
        const fileName = newName.endsWith('.md') ? newName : `${newName}.md`;
        const initialContent = '';
        const parentFolderId = editing.id; // Google Drive folder ID

        if (isDev) console.log(`📝 Creating note: ${fileName} in folder ID: ${parentFolderId || 'root'}`);

        // Build full path including parent folder
        const parentFolderPath = editing.path; // This is the folder path (e.g., "marketing")
        const fullFilePath = parentFolderPath ? `${parentFolderPath}/${fileName}` : fileName;

        // OPTIMISTIC UPDATE: Add to UI immediately
        const tempNode: FileTreeNode = {
          path: fullFilePath,
          name: fileName,
          type: 'file',
          id: 'temp-' + Date.now() // Temporary ID until we get real one
        };

        // Add to file tree immediately for instant feedback
        if (parentFolderId) {
          // Find parent folder and add to its children
          const addToFolder = (nodes: FileTreeNode[]): FileTreeNode[] => {
            return nodes.map(node => {
              if (node.id === parentFolderId && node.children) {
                return { ...node, children: [...node.children, tempNode] };
              } else if (node.children) {
                return { ...node, children: addToFolder(node.children) };
              }
              return node;
            });
          };
          setFileTree(addToFolder(fileTree));
        } else {
          setFileTree([...fileTree, tempNode]);
        }

        // Pre-cache the content so the file can be opened immediately
        // This avoids race condition where getFile is called before saveFile completes
        storageBackend.preCacheContent(fullFilePath, initialContent);

        // Now save to Google Drive in background (use folder path, not ID)
        storageBackend.saveFile(fileName, initialContent, parentFolderPath, true, user.email).then(async () => {
          if (isDev) console.log(`✅ Created note: ${fileName}`);
          // Sync file tree to get real ID and ensure consistency
          loadFileTree();
          setGraphKey(prev => prev + 1);
          // Refresh storage usage after file creation
          if (selectedTeam) {
            invalidateStorageCache(selectedTeam.id);
            const usage = await getTeamStorageUsage(selectedTeam.id, true);
            setStorageUsage(usage);
          }
        }).catch(error => {
          console.error('Failed to create note:', error);
          // Revert optimistic update on error
          loadFileTree();
          alert(`Failed to create note: ${error.message}`);
        });

        // Open the newly created file immediately (use full path for team storage)
        handleSelectFile(fullFilePath, fileName);
      } else if (editing.type === 'new-folder') {
        // Check storage limit before creating folder
        if (storageUsage && !storageUsage.permissions.canUploadFiles) {
          if (isTeamOwner) {
            alert(`Storage limit exceeded (${storageUsage.usedFormatted} / ${storageUsage.limitFormatted}). Please upgrade or delete files to create new folders.`);
            setShowUpgradeModal(true);
          } else {
            alert(`Storage limit exceeded (${storageUsage.usedFormatted} / ${storageUsage.limitFormatted}). Please ask your team owner to upgrade or delete files to create new folders.`);
          }
          setEditing(null);
          isSavingRef.current = false;
          return;
        }

        // Create a new folder in Google Drive
        const parentFolderId = editing.id; // Google Drive folder ID (for UI tree updates)
        const parentFolderPath = editing.path; // Folder path (e.g., "marketing")
        if (isDev) console.log(`📁 Creating folder: ${newName} in path: ${parentFolderPath || 'root'}`);

        // Build full path including parent folder
        const fullFolderPath = parentFolderPath ? `${parentFolderPath}/${newName}` : newName;

        // OPTIMISTIC UPDATE: Add to UI immediately
        const tempNode: FileTreeNode = {
          path: fullFolderPath,
          name: newName,
          type: 'folder',
          id: 'temp-' + Date.now(),
          children: []
        };

        if (parentFolderId) {
          const addToFolder = (nodes: FileTreeNode[]): FileTreeNode[] => {
            return nodes.map(node => {
              if (node.id === parentFolderId && node.children) {
                return { ...node, children: [...node.children, tempNode] };
              } else if (node.children) {
                return { ...node, children: addToFolder(node.children) };
              }
              return node;
            });
          };
          setFileTree(addToFolder(fileTree));
        } else {
          setFileTree([...fileTree, tempNode]);
        }

        // Now create in Google Drive in background (use folder path, not ID)
        storageBackend.createFolder(newName, parentFolderPath).then(() => {
          if (isDev) console.log(`✅ Created folder: ${newName}`);
          // Sync file tree to get real ID
          loadFileTree();
          setGraphKey(prev => prev + 1);
        }).catch(error => {
          console.error('Failed to create folder:', error);
          // Revert optimistic update on error
          loadFileTree();
          alert(`Failed to create folder: ${error.message}`);
        });
      } else if (editing.type === 'rename') {
        // Rename a file in Google Drive
        const oldFileName = editing.path;
        const newFileName = newName.endsWith('.md') ? newName : `${newName}.md`;

        await storageBackend.renameFile(oldFileName, newFileName);
        if (isDev) console.log(`✅ Renamed: ${oldFileName} -> ${newFileName}`);

        // Update open files if the renamed file is open
        const updatedOpenFiles = openFiles.map(f =>
          f.path === oldFileName ? { path: newFileName, name: newFileName } : f
        );
        setOpenFiles(updatedOpenFiles);

        if (activeTab === oldFileName) {
          setActiveTab(newFileName);
        }

        // Refresh file tree
        await loadFileTree();
      }
    } catch (error) {
      console.error('Failed to finish editing:', error);
      alert(`Failed to ${editing.type.replace('-', ' ')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      isSavingRef.current = false;
      setEditing(null);
    }
  };

  const handleSidebarDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(100, Math.min(500, startWidth + (e.clientX - startX)));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMoveItem = async (sourcePath: string, destinationPath: string) => {
    if (!storageBackend) {
      console.error('Storage backend not initialized');
      return;
    }

    // In team mode, sourcePath is the relative path (e.g., "trials.md" or "folder/note.md")
    // destinationPath is the folder path (e.g., "coaches" or "" for root)
    const destFolder = destinationPath || '';

    if (isDev) console.log(`🔄 Moving "${sourcePath}" to folder "${destFolder || 'root'}"`);

    // OPTIMISTIC UPDATE: Move item in local file tree immediately
    const sourcePathParts = sourcePath.split('/');
    const fileName = sourcePathParts.pop()!;
    const newPath = destFolder ? `${destFolder}/${fileName}` : fileName;

    // Helper to find and remove item from tree
    const removeFromTree = (nodes: FileTreeNode[], pathToRemove: string): { nodes: FileTreeNode[], removed: FileTreeNode | null } => {
      let removed: FileTreeNode | null = null;
      const newNodes = nodes.filter(node => {
        if (node.path === pathToRemove) {
          removed = { ...node, path: newPath }; // Update path for the moved item
          return false;
        }
        return true;
      }).map(node => {
        if (node.children) {
          const result = removeFromTree(node.children, pathToRemove);
          if (result.removed) removed = result.removed;
          return { ...node, children: result.nodes };
        }
        return node;
      });
      return { nodes: newNodes, removed };
    };

    // Helper to add item to destination folder
    const addToTree = (nodes: FileTreeNode[], destPath: string, item: FileTreeNode): FileTreeNode[] => {
      if (!destPath) {
        // Add to root
        return [...nodes, item];
      }
      return nodes.map(node => {
        if (node.path === destPath && node.type === 'folder') {
          return { ...node, children: [...(node.children || []), item] };
        }
        if (node.children) {
          return { ...node, children: addToTree(node.children, destPath, item) };
        }
        return node;
      });
    };

    // Apply optimistic update to file tree
    setFileTree(prevTree => {
      const { nodes: treeWithoutItem, removed } = removeFromTree(prevTree, sourcePath);
      if (removed) {
        // Update the path of the moved item and all its children
        const updatePaths = (node: FileTreeNode, newBasePath: string): FileTreeNode => {
          const updatedNode = { ...node, path: newBasePath };
          if (node.children) {
            updatedNode.children = node.children.map(child => {
              const childNewPath = `${newBasePath}/${child.name}`;
              return updatePaths(child, childNewPath);
            });
          }
          return updatedNode;
        };
        const movedItem = updatePaths(removed, newPath);
        return addToTree(treeWithoutItem, destFolder, movedItem);
      }
      return prevTree;
    });

    // Update graph immediately
    setGraphKey(prev => prev + 1);

    // Now perform the actual move in the background
    try {
      await storageBackend.moveItem(sourcePath, destFolder);
      if (isDev) console.log(`✅ Moved "${sourcePath}" to "${destFolder || 'root'}"`);

      // Sync with backend to get correct IDs (silent refresh)
      loadFileTree();
    } catch (error) {
      console.error('Failed to move item:', error);
      // Revert optimistic update on error by refreshing from backend
      loadFileTree();
    }
  };

  // Handle dropping external files (from OS file explorer) onto folders
  const handleDropExternalFiles = async (files: File[], destinationPath: string) => {
    if (!storageBackend) {
      console.error('Storage backend not initialized');
      return;
    }

    // Calculate total size of files being uploaded
    const totalUploadSize = files.reduce((sum, file) => sum + file.size, 0);
    const formatSize = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };

    // Check for files that exceed the 500MB max file size limit
    const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
    const oversizedFiles = files.filter(f => f.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map(f => `${f.name} (${formatSize(f.size)})`).join('\n');
      alert(`The following files exceed the 500MB limit:\n\n${fileNames}\n\nPlease upload smaller files.`);
      return;
    }

    // Check if upload would exceed storage limit
    if (storageUsage) {
      const currentUsage = storageUsage.usedBytes || 0;
      const limit = storageUsage.limitBytes || 0;
      const remaining = limit - currentUsage;

      if (totalUploadSize > remaining) {
        const message = files.length === 1
          ? `This file is ${formatSize(totalUploadSize)} but you only have ${formatSize(remaining)} remaining.`
          : `These files are ${formatSize(totalUploadSize)} total but you only have ${formatSize(remaining)} remaining.`;

        setStorageWarning({
          show: true,
          message: isTeamOwner
            ? `${message}\n\nUpgrade your plan to add more storage.`
            : `${message}\n\nAsk your team owner to upgrade or delete files.`,
          canUpgrade: isTeamOwner
        });
        return;
      }
    }

    try {
      if (isDev) console.log('📂 Saving external files to:', destinationPath, files.map(f => f.name));

      for (const file of files) {
        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Get content type
        const contentType = file.type || 'application/octet-stream';

        if (isDev) console.log('   💾 Uploading:', file.name, 'to', destinationPath || 'root');

        // Upload binary file to Firebase Storage
        await storageBackend.saveBinaryFile(file.name, uint8Array, contentType, destinationPath || undefined);
      }

      // Refresh the file tree to show the new files
      await loadFileTree();

      if (isDev) console.log('✅ All files uploaded successfully!');
    } catch (error) {
      console.error('❌ Error uploading external files:', error);
      alert(`Failed to upload files: ${error}`);
    }
  };

  // Handle dropping external directories (from OS file explorer) onto folders
  const handleDropExternalDirectory = async (sourcePath: string, destinationPath: string) => {
    if (!storageBackend) {
      console.error('Storage backend not initialized');
      return;
    }

    try {
      if (isDev) console.log('📂 Uploading directory:', sourcePath, 'to:', destinationPath);

      // Get list of all files in the directory with their relative paths
      const fileList = await invoke<[string, string][]>('list_directory_files', { dirPath: sourcePath });

      if (isDev) console.log('📂 Found', fileList.length, 'files in directory');

      // Calculate total size for storage limit check
      let totalSize = 0;
      for (const [absolutePath] of fileList) {
        try {
          const size = await invoke<number>('get_file_size', { filePath: absolutePath });
          totalSize += size;
        } catch (err) {
          console.warn('Could not get file size:', absolutePath, err);
        }
      }

      const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      };

      // Check storage limit
      if (storageUsage) {
        const currentUsage = storageUsage.usedBytes || 0;
        const limit = storageUsage.limitBytes || 0;
        const remaining = limit - currentUsage;

        if (totalSize > remaining) {
          const message = `This folder is ${formatSize(totalSize)} but you only have ${formatSize(remaining)} remaining.`;

          setStorageWarning({
            show: true,
            message: isTeamOwner
              ? `${message}\n\nUpgrade your plan to add more storage.`
              : `${message}\n\nAsk your team owner to upgrade or delete files.`,
            canUpgrade: isTeamOwner
          });
          return;
        }
      }

      const mimeTypes: Record<string, string> = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        'pdf': 'application/pdf',
        'txt': 'text/plain',
        'md': 'text/markdown',
      };

      // Upload each file with its relative path
      for (const [absolutePath, relativePath] of fileList) {
        try {
          const fileName = absolutePath.split(/[/\\]/).pop() || 'file';
          const ext = fileName.split('.').pop()?.toLowerCase() || '';
          const mimeType = mimeTypes[ext] || 'application/octet-stream';

          // Read file as binary
          const bytes = await invoke<number[]>('read_binary_file', { filePath: absolutePath });
          const uint8Array = new Uint8Array(bytes);

          // Construct the full destination path including the relative path
          const fullDestPath = destinationPath ? `${destinationPath}/${relativePath}` : relativePath;
          // Get the directory part (without the filename)
          const destDir = fullDestPath.substring(0, fullDestPath.lastIndexOf('/'));

          if (isDev) console.log('   💾 Uploading:', relativePath, 'to:', destDir || 'root');

          // Upload to Firebase Storage
          await storageBackend.saveBinaryFile(fileName, uint8Array, mimeType, destDir || undefined);
        } catch (err) {
          console.error('Failed to upload file:', absolutePath, err);
        }
      }

      // Refresh the file tree
      await loadFileTree();

      if (isDev) console.log('✅ Directory uploaded successfully!');
    } catch (error) {
      console.error('❌ Error uploading directory:', error);
      alert(`Failed to upload folder: ${error}`);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, itemPath: string, itemType: 'file' | 'folder', itemName: string, itemId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      itemPath,
      itemType,
      itemName,
      itemId
    });
  };

  const handleGraphNodeContextMenu = (e: React.MouseEvent, node: any) => {
    e.preventDefault();
    e.stopPropagation();

    // Extract file name from node
    const fileName = node.name + (node.fileType === 'markdown' ? '.md' : '');

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      itemPath: node.path,
      itemType: node.type === 'folder' || node.type === 'root' ? 'folder' : 'file',
      itemName: fileName,
      itemId: node.driveId // Pass Google Drive ID from graph node
    });
  };

  // Whiteboard context menu handlers
  const handleWhiteboardContextMenu = (e: React.MouseEvent, whiteboard: WhiteboardMeta) => {
    e.preventDefault();
    e.stopPropagation();
    setWhiteboardContextMenu({
      x: e.clientX,
      y: e.clientY,
      whiteboard
    });
  };

  const handleWhiteboardRename = async (whiteboardId: string, newName: string) => {
    if (!selectedTeam || !newName.trim()) return;
    try {
      await renameWhiteboard(selectedTeam.id, whiteboardId, newName.trim());
      setWhiteboardRenaming(null);
    } catch (error) {
      console.error('Failed to rename whiteboard:', error);
    }
  };

  const handleWhiteboardDelete = async (whiteboard: WhiteboardMeta) => {
    if (!selectedTeam) return;

    // Close the modal immediately
    setWhiteboardDeleteConfirm(null);

    try {
      await deleteWhiteboard(selectedTeam.id, whiteboard.id);

      // If the deleted whiteboard was active, select the newest remaining whiteboard
      if (activeWhiteboardId === whiteboard.id) {
        // Find the newest whiteboard that isn't the one being deleted
        const remainingWhiteboards = whiteboards
          .filter(wb => wb.id !== whiteboard.id)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

        if (remainingWhiteboards.length > 0) {
          setActiveWhiteboardId(remainingWhiteboards[0].id);
        } else {
          setActiveWhiteboardId(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete whiteboard:', error);
    }
  };

  // Open whiteboard in a new tab (each whiteboard gets unique tab path)
  const handleWhiteboardOpenInTab = (whiteboard: WhiteboardMeta) => {
    const whiteboardPath = `special://whiteboard/${whiteboard.id}`;

    // If this whiteboard is currently displayed in the panel, switch panel to next most recent
    if (activeWhiteboardId === whiteboard.id) {
      // Sort whiteboards by updatedAt descending and find next one
      const sortedWbs = [...whiteboards].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      const nextWb = sortedWbs.find(wb => wb.id !== whiteboard.id);
      if (nextWb) {
        setActiveWhiteboardId(nextWb.id);
      }
    }

    // Open whiteboard tab (single pane mode)
    if (!splitView) {
      // Check if this specific whiteboard tab already exists
      const existingTabIndex = openFiles.findIndex(f => f.path === whiteboardPath);
      if (existingTabIndex < 0) {
        // Add new tab for this whiteboard
        setOpenFiles([...openFiles, { path: whiteboardPath, name: whiteboard.name }]);
      }
      setActiveTab(whiteboardPath);
    } else {
      // In split view, open in the active pane
      if (activePane === 'left') {
        const existingTabIndex = leftPaneFiles.findIndex(f => f.path === whiteboardPath);
        if (existingTabIndex < 0) {
          setLeftPaneFiles([...leftPaneFiles, { path: whiteboardPath, name: whiteboard.name }]);
        }
        setLeftPaneTab(whiteboardPath);
      } else {
        const existingTabIndex = rightPaneFiles.findIndex(f => f.path === whiteboardPath);
        if (existingTabIndex < 0) {
          setRightPaneFiles([...rightPaneFiles, { path: whiteboardPath, name: whiteboard.name }]);
        }
        setRightPaneTab(whiteboardPath);
      }
    }
    setWhiteboardContextMenu(null);
  };

  // Open whiteboard in second pane (split view)
  const handleWhiteboardOpenInSecondPane = (whiteboard: WhiteboardMeta) => {
    const whiteboardPath = `special://whiteboard/${whiteboard.id}`;

    // If this whiteboard is currently displayed in the panel, switch panel to next most recent
    if (activeWhiteboardId === whiteboard.id) {
      const sortedWbs = [...whiteboards].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      const nextWb = sortedWbs.find(wb => wb.id !== whiteboard.id);
      if (nextWb) {
        setActiveWhiteboardId(nextWb.id);
      }
    }

    if (!splitView) {
      // Transfer current files to left pane
      setLeftPaneFiles(openFiles);
      setLeftPaneTab(activeTab);
      setLeftPaneShowGraph(showGraphTab);
      setRightPaneShowGraph(false);
      setSplitView(true);

      // Clear single pane state
      setOpenFiles([]);
      setActiveTab('graph');
    }

    // Add whiteboard to right pane (check if this specific whiteboard tab exists)
    const existingTabIndex = rightPaneFiles.findIndex(f => f.path === whiteboardPath);
    if (existingTabIndex < 0) {
      setRightPaneFiles([...rightPaneFiles, { path: whiteboardPath, name: whiteboard.name }]);
    }
    setRightPaneTab(whiteboardPath);
    setActivePane('right');
    setWhiteboardContextMenu(null);
  };

  const handleOpenInSecondPane = (filePath: string, fileName: string) => {
    if (isDev) {
      console.log('Opening in second pane:', filePath, fileName);
      console.log('Current splitView state:', splitView);
    }

    if (!splitView) {
      // Transfer current files to left pane
      setLeftPaneFiles(openFiles);
      setLeftPaneTab(activeTab);
      // Only show graph in left pane if it was visible in single pane
      setLeftPaneShowGraph(showGraphTab);
      // Right pane doesn't need graph - it will have the new file
      setRightPaneShowGraph(false);
      setSplitView(true);

      // Clear single pane state
      setOpenFiles([]);
      setActiveTab('graph');
    }

    // Add file to right pane
    const existingFile = rightPaneFiles.find(f => f.path === filePath);
    if (!existingFile) {
      setRightPaneFiles([...rightPaneFiles, { path: filePath, name: fileName }]);
    }
    setRightPaneTab(filePath);
    setActivePane('right');
  };

  const handleCloseSplitView = (filesToTransfer?: OpenFile[], tabToActivate?: string) => {
    if (isDev) console.log('[CLOSE SPLIT] 🔄 Closing split view');

    // Use provided files or fall back to current state
    const finalFiles = filesToTransfer || leftPaneFiles;
    const finalTab = tabToActivate || leftPaneTab;

    if (isDev) {
      console.log('[CLOSE SPLIT] 📋 Current state:', {
        leftPaneFiles: leftPaneFiles.map(f => f.name),
        leftPaneTab,
        rightPaneFiles: rightPaneFiles.map(f => f.name),
        rightPaneTab,
        filesToTransfer: filesToTransfer?.map(f => f.name),
        tabToActivate
      });

      // Transfer left pane files back to single pane
      console.log('[CLOSE SPLIT] ➡️ Transferring files to single pane:', finalFiles.map(f => f.name));
    }
    setOpenFiles(finalFiles);
    setActiveTab(finalTab);
    // Hide graph tab in single pane mode when transferring content
    setShowGraphTab(false);

    // Clear split view state
    setSplitView(false);
    setLeftPaneFiles([]);
    setLeftPaneTab('graph');
    setRightPaneFiles([]);
    setRightPaneTab('graph');
    setActivePane('left');
    // Reset graph visibility for next split view
    setLeftPaneShowGraph(true);
    setRightPaneShowGraph(false);

    if (isDev) console.log('[CLOSE SPLIT] ✅ Split view closed');
  };

  // Handle tab drop
  const handleTabDrop = useCallback(() => {
    if (!draggedTab) return;

    // Get the current drop zone from ref (not stale closure)
    const currentDropZone = dropZoneRef.current;

    if (isDev) console.log('🎯 [TEAM] Handling tab drop:', { draggedTab, dropZone: currentDropZone, splitView });

    const { filePath, fileName, sourcePane, id: fileId } = draggedTab;
    const isGraphTab = filePath === 'special://graph';

    // Only handle if dropping on left or right edge
    if (!currentDropZone || (currentDropZone !== 'left' && currentDropZone !== 'right')) {
      setDraggedTab(null);
      setDropZone(null);
      return;
    }

    // Handle left/right edge drops - create new splits or move between panes
    if (currentDropZone === 'left' || currentDropZone === 'right') {
      if (!splitView) {
        // Create new split view
        if (isDev) console.log('✅ [TEAM] Creating new split view on', currentDropZone, 'side');

        if (isGraphTab) {
          // Graph tab is being dragged to create split view
          if (currentDropZone === 'left') {
            // Graph goes to left, open files go to right
            setLeftPaneShowGraph(true);
            setLeftPaneTab('graph');
            setLeftPaneFiles([]);

            setRightPaneShowGraph(false);
            setRightPaneFiles(openFiles);
            setRightPaneTab(openFiles.length > 0 ? openFiles[0].path : '');
            setActivePane('left');
          } else {
            // Open files stay on left, Graph goes to right
            setLeftPaneShowGraph(false);
            setLeftPaneFiles(openFiles);
            setLeftPaneTab(openFiles.length > 0 ? openFiles[0].path : '');

            setRightPaneShowGraph(true);
            setRightPaneTab('graph');
            setRightPaneFiles([]);
            setActivePane('right');
          }
        } else {
          // Regular file tab being dragged
          // Remove the dragged file from openFiles
          const newOpenFiles = openFiles.filter(f => f.path !== filePath);

          if (currentDropZone === 'left') {
            // Drop on LEFT: dragged file goes to left pane, others to right
            setLeftPaneFiles([{ path: filePath, name: fileName, id: fileId }]);
            setLeftPaneTab(filePath);
            setLeftPaneShowGraph(false);

            setRightPaneFiles(newOpenFiles);
            setRightPaneTab(newOpenFiles.length > 0 ? newOpenFiles[0].path : 'graph');
            setRightPaneShowGraph(newOpenFiles.length === 0);
            setActivePane('left');
          } else {
            // Drop on RIGHT: others stay on left, dragged file goes to right
            setLeftPaneFiles(newOpenFiles);
            setLeftPaneTab(newOpenFiles.length > 0 ? newOpenFiles[0].path : 'graph');
            setLeftPaneShowGraph(newOpenFiles.length === 0);

            setRightPaneFiles([{ path: filePath, name: fileName, id: fileId }]);
            setRightPaneTab(filePath);
            setRightPaneShowGraph(false);
            setActivePane('right');
          }
        }

        // Enable split view and clear single pane state
        setSplitView(true);
        setOpenFiles([]);
        setActiveTab('graph');
        setShowGraphTab(true); // Reset for next time
        if (isDev) console.log('✅ [TEAM] Split view state updated!');
      } else {
        // Already in split view - move tab based on drop zone
        if (isDev) console.log('Moving tab in split view from', sourcePane, 'to', currentDropZone);

        if (isGraphTab) {
          // Moving Graph tab between panes in split view
          if (currentDropZone === 'left' && sourcePane === 'right') {
            // Move Graph from right to left
            setRightPaneShowGraph(false);
            setLeftPaneShowGraph(true);
            setLeftPaneTab('graph');
            setActivePane('left');
            // If right pane has no files and no graph, close split
            if (rightPaneFiles.length === 0) {
              handleCloseSplitView(leftPaneFiles, 'graph');
            } else {
              setRightPaneTab(rightPaneFiles[0].path);
            }
          } else if (currentDropZone === 'right' && sourcePane === 'left') {
            // Move Graph from left to right
            setLeftPaneShowGraph(false);
            setRightPaneShowGraph(true);
            setRightPaneTab('graph');
            setActivePane('right');
            // If left pane has files, activate first one
            if (leftPaneFiles.length > 0) {
              setLeftPaneTab(leftPaneFiles[0].path);
            }
          }
        } else {
          // Regular file tab movement
          if (currentDropZone === 'left') {
            // Drop on LEFT pane
            if (sourcePane === 'right') {
              // Move from right to left
              const newRightFiles = rightPaneFiles.filter(f => f.path !== filePath);
              setRightPaneFiles(newRightFiles);

              const existingInLeft = leftPaneFiles.find(f => f.path === filePath);

              let newLeftFiles = leftPaneFiles;
              if (!existingInLeft) {
                newLeftFiles = [...leftPaneFiles, { path: filePath, name: fileName, id: fileId }];
                setLeftPaneFiles(newLeftFiles);
              }
              setLeftPaneTab(filePath);
              setActivePane('left');

              // Close split if right pane is empty and has no graph
              if (newRightFiles.length === 0 && !rightPaneShowGraph) {
                handleCloseSplitView(newLeftFiles, filePath);
              }
            }
            // If already in left pane, do nothing
          } else if (currentDropZone === 'right') {
            // Drop on RIGHT pane
            if (sourcePane === 'left') {
              // Move from left to right
              const newLeftFiles = leftPaneFiles.filter(f => f.path !== filePath);
              setLeftPaneFiles(newLeftFiles);

              const existingInRight = rightPaneFiles.find(f => f.path === filePath);
              if (!existingInRight) {
                setRightPaneFiles([...rightPaneFiles, { path: filePath, name: fileName, id: fileId }]);
              }
              setRightPaneTab(filePath);
              setActivePane('right');
            }
            // If already in right pane, do nothing
          }
        }
      }
    }

    // Clear drag state
    setDraggedTab(null);
    setDropZone(null);
  }, [draggedTab, splitView, openFiles, activeTab, leftPaneFiles, rightPaneFiles, leftPaneTab, rightPaneTab, leftPaneShowGraph, rightPaneShowGraph, showGraphTab]);

  // Handle cross-pane drop to LEFT pane (from right pane)
  const handleCrossPaneDropLeft = useCallback((file: { path: string; name: string; id?: string }, targetIndex: number | null) => {
    if (!splitView || !draggedTab || draggedTab.sourcePane !== 'right') return;

    if (isDev) console.log('🔄 Cross-pane drop to LEFT at index:', targetIndex, file);

    // Handle Graph tab specially
    if (file.path === 'special://graph') {
      setRightPaneShowGraph(false);
      setLeftPaneShowGraph(true);
      setLeftPaneTab('graph');
      setActivePane('left');
      // If right pane has no files and no graph, switch to first file or close split
      if (rightPaneFiles.length === 0) {
        handleCloseSplitView(leftPaneFiles, 'graph');
      } else {
        // Activate first file in right pane
        setRightPaneTab(rightPaneFiles[0].path);
      }
      setDraggedTab(null);
      setDropZone(null);
      return;
    }

    // Remove from right pane
    const newRightFiles = rightPaneFiles.filter(f => f.path !== file.path);
    setRightPaneFiles(newRightFiles);

    // Add to left pane at specific index (or end if null)
    const existingIndex = leftPaneFiles.findIndex(f => f.path === file.path);
    let newLeftFiles = [...leftPaneFiles];

    if (existingIndex === -1) {
      // File not in left pane, insert at target index
      const insertIndex = targetIndex !== null ? targetIndex : newLeftFiles.length;
      newLeftFiles.splice(insertIndex, 0, file);
    } else {
      // File already exists in left pane, just activate it
    }

    setLeftPaneFiles(newLeftFiles);
    setLeftPaneTab(file.path);
    setActivePane('left');

    // Close split if right pane is empty and has no graph
    if (newRightFiles.length === 0 && !rightPaneShowGraph) {
      handleCloseSplitView(newLeftFiles, file.path);
    }

    // Clear drag state
    setDraggedTab(null);
    setDropZone(null);
  }, [splitView, draggedTab, leftPaneFiles, rightPaneFiles, rightPaneShowGraph, handleCloseSplitView]);

  // Handle cross-pane drop to RIGHT pane (from left pane)
  const handleCrossPaneDropRight = useCallback((file: { path: string; name: string; id?: string }, targetIndex: number | null) => {
    if (!splitView || !draggedTab || draggedTab.sourcePane !== 'left') return;

    if (isDev) console.log('🔄 Cross-pane drop to RIGHT at index:', targetIndex, file);

    // Handle Graph tab specially
    if (file.path === 'special://graph') {
      setLeftPaneShowGraph(false);
      setRightPaneShowGraph(true);
      setRightPaneTab('graph');
      setActivePane('right');
      // If left pane has no files and no graph, activate first file or graph
      if (leftPaneFiles.length === 0) {
        // Left pane is empty, close split view isn't appropriate here
        // Just keep the split with empty left pane showing graph fallback
      } else {
        // Activate first file in left pane
        setLeftPaneTab(leftPaneFiles[0].path);
      }
      setDraggedTab(null);
      setDropZone(null);
      return;
    }

    // Remove from left pane
    const newLeftFiles = leftPaneFiles.filter(f => f.path !== file.path);
    setLeftPaneFiles(newLeftFiles);

    // Add to right pane at specific index (or end if null)
    const existingIndex = rightPaneFiles.findIndex(f => f.path === file.path);
    let newRightFiles = [...rightPaneFiles];

    if (existingIndex === -1) {
      // File not in right pane, insert at target index
      const insertIndex = targetIndex !== null ? targetIndex : newRightFiles.length;
      newRightFiles.splice(insertIndex, 0, file);
    } else {
      // File already exists in right pane, just activate it
    }

    setRightPaneFiles(newRightFiles);
    setRightPaneTab(file.path);
    setActivePane('right');

    // If left pane has files, activate the first one; otherwise activate graph if showing
    if (newLeftFiles.length > 0) {
      setLeftPaneTab(newLeftFiles[0].path);
    } else if (leftPaneShowGraph) {
      setLeftPaneTab('graph');
    }

    // Clear drag state
    setDraggedTab(null);
    setDropZone(null);
  }, [splitView, draggedTab, leftPaneFiles, rightPaneFiles, leftPaneShowGraph]);

  const handleGuideOpen = (guideName: 'shortcuts' | 'markdown') => {
    if (isDev) console.log('Opening guide:', guideName);
    setActiveGuide(guideName);
  };

  const handleRevealInTree = (filePath: string) => {
    if (isDev) console.log('📂 Revealing in tree:', filePath);
    if (sidebarRef.current) {
      sidebarRef.current.revealFile(filePath);
    }
  };

  const handleDeleteItem = (itemPath: string, itemName: string) => {
    setDeleteConfirmation({ show: true, itemPath, itemName });
  };

  const confirmDeleteItem = async () => {
    if (!deleteConfirmation || !storageBackend) return;

    const itemPath = deleteConfirmation.itemPath;
    setDeleteConfirmation(null);

    try {
      await storageBackend.deleteFile(itemPath);
      if (isDev) console.log(`✅ Deleted: ${itemPath}`);

      // Close file if it's open
      const newOpenFiles = openFiles.filter(f => f.path !== itemPath);
      setOpenFiles(newOpenFiles);
      if (activeTab === itemPath) {
        setActiveTab(newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1].path : 'graph');
      }

      // Refresh
      await loadFileTree();
      setGraphKey(prev => prev + 1);

      // Refresh storage usage after deletion (may free up space)
      if (selectedTeam) {
        invalidateStorageCache(selectedTeam.id);
        const usage = await getTeamStorageUsage(selectedTeam.id, true);
        setStorageUsage(usage);
      }
    } catch (error) {
      console.error('Failed to delete item:', error);
      alert(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleRenameItem = (itemPath: string) => {
    setEditing({ path: itemPath, type: 'rename' });
  };

  const handleCreateNote = (folderPath: string) => {
    setEditing({ path: folderPath, type: 'new-note', id: contextMenu?.itemId });
  };

  const handleCreateFolder = (folderPath: string) => {
    setEditing({ path: folderPath, type: 'new-folder', id: contextMenu?.itemId });
  };

  const handleRefresh = async () => {
    await loadFileTree();
    setGraphKey(prev => prev + 1);
  };

  // Share via message handlers
  const handleShareViaMessage = async (itemPath: string, itemName: string, itemType: 'file' | 'folder') => {
    if (!selectedTeam) return;

    // Load channels for the share modal
    try {
      const channels = await getChannels(selectedTeam.id);

      // Also get DM channels for each team member
      const memberEmails = Object.keys(selectedTeam.members).filter(
        email => email.toLowerCase() !== user.email.toLowerCase()
      );

      // Create DM channel entries for members
      const dmChannels: Channel[] = memberEmails.map(email => {
        const member = selectedTeam.members[email];
        const dmChannelId = `dm_${[user.email.toLowerCase(), email.toLowerCase()].sort().join('_')}`.replace(/[@.]/g, '_');
        return {
          id: dmChannelId,
          teamId: selectedTeam.id,
          name: member.displayName || email.split('@')[0],
          type: 'dm' as const,
          createdBy: user.email,
          createdAt: new Date(),
          updatedAt: new Date(),
          participants: [user.email.toLowerCase(), email.toLowerCase()],
          messageCount: 0,
        };
      });

      setChatChannels([...channels, ...dmChannels]);

      // Set the file to share and open modal
      setShareFileModal({
        isOpen: true,
        file: {
          path: itemPath,
          name: itemName,
          type: itemType,
          driveId: contextMenu?.itemId,
        },
      });
    } catch (error) {
      console.error('Failed to load channels for sharing:', error);
      alert('Failed to load chat channels');
    }
  };

  const handleShareToChannel = async (channelId: string, message?: string, sharedFile?: SharedFile) => {
    if (!selectedTeam || !sharedFile) return;

    try {
      // Get or create the DM channel if it's a DM
      let targetChannelId = channelId;
      if (channelId.startsWith('dm_')) {
        // Extract the other user's email from the channel ID
        const parts = channelId.replace('dm_', '').split('_');
        // Reconstruct the emails (they were converted: @ -> _, . -> _)
        // For DMs, we need to find the actual member email
        const memberEmail = Object.keys(selectedTeam.members).find(email => {
          const normalizedEmail = email.toLowerCase().replace(/[@.]/g, '_');
          return parts.some(part => normalizedEmail.includes(part) && email !== user.email.toLowerCase());
        });

        if (memberEmail) {
          targetChannelId = await getOrCreateDMChannel(selectedTeam.id, user.email, memberEmail);
        }
      }

      // Send the message with the shared file
      await sendMessage(
        selectedTeam.id,
        targetChannelId,
        { content: message || '' },
        user.email,
        user.displayName || user.email.split('@')[0],
        user.photoURL,
        undefined, // attachments
        undefined, // poll
        sharedFile
      );

      if (isDev) console.log('📤 Shared file via message:', sharedFile.name);
    } catch (error) {
      console.error('Failed to share file:', error);
      throw error;
    }
  };

  const handleShareWhiteboardToChannel = async (channelId: string, message?: string, _sharedFile?: SharedFile, _sharedRecording?: SharedRecording, sharedWhiteboard?: SharedWhiteboard) => {
    if (!selectedTeam || !sharedWhiteboard) return;

    try {
      // Get or create the DM channel if it's a DM
      let targetChannelId = channelId;
      if (channelId.startsWith('dm_')) {
        const parts = channelId.replace('dm_', '').split('_');
        const memberEmail = Object.keys(selectedTeam.members).find(email => {
          const normalizedEmail = email.toLowerCase().replace(/[@.]/g, '_');
          return parts.some(part => normalizedEmail.includes(part) && email !== user.email.toLowerCase());
        });

        if (memberEmail) {
          targetChannelId = await getOrCreateDMChannel(selectedTeam.id, user.email, memberEmail);
        }
      }

      // Send the message with the shared whiteboard
      await sendMessage(
        selectedTeam.id,
        targetChannelId,
        { content: message || '' },
        user.email,
        user.displayName || user.email.split('@')[0],
        user.photoURL,
        undefined, // attachments
        undefined, // poll
        undefined, // sharedFile
        undefined, // sharedRecording
        undefined, // forwardedFrom
        undefined, // sharedTodo
        sharedWhiteboard
      );

      if (isDev) console.log('📤 Shared whiteboard via message:', sharedWhiteboard.name);
    } catch (error) {
      console.error('Failed to share whiteboard:', error);
      throw error;
    }
  };

  // Handler for forwarding todo to chat
  const handleForwardTodo = async (todo: TeamTodo) => {
    if (!selectedTeam) return;

    try {
      // Load chat channels for the modal
      const channels = await getChannels(selectedTeam.id);

      // Create DM channel entries for team members who don't have existing DMs
      const existingDMEmails = new Set<string>();
      channels.forEach(ch => {
        if (ch.type === 'dm' && ch.participants) {
          ch.participants.forEach(p => existingDMEmails.add(p.toLowerCase()));
        }
      });

      const dmChannels: Channel[] = Object.entries(selectedTeam.members)
        .filter(([email]) => email.toLowerCase() !== user.email.toLowerCase())
        .filter(([email]) => !existingDMEmails.has(email.toLowerCase()))
        .map(([email, member]) => {
          const dmChannelId = `dm_${email.toLowerCase().replace(/[@.]/g, '_')}`;
          return {
            id: dmChannelId,
            teamId: selectedTeam.id,
            name: member.displayName || email.split('@')[0],
            type: 'dm' as const,
            createdBy: user.email,
            createdAt: new Date(),
            updatedAt: new Date(),
            participants: [user.email.toLowerCase(), email.toLowerCase()],
            messageCount: 0,
          };
        });

      setChatChannels([...channels, ...dmChannels]);
      setForwardingTodo(todo);
    } catch (error) {
      console.error('Failed to load channels for forwarding:', error);
      alert('Failed to load chat channels');
    }
  };

  // Handler for forwarding todo to multiple channels
  const handleForwardTodoToChannels = async () => {
    if (!selectedTeam || !forwardingTodo || selectedForwardChannels.size === 0) return;

    setForwardingInProgress(true);
    try {
      // Create sharedTodo object (only include defined fields - Firestore rejects undefined)
      const sharedTodo = {
        todoId: forwardingTodo.id,
        teamId: selectedTeam.id,
        text: forwardingTodo.text,
        type: forwardingTodo.type === 'meeting' ? 'meeting' as const : 'task' as const,
        completed: forwardingTodo.completed,
        assignees: forwardingTodo.assignees,
        createdBy: forwardingTodo.createdBy,
        ...(forwardingTodo.priority !== undefined && { priority: forwardingTodo.priority }),
        ...(forwardingTodo.endDate && { endDate: forwardingTodo.endDate }),
        ...(forwardingTodo.startDate && { startDate: forwardingTodo.startDate }),
        ...(forwardingTodo.type === 'meeting' && forwardingTodo.meetingDetails && { meetingDetails: forwardingTodo.meetingDetails }),
      };

      // Simple text fallback for notifications/preview (include optional message if provided)
      const todoType = forwardingTodo.type === 'meeting' ? '[Meeting]' : '[Task]';
      const baseText = `${todoType}: ${forwardingTodo.text}`;
      const messageText = forwardTodoMessage.trim() ? `${forwardTodoMessage.trim()}\n\n${baseText}` : baseText;

      // Send to all selected channels
      for (const channelId of selectedForwardChannels) {
        let targetChannelId = channelId;

        // Get or create the DM channel if it's a DM
        if (channelId.startsWith('dm_')) {
          const memberEmail = Object.keys(selectedTeam.members).find(email => {
            const normalizedEmail = email.toLowerCase().replace(/[@.]/g, '_');
            return channelId.includes(normalizedEmail) && email.toLowerCase() !== user.email.toLowerCase();
          });

          if (memberEmail) {
            targetChannelId = await getOrCreateDMChannel(selectedTeam.id, user.email, memberEmail);
          }
        }

        // Send the message with sharedTodo object
        await sendMessage(
          selectedTeam.id,
          targetChannelId,
          { content: messageText },
          user.email,
          user.displayName || user.email.split('@')[0],
          user.photoURL,
          undefined, // attachments
          undefined, // poll
          undefined, // sharedFile
          undefined, // sharedRecording
          undefined, // forwardedFrom
          sharedTodo // sharedTodo
        );
      }

      if (isDev) console.log('📤 Forwarded todo to', selectedForwardChannels.size, 'channels:', forwardingTodo.text);

      // Reset and close
      setForwardingTodo(null);
      setSelectedForwardChannels(new Set());
      setForwardTodoSearch('');
      setForwardTodoMessage('');
    } catch (error) {
      console.error('Failed to forward todo:', error);
      alert('Failed to forward task');
    } finally {
      setForwardingInProgress(false);
    }
  };

  // Toggle channel selection for forwarding
  const toggleForwardChannel = (channelId: string) => {
    setSelectedForwardChannels(prev => {
      const next = new Set(prev);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return next;
    });
  };

  // Handler for opening a shared file from chat
  const handleOpenSharedFile = (sharedFile: SharedFile) => {
    if (sharedFile.type === 'file') {
      // Open the file in the editor
      handleSelectFile(sharedFile.path, sharedFile.name);
    } else {
      // For folders, we could expand them in the sidebar
      // For now, just log it
      if (isDev) console.log('📂 Opening folder from shared file:', sharedFile.path);
    }
  };

  // Handler for opening a shared recording from chat
  const handleOpenSharedRecording = (sharedRecording: SharedRecording) => {
    if (isDev) console.log('🎥 Opening shared recording:', sharedRecording.recordingId);
    // Set the recording ID to auto-play
    setAutoPlayRecordingId(sharedRecording.recordingId);
    // Navigate to the recordings tab
    if (splitView) {
      setRightPaneTab('special://recordings');
    } else {
      setActiveTab('special://recordings');
    }
  };

  // Handler for opening a shared todo from chat
  const handleOpenSharedTodo = (sharedTodo: SharedTodo) => {
    if (isDev) console.log('📋 Opening shared todo:', sharedTodo.todoId);
    // Clear highlight state when not coming from dashboard
    setTodosFilter(undefined);
    setTodosHighlightTaskId(undefined);
    // Navigate to the todos tab
    if (splitView) {
      setRightPaneTab('special://todos');
    } else {
      setActiveTab('special://todos');
    }
  };

  // Handler for toggling a shared todo from chat
  const handleToggleSharedTodo = async (sharedTodo: SharedTodo) => {
    if (isDev) console.log('✅ Toggling shared todo:', sharedTodo.todoId, 'current:', sharedTodo.completed);
    if (!user?.email) return;

    try {
      await toggleTodo(
        sharedTodo.teamId,
        sharedTodo.todoId,
        user.email
      );
    } catch (err) {
      console.error('Failed to toggle shared todo:', err);
    }
  };

  // Handler for joining a meeting from chat
  const handleJoinMeetingFromChat = (sharedTodo: SharedTodo) => {
    if (isDev) console.log('📅 Joining meeting from chat:', sharedTodo.todoId);
    // Clear highlight state when not coming from dashboard
    setTodosFilter(undefined);
    setTodosHighlightTaskId(undefined);
    // Navigate to the todos tab to join the meeting
    if (splitView) {
      setRightPaneTab('special://todos');
    } else {
      setActiveTab('special://todos');
    }
    // The meeting join will be handled by the TodoPanel when it loads
  };

  // Memoize getAllPaths to avoid recomputing on every render
  const allPaths = useMemo(() => {
    const paths: string[] = [];
    const traverse = (node: FileTreeNode) => {
      paths.push(node.path);
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    fileTree.forEach(traverse);
    return paths;
  }, [fileTree]);

  // Flatten file tree for chat insert modal
  const flattenedFileTree = useMemo(() => {
    const items: { path: string; name: string; type: 'file' | 'folder'; id?: string }[] = [];
    const traverse = (node: FileTreeNode) => {
      items.push({ path: node.path, name: node.name, type: node.type, id: node.id });
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    fileTree.forEach(traverse);
    return items;
  }, [fileTree]);

  if (loading) {
    return (
      <div className="team-main-ui">
        <TitleBar
          onSearchResultClick={() => {}}
          rootPath=""
        />
        <div className="loading-state">
          <p>Loading your teams...</p>
        </div>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="team-main-ui">
        <TitleBar
          onSearchResultClick={() => {}}
          rootPath=""
        />

        {showCreateTeamModal && (
          <CreateTeamModal
            user={user}
            onClose={() => {
              setShowCreateTeamModal(false);
            }}
            onTeamCreated={(team) => {
              setShowCreateTeamModal(false);
              // Save the new team ID to localStorage BEFORE loadTeams() runs
              // This ensures loadTeams() will select the correct team
              localStorage.setItem('lastSelectedTeamId', team.id);
              setSelectedTeam(team);
              loadTeams();
            }}
            onSwitchToJoin={() => {
              setShowCreateTeamModal(false);
              setShowJoinTeamModal(true);
            }}
          />
        )}

        {showJoinTeamModal && (
          <JoinTeamModal
            user={user}
            onClose={() => {
              setShowJoinTeamModal(false);
              setShowCreateTeamModal(true);
            }}
            onTeamJoined={() => {
              setShowJoinTeamModal(false);
              loadTeams();
            }}
          />
        )}
      </div>
    );
  }

  if (!selectedTeam || !storageBackend) {
    return (
      <div className="team-main-ui">
        <TitleBar
          onSearchResultClick={() => {}}
          rootPath=""
        />
        <div className="loading-state">
          <p>Initializing team workspace...</p>
        </div>
      </div>
    );
  }

  return (
        <div className="team-main-ui">
          <TitleBar
            onSearchResultClick={(filePath: string, fileName: string) => {
              // Search result click - open the file
              handleSelectFile(filePath, fileName);
            }}
            onGuideOpen={handleGuideOpen}
            rootPath={selectedTeam.driveFolderId}
          />

          <div className="main-ui-content">
            {/* Icon Rail - Navigation */}
            <IconRail
              onDashboardClick={() => {
                handleSelectFile('special://dashboard', 'Dashboard');
              }}
              onGraphClick={() => {
                if (splitView) {
                  // In split view, activate Graph in the active pane
                  if (activePane === 'left') {
                    setLeftPaneShowGraph(true);
                    setLeftPaneTab('graph');
                  } else {
                    setRightPaneShowGraph(true);
                    setRightPaneTab('graph');
                  }
                } else {
                  // In single pane, show Graph tab and activate it
                  setShowGraphTab(true);
                  setActiveTab('graph');
                }
              }}
              onTodosClick={() => {
                // Clear highlight state when clicking directly (not from dashboard)
                setTodosFilter(undefined);
                setTodosHighlightTaskId(undefined);
                handleSelectFile('special://todos', 'Todos');
              }}
              onTimelineClick={() => {
                // Clear meeting modal state when clicking directly (not from dashboard)
                setTimelineFilter(undefined);
                setTimelineMeetingId(undefined);
                handleSelectFile('special://timeline', 'Timeline');
              }}
              onChatClick={() => {
                handleSelectFile('special://chat', 'Messages');
              }}
              onWhiteboardClick={async () => {
                // If no whiteboards exist, auto-create one
                if (whiteboards.length === 0) {
                  await handleCreateWhiteboardFromSidebar();
                } else {
                  // If we have an active whiteboard, use its name
                  const activeWb = whiteboards.find(wb => wb.id === activeWhiteboardId);
                  const wbName = activeWb?.name || whiteboards[0]?.name || 'Whiteboard';
                  handleSelectFile('special://whiteboard', wbName);
                }
              }}
              onRecordingsClick={() => {
                handleSelectFile('special://recordings', 'Recordings');
                // Mark recordings as viewed - update timestamp
                const now = Date.now();
                lastViewedRecordingsRef.current = now;
                localStorage.setItem('lastViewedRecordingsTimestamp', now.toString());
                setNewRecordingsCount(0);
              }}
              onNotificationsClick={() => {
                handleSelectFile('special://notifications', 'Notifications');
              }}
              notificationCount={notifications.filter(n => !n.read).length}
              unreadMessageCount={unreadMessageCount}
              newRecordingsCount={newRecordingsCount}
              onSettingsClick={() => {
                // Open Settings as a tab
                handleSelectFile('special://settings', 'Settings');
              }}
              activeItem={
                // In split view, use the active pane's tab; otherwise use activeTab
                (() => {
                  const currentTab = splitView
                    ? (activePane === 'left' ? leftPaneTab : rightPaneTab)
                    : activeTab;
                  if (currentTab === 'special://dashboard') return 'dashboard';
                  if (currentTab === 'graph') return 'graph';
                  if (currentTab === 'special://todos') return 'todos';
                  if (currentTab === 'special://timeline') return 'timeline';
                  if (currentTab === 'special://chat') return 'chat';
                  if (currentTab.startsWith('special://whiteboard')) return 'whiteboard';
                  if (currentTab === 'special://recordings') return 'recordings';
                  if (currentTab === 'special://notifications') return 'notifications';
                  if (currentTab === 'special://settings') return 'settings';
                  return null;
                })()
              }
            />

            {/* Left Sidebar - File Tree */}
            <div className="explorer-sidebar" style={{ width: `${sidebarWidth}px` }}>
              <UnifiedSidebar
                ref={sidebarRef}
                fileTree={fileTree}
                onSelectFile={handleSelectFile}
                getRootPath={() => ''} // Return empty string for team mode - team ID is handled by storage layer
                editing={editing}
                onStartEditing={handleStartEditing}
                onFinishEditing={handleFinishEditing}
                refreshFileTree={() => loadFileTree()}
                onContextMenu={handleContextMenu}
                onMoveItem={handleMoveItem}
                onDropExternalFiles={handleDropExternalFiles}
                onDropExternalDirectory={handleDropExternalDirectory}
                onChangeFolderPath={() => {}}
                filesWithIncomingLinks={filesWithIncomingLinks}
                teamName={selectedTeam.name}
                // Whiteboard section props - only show when on whiteboard tab
                showWhiteboardSection={
                  splitView
                    ? (leftPaneTab.startsWith('special://whiteboard') || rightPaneTab.startsWith('special://whiteboard'))
                    : activeTab.startsWith('special://whiteboard')
                }
                whiteboards={whiteboards}
                activeWhiteboardId={activeWhiteboardId}
                onSelectWhiteboard={handleSelectWhiteboard}
                onCreateWhiteboard={handleCreateWhiteboardFromSidebar}
                onWhiteboardContextMenu={handleWhiteboardContextMenu}
                // Whiteboard inline rename props
                renamingWhiteboardId={whiteboardRenaming}
                onWhiteboardRenameSubmit={handleWhiteboardRename}
                onWhiteboardRenameCancel={() => setWhiteboardRenaming(null)}
              />

              {/* Folder Access Status */}
              {(folderAccessStatus.loading || !folderAccessStatus.hasAccess) && (
                <div style={{
                  padding: '8px',
                  borderTop: '1px solid var(--border-color)',
                  fontSize: '12px',
                  color: folderAccessStatus.hasAccess ? 'var(--text-secondary)' : '#ff6b6b'
                }}>
                  {folderAccessStatus.loading && (
                    <div>⏳ {folderAccessStatus.message || 'Checking access...'}</div>
                  )}
                  {!folderAccessStatus.loading && !folderAccessStatus.hasAccess && (
                    <>
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                        ⚠️ {folderAccessStatus.message || 'Access Issue'}
                      </div>
                      {folderAccessStatus.issues && folderAccessStatus.issues.length > 0 && (
                        <div style={{ fontSize: '11px', opacity: 0.8 }}>
                          {folderAccessStatus.issues[0]}
                        </div>
                      )}
                      <div style={{
                        marginTop: '8px',
                        fontSize: '11px',
                        color: 'var(--text-secondary)'
                      }}>
                        <button
                          onClick={() => loadFileTree()}
                          style={{
                            background: 'var(--button-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            cursor: 'pointer',
                            fontSize: '11px'
                          }}
                        >
                          Retry
                        </button>
                        <button
                          onClick={() => setShowTeamManagement(true)}
                          style={{
                            background: 'var(--button-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            marginLeft: '4px'
                          }}
                        >
                          Team Settings
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Storage Usage Meter */}
              {storageUsage && (
                <div style={{ padding: '8px', borderTop: '1px solid var(--border-color)' }}>
                  <StorageUsageMeter
                    usage={storageUsage}
                    compact={false}
                    showUpgradeButton={storageUsage.requiresUpgrade && isTeamOwner}
                    onUpgradeClick={() => setShowUpgradeModal(true)}
                  />
                </div>
              )}
            </div>

            {/* Sidebar Divider */}
            <div className="sidebar-divider" onMouseDown={handleSidebarDividerMouseDown}></div>

            {/* Main Content Area */}
            <div className="main-content" ref={mainContentRef}>
              {isDragging && <DropZoneOverlay containerRef={mainContentRef} />}

              {/* Read-Only Mode Banner */}
              {isReadOnlyMode && (
                <ReadOnlyBanner
                  onUpgradeClick={isTeamOwner ? () => setShowUpgradeModal(true) : undefined}
                />
              )}

              {/* Promo Status Banner */}
              {activePromo && !isReadOnlyMode && (
                <PromoStatusBanner
                  promoInfo={activePromo}
                  onUpgradeClick={isTeamOwner ? () => setShowUpgradeModal(true) : undefined}
                />
              )}

              {/* Storage Limit Banner - only show if not in read-only mode and not showing promo */}
              {storageUsage && !storageBannerDismissed && !isReadOnlyMode && !activePromo && (storageUsage.status === 'exceeded' || storageUsage.status === 'warning') && (
                <StorageLimitBanner
                  usage={storageUsage}
                  onUpgradeClick={isTeamOwner ? () => setShowUpgradeModal(true) : undefined}
                  onDismiss={() => setStorageBannerDismissed(true)}
                  dismissable={storageUsage.status === 'warning'}
                />
              )}

              {/* Grace Period Warning Banner */}
              {memberAccessLevel === 'grace' && !graceBannerDismissed && (
                <div className="billing-warning-banner grace-period">
                  <AlertTriangle size={18} />
                  <span>
                    <strong>Payment Issue:</strong> You have {gracePeriodDays} day{gracePeriodDays !== 1 ? 's' : ''} remaining in your grace period.
                    {isTeamOwner ? ' Please update your payment method.' : ' Contact your team owner to resolve the payment issue.'}
                  </span>
                  {isTeamOwner && (
                    <button onClick={() => setShowUpgradeModal(true)} className="resolve-btn">
                      Update Payment
                    </button>
                  )}
                  <button onClick={() => setGraceBannerDismissed(true)} className="dismiss-btn" title="Dismiss">
                    ✕
                  </button>
                </div>
              )}

              {/* Blocked User Banner - Full screen overlay */}
              {memberAccessLevel === 'blocked' && (
                <div className="billing-blocked-overlay">
                  <div className="blocked-content">
                    <AlertTriangle size={48} className="blocked-icon" />
                    <h2>Team Access Suspended</h2>
                    <p>
                      Your access to this team has been suspended due to a payment issue.
                      {isTeamOwner
                        ? ' Please update your payment method to restore access.'
                        : ' Contact your team owner to resolve the payment issue.'}
                    </p>
                    {isTeamOwner && (
                      <button onClick={() => setShowUpgradeModal(true)} className="resolve-payment-btn">
                        Update Payment Method
                      </button>
                    )}
                    <button onClick={() => setActiveTab('settings')} className="settings-btn">
                      Go to Settings
                    </button>
                  </div>
                </div>
              )}

              {!splitView ? (
                // Single pane mode
                <>
                  <TabBar
                    activeTab={activeTab}
                    openFiles={openFiles}
                    showGraphTab={showGraphTab}
                    onTabClick={setActiveTab}
                    onTabClose={handleCloseFile}
                    onGraphClose={() => {
                      // Hide Graph tab and switch to first open file, or show empty state
                      setShowGraphTab(false);
                      if (openFiles.length > 0) {
                        setActiveTab(openFiles[0].path);
                      } else {
                        setActiveTab(''); // Empty state - no active tab
                      }
                    }}
                    onReorderTabs={(files, newGraphIndex) => {
                      setOpenFiles(files);
                      if (newGraphIndex !== undefined) {
                        setGraphTabIndex(newGraphIndex);
                      }
                    }}
                    graphTabIndex={graphTabIndex}
                    dragStartPos={dragStartPos}
                    setDragStartPos={setDragStartPos}
                    isPaneActive={true}
                    onRevealInTree={handleRevealInTree}
                    onPaneActivate={() => setActivePane('left')}
                  />
                  <div className="tab-content" onClick={() => setActivePane('left')}>
                    {activeTab === 'graph' && showGraphTab && (
                      <GraphView
                        key={graphKey}
                        rootPath={selectedTeam.driveFolderId}
                        onFileOpen={handleSelectFile}
                        onNodeContextMenu={handleGraphNodeContextMenu}
                        onCreateNote={() => handleStartEditing('', 'new-note')}
                        onCreateFolder={() => handleStartEditing('', 'new-folder')}
                        storageBackend={storageBackend || undefined}
                      />
                    )}
                    {activeTab === 'special://dashboard' && (
                      <TeamDashboardPanel
                        team={selectedTeam}
                        storageBackend={storageBackend}
                        storageUsage={storageUsage}
                        onClose={() => setActiveTab('graph')}
                        onSelectFile={handleSelectFile}
                        onInviteMember={() => setShowInviteMember(true)}
                        onManageTeam={() => setShowTeamManagement(true)}
                        isTabMode={true}
                        currentUserRole={currentUserTeamRole}
                        currentUserEmail={user.email}
                        onOpenTimeline={(filter, meetingId) => {
                          setTimelineFilter(filter);
                          setTimelineMeetingId(meetingId);
                          handleSelectFile('special://timeline', 'Timeline');
                        }}
                        onOpenTodos={(filter, taskId) => {
                          setTodosFilter(filter);
                          setTodosHighlightTaskId(taskId);
                          handleSelectFile('special://todos', 'Todos');
                        }}
                      />
                    )}
                    {activeTab === 'special://todos' && (
                      <TeamTodoPanel
                        teamId={selectedTeam.id}
                        members={selectedTeam.members}
                        currentUserEmail={user.email}
                        onMeetingCallStarted={handleMeetingCallStarted}
                        onForwardTodo={(subscriptionStatus === 'active' || activePromo !== null) ? handleForwardTodo : undefined}
                        initialTab="tasks"
                        initialFilter={todosFilter}
                        highlightTaskId={todosHighlightTaskId}
                      />
                    )}
                    {activeTab === 'special://timeline' && (
                      <TeamTimelinePanel
                        teamId={selectedTeam.id}
                        members={selectedTeam.members}
                        currentUserEmail={user.email}
                        initialFilter={timelineFilter}
                        initialMeetingId={timelineMeetingId}
                      />
                    )}
                    {activeTab === 'special://chat' && (
                      <TeamChatPanel
                        teamId={selectedTeam.id}
                        members={selectedTeam.members}
                        currentUserEmail={user.email}
                        isOwner={isTeamOwner}
                        onUpgradeClick={() => setShowUpgradeModal(true)}
                        subscriptionStatus={subscriptionStatus}
                        hasPromoAccess={activePromo !== null}
                        onUnreadCountChange={setUnreadMessageCount}
                        onOpenSharedFile={handleOpenSharedFile}
                        onOpenSharedRecording={handleOpenSharedRecording}
                        onOpenSharedTodo={handleOpenSharedTodo}
                        onToggleSharedTodo={handleToggleSharedTodo}
                        onJoinMeetingFromChat={handleJoinMeetingFromChat}
                        onOpenSharedWhiteboard={handleOpenSharedWhiteboard}
                        fileTree={flattenedFileTree}
                        teamTodos={teamTodos}
                        recordings={teamRecordings}
                        whiteboards={whiteboards}
                        currentUserName={user.displayName || user.email}
                        onCallStateChange={handleCallStateChange}
                        isShowingFloatingWidget={activeTab !== 'special://chat' && globalCallState?.activeCall !== null}
                        onActiveChannelChange={handleActiveChannelChange}
                        navigateToChannelId={navigateToChannelId}
                        onNavigationComplete={handleNavigationComplete}
                      />
                    )}
                    {activeTab.startsWith('special://whiteboard') && (
                      <WhiteboardPanel
                        teamId={selectedTeam.id}
                        userId={user.uid}
                        userName={user.displayName || user.email}
                        selectedWhiteboardId={
                          // Extract whiteboard ID from path if present, otherwise use activeWhiteboardId
                          activeTab.startsWith('special://whiteboard/')
                            ? activeTab.replace('special://whiteboard/', '')
                            : activeWhiteboardId
                        }
                        fileTree={fileTree.map(node => ({
                          path: node.path,
                          name: node.name,
                          type: node.type,
                          id: node.id,
                        }))}
                        tasks={teamTodos}
                        recordings={teamRecordings}
                      />
                    )}
                    {activeTab === 'special://settings' && (
                      <SettingsPanel
                        onClose={() => {
                          // Close settings tab - switch to graph or first open file
                          if (openFiles.length > 0) {
                            setActiveTab(openFiles[0].path);
                          } else if (showGraphTab) {
                            setActiveTab('graph');
                          } else {
                            setActiveTab('');
                          }
                        }}
                        currentTeam={selectedTeam}
                        selectedTeam={selectedTeam}
                        availableTeams={teams}
                        onSwitchTeam={(team) => {
                          setSelectedTeam(team);
                        }}
                        isTabMode={true}
                        onCreateTeam={() => setShowCreateTeamModal(true)}
                      />
                    )}
                    {activeTab === 'special://notifications' && (
                      <NotificationsPanel
                        notifications={notifications}
                        onMarkAsRead={(id) => {
                          if (selectedTeam?.id) {
                            markNotificationAsRead(selectedTeam.id, id).catch(err => {
                              console.error('Failed to mark notification as read:', err);
                            });
                          }
                        }}
                        onMarkAllAsRead={() => {
                          if (selectedTeam?.id && user?.email) {
                            markAllNotificationsAsRead(selectedTeam.id, user.email).catch(err => {
                              console.error('Failed to mark all notifications as read:', err);
                            });
                          }
                        }}
                        onDelete={(id) => {
                          if (selectedTeam?.id) {
                            deleteNotification(selectedTeam.id, id).catch(err => {
                              console.error('Failed to delete notification:', err);
                            });
                          }
                        }}
                        onClearAll={() => {
                          if (selectedTeam?.id && user?.email) {
                            deleteAllNotifications(selectedTeam.id, user.email).catch(err => {
                              console.error('Failed to clear all notifications:', err);
                            });
                          }
                        }}
                        onNotificationClick={(notification) => {
                          // Navigate to the relevant content
                          if (notification.link?.type === 'chat') {
                            handleSelectFile('special://chat', 'Messages');
                          } else if (notification.link?.type === 'todo') {
                            // Clear highlight state when not coming from dashboard
                            setTodosFilter(undefined);
                            setTodosHighlightTaskId(undefined);
                            handleSelectFile('special://todos', 'Todos');
                          }
                        }}
                      />
                    )}
                    {activeTab === 'special://recordings' && selectedTeam?.id && user?.email && (
                      <RecordingsPanel
                        teamId={selectedTeam.id}
                        currentUserEmail={user.email}
                        teamMembers={selectedTeam.members}
                        autoPlayRecordingId={autoPlayRecordingId}
                        onAutoPlayComplete={() => setAutoPlayRecordingId(null)}
                        hasPaidAccess={subscriptionStatus === 'active' || activePromo !== null}
                        onUpgradeClick={isTeamOwner ? () => setShowUpgradeModal(true) : undefined}
                      />
                    )}
                    {openFiles.filter(file => !file.path.startsWith('special://')).map((file) => {
                      const isEditable = file.name.toLowerCase().endsWith('.md') || file.name.toLowerCase().endsWith('.txt');
                      return activeTab === file.path && (
                        isEditable ? (
                          <FileViewer
                            key={file.path}
                            filePath={file.path}
                            fileName={file.name}
                            fileId={file.id}
                            rootPath={selectedTeam.driveFolderId}
                            onOpenFile={handleSelectFile}
                            onFileCreated={() => {
                              loadFileTree();
                              setGraphKey(prev => prev + 1);
                            }}
                            onFileRenamed={(oldPath, newPath, newName) => {
                              const updatedOpenFiles = openFiles.map(f =>
                                f.path === oldPath ? { path: newPath, name: newName } : f
                              );

                              setOpenFiles(updatedOpenFiles);
                              if (activeTab === oldPath) {
                                setActiveTab(newPath);
                              }
                              loadFileTree();
                              setGraphKey(prev => prev + 1);
                            }}
                            isActive={true}
                            storageBackend={storageBackend || undefined}
                            currentUserEmail={user.email}
                          />
                        ) : (
                          <FileViewer
                            key={file.path}
                            filePath={file.path}
                            fileName={file.name}
                            fileId={file.id}
                            rootPath={selectedTeam.driveFolderId}
                            storageBackend={storageBackend || undefined}
                            currentUserEmail={user.email}
                          />
                        )
                      );
                    })}
                    {/* Empty state when no tabs are open */}
                    {!showGraphTab && openFiles.length === 0 && !activeTab.startsWith('special://') && (
                      <div className="empty-pane-state">
                        <div className="empty-pane-content">
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4 }}>
                            <circle cx="6" cy="6" r="2.5" />
                            <circle cx="18" cy="6" r="2.5" />
                            <circle cx="12" cy="18" r="2.5" />
                            <path d="M8 7.5L10.5 16" />
                            <path d="M16 7.5L13.5 16" />
                          </svg>
                          <p style={{ color: '#666', marginTop: '12px', fontSize: '14px' }}>No tabs open</p>
                          <p style={{ color: '#555', fontSize: '12px', marginTop: '4px' }}>
                            Select a file from the sidebar or click Graph in the icon rail
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                // Split view mode
                <div className="split-view-container">
                  {/* Left Pane */}
                  <div
                    className={`editor-pane ${activePane === 'left' ? 'active' : ''}`}
                    style={{ width: `${leftPaneWidth}%` }}
                  >
                    <TabBar
                      activeTab={leftPaneTab}
                      openFiles={leftPaneFiles}
                      pane="left"
                      showGraphTab={leftPaneShowGraph}
                      onTabClick={setLeftPaneTab}
                      onTabClose={(filePath) => {
                        const newFiles = leftPaneFiles.filter(f => f.path !== filePath);
                        // If no more files in left pane, close split view and transfer right pane to single pane
                        if (newFiles.length === 0) {
                          handleCloseSplitView(rightPaneFiles, rightPaneTab);
                          return;
                        }
                        setLeftPaneFiles(newFiles);
                        if (leftPaneTab === filePath) {
                          setLeftPaneTab(newFiles[0].path);
                        }
                      }}
                      onGraphClose={() => {
                        // Switch to first open file or close split view if Graph is closed
                        setLeftPaneShowGraph(false);
                        if (leftPaneFiles.length > 0) {
                          setLeftPaneTab(leftPaneFiles[0].path);
                        } else {
                          // No files in left pane, close split view and transfer right pane to single pane
                          handleCloseSplitView(rightPaneFiles, rightPaneTab);
                        }
                      }}
                      onReorderTabs={(files, newGraphIndex) => {
                        setLeftPaneFiles(files);
                        if (newGraphIndex !== undefined) {
                          setLeftPaneGraphIndex(newGraphIndex);
                        }
                        // Activate the moved tab (last reordered position)
                        if (draggedTab?.filePath) {
                          setLeftPaneTab(draggedTab.filePath);
                        }
                      }}
                      graphTabIndex={leftPaneGraphIndex}
                      onCrossPaneDrop={handleCrossPaneDropLeft}
                      dragStartPos={dragStartPos}
                      setDragStartPos={setDragStartPos}
                      isPaneActive={activePane === 'left'}
                      onRevealInTree={handleRevealInTree}
                      onPaneActivate={() => setActivePane('left')}
                    />
                    <div className="tab-content" onClick={() => setActivePane('left')}>
                      {leftPaneTab === 'graph' && (
                        <GraphView
                          key={graphKey}
                          rootPath={selectedTeam.driveFolderId}
                          onFileOpen={(path, name) => handleSelectFile(path, name, 'left')}
                          onNodeContextMenu={handleGraphNodeContextMenu}
                          onCreateNote={() => handleStartEditing('', 'new-note')}
                          onCreateFolder={() => handleStartEditing('', 'new-folder')}
                          storageBackend={storageBackend || undefined}
                        />
                      )}
                      {leftPaneTab === 'special://dashboard' && (
                        <TeamDashboardPanel
                          team={selectedTeam}
                          storageBackend={storageBackend}
                          storageUsage={storageUsage}
                          onClose={() => setLeftPaneTab('graph')}
                          onSelectFile={(path, name) => handleSelectFile(path, name, 'left')}
                          onInviteMember={() => setShowInviteMember(true)}
                          onManageTeam={() => setShowTeamManagement(true)}
                          isTabMode={true}
                          currentUserRole={currentUserTeamRole}
                          currentUserEmail={user.email}
                          onOpenTimeline={(filter, meetingId) => {
                            setTimelineFilter(filter);
                            setTimelineMeetingId(meetingId);
                            handleSelectFile('special://timeline', 'Timeline', 'left');
                          }}
                          onOpenTodos={(filter, taskId) => {
                            setTodosFilter(filter);
                            setTodosHighlightTaskId(taskId);
                            handleSelectFile('special://todos', 'Todos', 'left');
                          }}
                        />
                      )}
                      {leftPaneTab === 'special://todos' && (
                        <TeamTodoPanel
                          teamId={selectedTeam.id}
                          members={selectedTeam.members}
                          currentUserEmail={user.email}
                          onMeetingCallStarted={handleMeetingCallStarted}
                          initialTab="tasks"
                          initialFilter={todosFilter}
                          highlightTaskId={todosHighlightTaskId}
                        />
                      )}
                      {leftPaneTab === 'special://timeline' && (
                        <TeamTimelinePanel
                          teamId={selectedTeam.id}
                          members={selectedTeam.members}
                          currentUserEmail={user.email}
                          initialFilter={timelineFilter}
                          initialMeetingId={timelineMeetingId}
                        />
                      )}
                      {leftPaneTab === 'special://chat' && (
                        <TeamChatPanel
                          teamId={selectedTeam.id}
                          members={selectedTeam.members}
                          currentUserEmail={user.email}
                          isOwner={isTeamOwner}
                          onUpgradeClick={() => setShowUpgradeModal(true)}
                          subscriptionStatus={subscriptionStatus}
                          hasPromoAccess={activePromo !== null}
                          onUnreadCountChange={setUnreadMessageCount}
                          onOpenSharedFile={handleOpenSharedFile}
                          onOpenSharedRecording={handleOpenSharedRecording}
                          onOpenSharedTodo={handleOpenSharedTodo}
                          onToggleSharedTodo={handleToggleSharedTodo}
                          onJoinMeetingFromChat={handleJoinMeetingFromChat}
                          onCallStateChange={handleCallStateChange}
                          isShowingFloatingWidget={leftPaneTab !== 'special://chat' && globalCallState?.activeCall !== null}
                          onActiveChannelChange={handleActiveChannelChange}
                          navigateToChannelId={navigateToChannelId}
                          onNavigationComplete={handleNavigationComplete}
                        />
                      )}
                      {leftPaneTab === 'special://settings' && (
                        <SettingsPanel
                          onClose={() => {
                            if (leftPaneFiles.length > 0) {
                              setLeftPaneTab(leftPaneFiles[0].path);
                            } else if (leftPaneShowGraph) {
                              setLeftPaneTab('graph');
                            } else {
                              setLeftPaneTab('special://dashboard');
                            }
                          }}
                          currentTeam={selectedTeam}
                          selectedTeam={selectedTeam}
                          availableTeams={teams}
                          onSwitchTeam={(team) => {
                            setSelectedTeam(team);
                          }}
                          isTabMode={true}
                          onCreateTeam={() => setShowCreateTeamModal(true)}
                        />
                      )}
                      {leftPaneTab.startsWith('special://whiteboard') && (
                        <WhiteboardPanel
                          teamId={selectedTeam.id}
                          userId={user.uid}
                          userName={user.displayName || user.email}
                          selectedWhiteboardId={
                            leftPaneTab.startsWith('special://whiteboard/')
                              ? leftPaneTab.replace('special://whiteboard/', '')
                              : activeWhiteboardId
                          }
                          fileTree={fileTree.map(node => ({
                            path: node.path,
                            name: node.name,
                            type: node.type,
                            id: node.id,
                          }))}
                          tasks={teamTodos}
                          recordings={teamRecordings}
                        />
                      )}
                      {leftPaneFiles.filter(file => !file.path.startsWith('special://')).map((file) => {
                        const isEditable = file.name.toLowerCase().endsWith('.md') || file.name.toLowerCase().endsWith('.txt');
                        return leftPaneTab === file.path && (
                          isEditable ? (
                            <FileViewer
                              key={file.path}
                              filePath={file.path}
                              fileName={file.name}
                              rootPath={selectedTeam.driveFolderId}
                              onOpenFile={(path, name) => handleSelectFile(path, name, 'left')}
                              onFileCreated={() => {
                                loadFileTree();
                                setGraphKey(prev => prev + 1);
                              }}
                              onFileRenamed={(oldPath, newPath, newName) => {
                                const updatedFiles = leftPaneFiles.map(f =>
                                  f.path === oldPath ? { path: newPath, name: newName } : f
                                );
                                setLeftPaneFiles(updatedFiles);
                                if (leftPaneTab === oldPath) {
                                  setLeftPaneTab(newPath);
                                }
                                loadFileTree();
                                setGraphKey(prev => prev + 1);
                              }}
                              onPaneActivate={() => setActivePane('left')}
                              editorId="left"
                              isActive={activePane === 'left'}
                              storageBackend={storageBackend || undefined}
                              currentUserEmail={user.email}
                            />
                          ) : (
                            <FileViewer
                              key={file.path}
                              filePath={file.path}
                              fileName={file.name}
                              rootPath={selectedTeam.driveFolderId}
                              storageBackend={storageBackend || undefined}
                              currentUserEmail={user.email}
                            />
                          )
                        );
                      })}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="pane-divider" onMouseDown={handleDividerMouseDown}></div>

                  {/* Right Pane */}
                  <div
                    className={`editor-pane ${activePane === 'right' ? 'active' : ''}`}
                    style={{ flex: 1 }}
                  >
                    <TabBar
                      activeTab={rightPaneTab}
                      openFiles={rightPaneFiles}
                      pane="right"
                      showGraphTab={rightPaneShowGraph}
                      onTabClick={setRightPaneTab}
                      onTabClose={(filePath) => {
                        const newFiles = rightPaneFiles.filter(f => f.path !== filePath);
                        // If no more files in right pane, close split view and keep left pane content
                        if (newFiles.length === 0) {
                          handleCloseSplitView();
                          return;
                        }
                        setRightPaneFiles(newFiles);
                        if (rightPaneTab === filePath) {
                          setRightPaneTab(newFiles[0].path);
                        }
                      }}
                      onGraphClose={() => {
                        // Hide Graph tab in right pane
                        setRightPaneShowGraph(false);
                        // Switch to first open file or dashboard if Graph is closed
                        if (rightPaneFiles.length > 0) {
                          setRightPaneTab(rightPaneFiles[0].path);
                        } else {
                          // No files in right pane, close split view
                          handleCloseSplitView();
                        }
                      }}
                      onReorderTabs={(files, newGraphIndex) => {
                        setRightPaneFiles(files);
                        if (newGraphIndex !== undefined) {
                          setRightPaneGraphIndex(newGraphIndex);
                        }
                        // Activate the moved tab (last reordered position)
                        if (draggedTab?.filePath) {
                          setRightPaneTab(draggedTab.filePath);
                        }
                      }}
                      graphTabIndex={rightPaneGraphIndex}
                      onCrossPaneDrop={handleCrossPaneDropRight}
                      dragStartPos={dragStartPos}
                      setDragStartPos={setDragStartPos}
                      isPaneActive={activePane === 'right'}
                      onRevealInTree={handleRevealInTree}
                      onPaneActivate={() => setActivePane('right')}
                    />
                    <div className="tab-content" onClick={() => setActivePane('right')}>
                      {rightPaneTab === 'graph' && (
                        <GraphView
                          key={graphKey}
                          rootPath={selectedTeam.driveFolderId}
                          onFileOpen={(path, name) => handleSelectFile(path, name, 'right')}
                          onNodeContextMenu={handleGraphNodeContextMenu}
                          storageBackend={storageBackend || undefined}
                        />
                      )}
                      {rightPaneTab === 'special://dashboard' && (
                        <TeamDashboardPanel
                          team={selectedTeam}
                          storageBackend={storageBackend}
                          storageUsage={storageUsage}
                          onClose={() => setRightPaneTab('graph')}
                          onSelectFile={(path, name) => handleSelectFile(path, name, 'right')}
                          onInviteMember={() => setShowInviteMember(true)}
                          onManageTeam={() => setShowTeamManagement(true)}
                          isTabMode={true}
                          currentUserRole={currentUserTeamRole}
                          currentUserEmail={user.email}
                          onOpenTimeline={(filter, meetingId) => {
                            setTimelineFilter(filter);
                            setTimelineMeetingId(meetingId);
                            handleSelectFile('special://timeline', 'Timeline', 'right');
                          }}
                          onOpenTodos={(filter, taskId) => {
                            setTodosFilter(filter);
                            setTodosHighlightTaskId(taskId);
                            handleSelectFile('special://todos', 'Todos', 'right');
                          }}
                        />
                      )}
                      {rightPaneTab === 'special://todos' && (
                        <TeamTodoPanel
                          teamId={selectedTeam.id}
                          members={selectedTeam.members}
                          currentUserEmail={user.email}
                          onMeetingCallStarted={handleMeetingCallStarted}
                          initialTab="tasks"
                          initialFilter={todosFilter}
                          highlightTaskId={todosHighlightTaskId}
                        />
                      )}
                      {rightPaneTab === 'special://timeline' && (
                        <TeamTimelinePanel
                          teamId={selectedTeam.id}
                          members={selectedTeam.members}
                          currentUserEmail={user.email}
                          initialFilter={timelineFilter}
                          initialMeetingId={timelineMeetingId}
                        />
                      )}
                      {rightPaneTab === 'special://chat' && (
                        <TeamChatPanel
                          teamId={selectedTeam.id}
                          members={selectedTeam.members}
                          currentUserEmail={user.email}
                          isOwner={isTeamOwner}
                          onUpgradeClick={() => setShowUpgradeModal(true)}
                          subscriptionStatus={subscriptionStatus}
                          hasPromoAccess={activePromo !== null}
                          onUnreadCountChange={setUnreadMessageCount}
                          onOpenSharedFile={handleOpenSharedFile}
                          onOpenSharedRecording={handleOpenSharedRecording}
                          onOpenSharedTodo={handleOpenSharedTodo}
                          onToggleSharedTodo={handleToggleSharedTodo}
                          onJoinMeetingFromChat={handleJoinMeetingFromChat}
                          onCallStateChange={handleCallStateChange}
                          isShowingFloatingWidget={rightPaneTab !== 'special://chat' && globalCallState?.activeCall !== null}
                          onActiveChannelChange={handleActiveChannelChange}
                          navigateToChannelId={navigateToChannelId}
                          onNavigationComplete={handleNavigationComplete}
                        />
                      )}
                      {rightPaneTab === 'special://settings' && (
                        <SettingsPanel
                          onClose={() => {
                            if (rightPaneFiles.length > 0) {
                              setRightPaneTab(rightPaneFiles[0].path);
                            } else if (rightPaneShowGraph) {
                              setRightPaneTab('graph');
                            } else {
                              setRightPaneTab('special://dashboard');
                            }
                          }}
                          currentTeam={selectedTeam}
                          selectedTeam={selectedTeam}
                          availableTeams={teams}
                          onSwitchTeam={(team) => {
                            setSelectedTeam(team);
                          }}
                          isTabMode={true}
                          onCreateTeam={() => setShowCreateTeamModal(true)}
                        />
                      )}
                      {rightPaneTab.startsWith('special://whiteboard') && (
                        <WhiteboardPanel
                          teamId={selectedTeam.id}
                          userId={user.uid}
                          userName={user.displayName || user.email}
                          selectedWhiteboardId={
                            rightPaneTab.startsWith('special://whiteboard/')
                              ? rightPaneTab.replace('special://whiteboard/', '')
                              : activeWhiteboardId
                          }
                          fileTree={fileTree.map(node => ({
                            path: node.path,
                            name: node.name,
                            type: node.type,
                            id: node.id,
                          }))}
                          tasks={teamTodos}
                          recordings={teamRecordings}
                        />
                      )}
                      {rightPaneFiles.filter(file => !file.path.startsWith('special://')).map((file) => {
                        const isEditable = file.name.toLowerCase().endsWith('.md') || file.name.toLowerCase().endsWith('.txt');
                        return rightPaneTab === file.path && (
                          isEditable ? (
                            <FileViewer
                              key={file.path}
                              filePath={file.path}
                              fileName={file.name}
                              rootPath={selectedTeam.driveFolderId}
                              onOpenFile={(path, name) => handleSelectFile(path, name, 'right')}
                              onFileCreated={() => {
                                loadFileTree();
                                setGraphKey(prev => prev + 1);
                              }}
                              onFileRenamed={(oldPath, newPath, newName) => {
                                const updatedFiles = rightPaneFiles.map(f =>
                                  f.path === oldPath ? { path: newPath, name: newName } : f
                                );
                                setRightPaneFiles(updatedFiles);
                                if (rightPaneTab === oldPath) {
                                  setRightPaneTab(newPath);
                                }
                                loadFileTree();
                                setGraphKey(prev => prev + 1);
                              }}
                              onPaneActivate={() => setActivePane('right')}
                              editorId="right"
                              isActive={activePane === 'right'}
                              storageBackend={storageBackend || undefined}
                              currentUserEmail={user.email}
                            />
                          ) : (
                            <FileViewer
                              key={file.path}
                              filePath={file.path}
                              fileName={file.name}
                              rootPath={selectedTeam.driveFolderId}
                              storageBackend={storageBackend || undefined}
                              currentUserEmail={user.email}
                            />
                          )
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Team Management Modal */}
          {showTeamManagement && (
            <TeamManagementModal
              team={selectedTeam}
              currentUser={user}
              onClose={() => setShowTeamManagement(false)}
              onInviteMore={() => {
                setShowInviteMember(true);
              }}
              onMemberRemoved={() => {
                // Refresh team data when a member is removed
                loadTeams();
              }}
            />
          )}

          {/* Invite Member Modal */}
          {showInviteMember && selectedTeam && (
            <InviteMemberModal
              team={selectedTeam}
              user={user}
              onClose={() => setShowInviteMember(false)}
              onMemberInvited={() => {
                setShowInviteMember(false);
                // Refresh the team data to show new pending invitations
                loadTeams();
              }}
            />
          )}

          {/* Context Menu */}
          {contextMenu && selectedTeam && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              itemPath={contextMenu.itemPath}
              itemType={contextMenu.itemType}
              itemName={contextMenu.itemName}
              onClose={() => setContextMenu(null)}
              onDelete={handleDeleteItem}
              onRename={handleRenameItem}
              onCreateNote={handleCreateNote}
              onCreateFolder={handleCreateFolder}
              onRefresh={handleRefresh}
              onRevealInExplorer={undefined}
              onOpenExternal={undefined}
              onOpenInSecondPane={handleOpenInSecondPane}
              onShareViaMessage={handleShareViaMessage}
              allPaths={allPaths}
              mode="team"
              userRole={selectedTeam.members[user.email.toLowerCase().replace(/\./g, '_DOT_').replace('@', '_AT_')]?.role || selectedTeam.members[user.email.toLowerCase()]?.role}
            />
          )}

          {/* Whiteboard Context Menu */}
          {whiteboardContextMenu && (
            <div
              className="context-menu"
              style={{ left: `${whiteboardContextMenu.x}px`, top: `${whiteboardContextMenu.y}px` }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="context-menu-item"
                onClick={() => handleWhiteboardOpenInTab(whiteboardContextMenu.whiteboard)}
              >
                <ExternalLink size={16} className="menu-icon" />
                Open in Tab
              </div>
              <div
                className="context-menu-item"
                onClick={() => handleWhiteboardOpenInSecondPane(whiteboardContextMenu.whiteboard)}
              >
                <PanelRight size={16} className="menu-icon" />
                Open in Second Pane
              </div>
              <div className="context-menu-separator" />
              <div
                className="context-menu-item"
                onClick={async () => {
                  if (!selectedTeam) return;
                  try {
                    // Load chat channels first (including groups)
                    const channels = await getChannels(selectedTeam.id);

                    // Create DM channel entries for team members who don't have existing DMs
                    const existingDMEmails = new Set<string>();
                    channels.forEach(ch => {
                      if (ch.type === 'dm' && ch.participants) {
                        ch.participants.forEach(p => existingDMEmails.add(p.toLowerCase()));
                      }
                    });

                    const dmChannels: Channel[] = Object.entries(selectedTeam.members)
                      .filter(([email]) => email.toLowerCase() !== user.email.toLowerCase())
                      .filter(([email]) => !existingDMEmails.has(email.toLowerCase()))
                      .map(([email, member]) => {
                        const dmChannelId = `dm_${email.toLowerCase().replace(/[@.]/g, '_')}`;
                        return {
                          id: dmChannelId,
                          teamId: selectedTeam.id,
                          name: member.displayName || email.split('@')[0],
                          type: 'dm' as const,
                          createdBy: user.email,
                          createdAt: new Date(),
                          updatedAt: new Date(),
                          participants: [user.email.toLowerCase(), email.toLowerCase()],
                          messageCount: 0,
                        };
                      });

                    setChatChannels([...channels, ...dmChannels]);
                    setWhiteboardShareModal({ isOpen: true, whiteboard: whiteboardContextMenu.whiteboard });
                    setWhiteboardContextMenu(null);
                  } catch (error) {
                    console.error('Failed to load channels for whiteboard sharing:', error);
                    alert('Failed to load chat channels');
                  }
                }}
              >
                <ChatBubbleLeftRightIcon className="menu-icon" />
                Share via Message
              </div>
              <div className="context-menu-separator" />
              <div
                className="context-menu-item"
                onClick={() => {
                  setWhiteboardRenaming(whiteboardContextMenu.whiteboard.id);
                  setWhiteboardContextMenu(null);
                }}
              >
                <PencilIcon className="menu-icon" />
                Rename
              </div>
              <div className="context-menu-separator" />
              <div
                className="context-menu-item danger"
                onClick={() => {
                  setWhiteboardDeleteConfirm(whiteboardContextMenu.whiteboard);
                  setWhiteboardContextMenu(null);
                }}
              >
                <TrashIcon className="menu-icon" />
                Delete
              </div>
            </div>
          )}

          {/* Whiteboard Delete Confirmation Modal */}
          <ConfirmModal
            isOpen={!!whiteboardDeleteConfirm}
            title="Delete Whiteboard"
            message={`Are you sure you want to delete "${whiteboardDeleteConfirm?.name}"?`}
            hint="This action cannot be undone. All content on this whiteboard will be permanently deleted."
            confirmText="Delete"
            cancelText="Cancel"
            onConfirm={() => whiteboardDeleteConfirm && handleWhiteboardDelete(whiteboardDeleteConfirm)}
            onCancel={() => setWhiteboardDeleteConfirm(null)}
            isDanger
          />

          {/* Delete Confirmation Modal */}
          <ConfirmModal
            isOpen={!!deleteConfirmation}
            title={`Delete ${deleteConfirmation?.itemName.endsWith('.md') ? 'Note' : 'Item'}`}
            message={`Are you sure you want to delete "${deleteConfirmation?.itemName}"?`}
            hint="This action cannot be undone."
            confirmText="Delete"
            cancelText="Cancel"
            onConfirm={confirmDeleteItem}
            onCancel={() => setDeleteConfirmation(null)}
            isDanger
          />

          {/* Share via Message Modal */}
          <ShareToChatModal
            isOpen={shareFileModal.isOpen}
            onClose={() => setShareFileModal({ isOpen: false, file: null })}
            sharedFile={shareFileModal.file || undefined}
            channels={chatChannels}
            currentUserEmail={user.email}
            teamMembers={selectedTeam?.members ? Object.values(selectedTeam.members).map(m => ({
              email: m.email,
              displayName: m.displayName,
              photoURL: m.photoURL,
            })) : []}
            onGetOrCreateDM={async (memberEmail: string) => {
              if (!selectedTeam) throw new Error('No team selected');
              return await getOrCreateDMChannel(selectedTeam.id, user.email, memberEmail);
            }}
            onShare={handleShareToChannel}
          />

          {/* Share Whiteboard via Message Modal */}
          <ShareToChatModal
            isOpen={whiteboardShareModal.isOpen}
            onClose={() => setWhiteboardShareModal({ isOpen: false, whiteboard: null })}
            sharedWhiteboard={whiteboardShareModal.whiteboard ? {
              whiteboardId: whiteboardShareModal.whiteboard.id,
              name: whiteboardShareModal.whiteboard.name,
              createdByName: whiteboardShareModal.whiteboard.createdByName,
              createdByEmail: whiteboardShareModal.whiteboard.createdBy,
            } : undefined}
            channels={chatChannels}
            currentUserEmail={user.email}
            teamMembers={selectedTeam?.members ? Object.values(selectedTeam.members).map(m => ({
              email: m.email,
              displayName: m.displayName,
              photoURL: m.photoURL,
            })) : []}
            onGetOrCreateDM={async (memberEmail: string) => {
              if (!selectedTeam) throw new Error('No team selected');
              return await getOrCreateDMChannel(selectedTeam.id, user.email, memberEmail);
            }}
            onShare={handleShareWhiteboardToChannel}
          />

          {/* Forward Todo to Chat Modal - Matching Recording Forward style */}
          {forwardingTodo && (
            <div className="forward-modal-overlay" onClick={() => { setForwardingTodo(null); setSelectedForwardChannels(new Set()); setForwardTodoSearch(''); setForwardTodoMessage(''); }}>
              <div className="forward-modal" onClick={(e) => e.stopPropagation()}>
                <div className="forward-modal-header">
                  <div className="forward-header-text">
                    <h3>Forward To</h3>
                    <p>Select where you want to share this {forwardingTodo.type === 'meeting' ? 'meeting' : 'task'}.</p>
                  </div>
                  <button className="forward-modal-close" onClick={() => { setForwardingTodo(null); setSelectedForwardChannels(new Set()); setForwardTodoSearch(''); setForwardTodoMessage(''); }}>
                    <X size={18} />
                  </button>
                </div>

                {/* Search Input */}
                <div style={{ padding: '0 16px 12px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    background: '#1e1e1e',
                    borderRadius: '6px',
                    border: '1px solid #3d3d3d',
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"></circle>
                      <path d="m21 21-4.3-4.3"></path>
                    </svg>
                    <input
                      type="text"
                      placeholder="Search"
                      value={forwardTodoSearch}
                      onChange={(e) => setForwardTodoSearch(e.target.value)}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: '#e0e0e0',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                </div>

                {/* Channel List */}
                <div className="forward-list">
                  {chatChannels.length === 0 ? (
                    <div className="forward-empty">No channels available</div>
                  ) : (
                    [...chatChannels]
                      .sort((a, b) => {
                        // DMs (individual members) first, then groups
                        if (a.type === 'dm' && b.type !== 'dm') return -1;
                        if (a.type !== 'dm' && b.type === 'dm') return 1;
                        return 0;
                      })
                      .filter(channel => {
                        if (!forwardTodoSearch.trim()) return true;
                        const searchLower = forwardTodoSearch.toLowerCase();
                        const displayName = channel.type === 'dm'
                          ? channel.participants?.find(p => p !== user.email) || channel.name
                          : channel.name;
                        return displayName.toLowerCase().includes(searchLower);
                      })
                      .map(channel => {
                        const isGroup = channel.type !== 'dm';
                        // Find the other participant's email (may be encoded)
                        const otherParticipantRaw = channel.participants?.find(p => p !== user.email) || '';
                        // Decode email: replace _AT_ with @ and _DOT_ with .
                        const decodeEmail = (email: string) => email
                          .replace(/_AT_/g, '@')
                          .replace(/_DOT_/g, '.')
                          .replace(/_at_/g, '@')
                          .replace(/_dot_/g, '.');
                        const otherParticipantEmail = decodeEmail(otherParticipantRaw);
                        // Find member by email (handles encoded Firebase keys)
                        const otherMember = selectedTeam?.members[otherParticipantRaw]
                          || (selectedTeam?.members && Object.values(selectedTeam.members).find(m => m.email?.toLowerCase() === otherParticipantEmail.toLowerCase()));
                        const displayName = channel.type === 'dm'
                          ? otherMember?.displayName || otherParticipantEmail.split('@')[0] || channel.name
                          : channel.name;
                        const emailDisplay = channel.type === 'dm' ? otherParticipantEmail : null;
                        const avatarUrl = otherMember?.customAvatar || otherMember?.photoURL;
                        const isSelected = selectedForwardChannels.has(channel.id);

                        return (
                          <div
                            key={channel.id}
                            className={`forward-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => toggleForwardChannel(channel.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div className={`forward-avatar ${isGroup ? 'group' : ''}`}>
                              {isGroup ? (
                                <Users size={18} />
                              ) : avatarUrl ? (
                                <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                              ) : (
                                displayName.substring(0, 2).toUpperCase()
                              )}
                            </div>
                            <div className="forward-info">
                              <span className="forward-name">{displayName}</span>
                              {emailDisplay && (
                                <span className="forward-subtitle">{emailDisplay}</span>
                              )}
                            </div>
                            {/* Checkbox */}
                            <div className={`forward-checkbox ${isSelected ? 'checked' : ''}`}>
                              {isSelected && <Check size={14} />}
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>

                {/* Task/Meeting Preview - at bottom like recording forward */}
                <div style={{
                  padding: '12px 16px',
                  background: '#2d2d2d',
                  margin: '0 16px',
                  borderRadius: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {forwardingTodo.type === 'meeting' ? (
                      <Video size={20} style={{ color: forwardingTodo.meetingDetails?.color || '#64c8ca', flexShrink: 0 }} />
                    ) : (
                      <CheckSquare size={20} style={{ color: '#22c55e', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '600', color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {forwardingTodo.text}
                      </div>
                      <div style={{ fontSize: '12px', color: '#888' }}>
                        {forwardingTodo.type === 'meeting' ? 'Meeting' : 'Task'}
                        {forwardingTodo.priority && ` • Priority P${forwardingTodo.priority}`}
                        {forwardingTodo.endDate && ` • ${new Date(forwardingTodo.endDate).toLocaleDateString()}`}
                        {forwardingTodo.type === 'meeting' && forwardingTodo.meetingDetails?.startTime && ` ${forwardingTodo.meetingDetails.startTime} - ${forwardingTodo.meetingDetails.endTime}`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer with optional message and Send button */}
                <div style={{
                  padding: '12px 16px',
                  borderTop: '1px solid #3d3d3d',
                  marginTop: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}>
                  <input
                    type="text"
                    placeholder="Add an optional message..."
                    value={forwardTodoMessage}
                    onChange={(e) => setForwardTodoMessage(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: '#e0e0e0',
                      fontSize: '13px',
                    }}
                  />
                  <button
                    onClick={handleForwardTodoToChannels}
                    disabled={selectedForwardChannels.size === 0 || forwardingInProgress}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      background: selectedForwardChannels.size > 0 ? '#64c8ca' : '#3d3d3d',
                      border: 'none',
                      borderRadius: '6px',
                      color: selectedForwardChannels.size > 0 ? '#1e1e1e' : '#666',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: selectedForwardChannels.size > 0 ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s',
                    }}
                  >
                    {forwardingInProgress ? 'Sending...' : 'Send'}
                    {!forwardingInProgress && <Send size={14} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Help Modal */}
          {activeGuide && (
            <HelpModal
              guide={activeGuide}
              onClose={() => setActiveGuide(null)}
            />
          )}

          {/* Upgrade Modal */}
          {showUpgradeModal && selectedTeam && storageUsage && (
            <UpgradeModal
              isOpen={showUpgradeModal}
              onClose={() => setShowUpgradeModal(false)}
              teamId={selectedTeam.id}
              teamName={selectedTeam.name}
              usage={storageUsage}
              onPromoSuccess={async () => {
                // Refresh promo status when a promo code is applied
                const newPromoInfo = await getPromoStatusFromBilling(selectedTeam.id);
                setActivePromo(newPromoInfo);
                setIsReadOnlyMode(false); // Promo applied, no longer read-only
                // Refresh storage usage
                const usage = await getTeamStorageUsage(selectedTeam.id);
                setStorageUsage(usage);
              }}
            />
          )}

          {/* Storage Warning Modal */}
          {storageWarning.show && (
            <div className="confirm-modal-overlay" onClick={() => setStorageWarning({ show: false, message: '', canUpgrade: false })}>
              <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="confirm-modal-header">
                  <span className="confirm-modal-icon warning">
                    <AlertTriangle size={20} />
                  </span>
                  <h3>Storage Limit Exceeded</h3>
                </div>
                <div className="confirm-modal-body">
                  <p style={{ whiteSpace: 'pre-line' }}>{storageWarning.message}</p>
                </div>
                <div className="confirm-modal-footer">
                  <button
                    className="confirm-modal-button cancel"
                    onClick={() => setStorageWarning({ show: false, message: '', canUpgrade: false })}
                  >
                    Close
                  </button>
                  {storageWarning.canUpgrade && (
                    <button
                      className="confirm-modal-button confirm"
                      onClick={() => {
                        setStorageWarning({ show: false, message: '', canUpgrade: false });
                        setShowUpgradeModal(true);
                      }}
                    >
                      Upgrade Plan
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Create Team Modal */}
          {showCreateTeamModal && (
            <CreateTeamModal
              user={user}
              onClose={() => setShowCreateTeamModal(false)}
              onTeamCreated={(team) => {
                setShowCreateTeamModal(false);
                // Save the new team ID to localStorage BEFORE loadTeams() runs
                // This ensures loadTeams() will select the correct team
                localStorage.setItem('lastSelectedTeamId', team.id);
                setSelectedTeam(team);
                loadTeams();
              }}
              onSwitchToJoin={() => {
                setShowCreateTeamModal(false);
                setShowJoinTeamModal(true);
              }}
            />
          )}

          {/* Join Team Modal */}
          {showJoinTeamModal && (
            <JoinTeamModal
              user={user}
              onClose={() => {
                setShowJoinTeamModal(false);
              }}
              onTeamJoined={() => {
                setShowJoinTeamModal(false);
                loadTeams();
              }}
            />
          )}

          {/* Meeting Call Overlay - Shows for standalone meeting calls (not tied to chat) */}
          {globalCallState?.activeCall && meetingCallExpanded && globalCallChannelId?.startsWith('meeting_') && selectedTeam && (
            <div className="meeting-call-overlay-container">
              <CallOverlay
                call={globalCallState.activeCall}
                participants={globalCallState.participants}
                isMuted={globalCallState.isMuted}
                isVideoOff={globalCallState.isVideoOff}
                isScreenSharing={globalCallState.isScreenSharing}
                onMinimize={handleMeetingCallMinimize}
                currentUserEmail={user.email}
                currentUserName={selectedTeam.members[user.email.toLowerCase()]?.displayName || user.email.split('@')[0]}
                channelName={globalCallChannelName || 'Meeting'}
                members={selectedTeam.members}
              />
            </div>
          )}

          {/* Floating Call Widget - Shows when user navigates away from call's channel */}
          {globalCallState?.activeCall && (() => {
            const isMeetingCall = globalCallChannelId?.startsWith('meeting_');

            // For meeting calls: show floating widget only when meeting overlay is collapsed
            if (isMeetingCall) {
              if (meetingCallExpanded) return null;
              return (
                <FloatingCallWidget
                  call={globalCallState.activeCall}
                  participants={globalCallState.participants}
                  isMuted={globalCallState.isMuted}
                  isVideoOff={globalCallState.isVideoOff}
                  onExpand={handleExpandCall}
                  channelName={globalCallChannelName || undefined}
                />
              );
            }

            // For regular chat calls: show floating widget when not on the call's channel
            const isOnChatTab = splitView
              ? (leftPaneTab === 'special://chat' || rightPaneTab === 'special://chat')
              : activeTab === 'special://chat';

            // Check if viewing a different channel than the call's channel
            const isOnDifferentChannel = globalCallChannelId && activeViewingChannelId !== globalCallChannelId;

            // Show floating widget when:
            // 1. User is NOT on chat tab at all, OR
            // 2. User IS on chat tab but viewing a different channel than the call
            const shouldShowWidget = !isOnChatTab || isOnDifferentChannel;

            if (!shouldShowWidget) return null;

            return (
              <FloatingCallWidget
                call={globalCallState.activeCall}
                participants={globalCallState.participants}
                isMuted={globalCallState.isMuted}
                isVideoOff={globalCallState.isVideoOff}
                onExpand={handleExpandCall}
                channelName={globalCallChannelName || undefined}
              />
            );
          })()}

          {/* Recording saving indicator - shows even after call ends */}
          <RecordingSavingIndicator position="bottom-right" />

          {/* Global Incoming Call Modal - shows regardless of which tab is active */}
          {incomingCall && !globalCallState?.activeCall && (
            <IncomingCallModal
              call={incomingCall}
              onAccept={handleAnswerIncomingCall}
              onDecline={handleDeclineIncomingCall}
            />
          )}
        </div>
  );
}

// Wrapper component that provides DragDropContext
export default function TeamMainUI({ user }: TeamMainUIProps) {
  return (
    <GraphVisibilityProvider>
      <DragDropProvider>
        <TeamMainUIInner user={user} />
      </DragDropProvider>
    </GraphVisibilityProvider>
  );
}
