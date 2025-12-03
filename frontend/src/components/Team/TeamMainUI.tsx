import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { User } from '../../services/authServiceTauri';
import { getUserTeams, Team, getPendingInvites, acceptTeamInvite } from '../../services/teamService';
import TitleBar from '../UI/TitleBar';
import { UnifiedSidebar } from '../../renderer/components/UnifiedSidebar';
import GraphView from '../Graph/GraphView';
import FileViewer from '../Viewers/FileViewer';
import { TabBar, OpenFile } from '../UI/TabBar';
import TeamTodoPanel from './TeamTodoPanel';
import TeamTimelinePanel from './TeamTimelinePanel';
import TeamChatPanel from './Chat/TeamChatPanel';
import SettingsPanel from '../Settings/SettingsPanel';
import { TeamDriveStorage, getTeamDriveStorage } from '../../services/teamDriveStorage';
import { DragDropProvider, useDragDrop, EditorPane } from '../../contexts/DragDropContext';
import { GraphVisibilityProvider } from '../../contexts/GraphVisibilityContext';
import CreateTeamModal from './CreateTeamModal';
import JoinTeamModal from './JoinTeamModal';
import TeamManagementModal from './TeamManagementModal';
import InviteMemberModal from './InviteMemberModal';
import ContextMenu from '../UI/ContextMenu';
import HelpModal from '../UI/HelpModal';
import { DropZoneOverlay } from '../UI/DropZoneOverlay';
import IconRail from '../UI/IconRail';
import TeamDashboardPanel from '../Dashboard/TeamDashboardPanel';
// Billing components
import { StorageLimitBanner, StorageUsageMeter, UpgradeModal } from '../Billing';
import { StorageUsage } from '../../services/billingTypes';
import { getTeamStorageUsage, invalidateStorageCache } from '../../services/storageTrackingService';
import { initializeTeamBilling, syncSubscriptionStatus, handlePaymentSuccess } from '../../services/billingService';
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

  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageBackend, setStorageBackend] = useState<TeamDriveStorage | null>(null);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showJoinTeamModal, setShowJoinTeamModal] = useState(false);
  const [showTeamChoice, setShowTeamChoice] = useState(false);
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
  const [todoKey, setTodoKey] = useState(0);
  const [filesWithIncomingLinks, setFilesWithIncomingLinks] = useState<Set<string>>(new Set());

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


  const sidebarRef = useRef<any>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const isSavingRef = useRef(false);

  // Refs to capture latest state values for event handlers
  const isDraggingRef = useRef(isDragging);
  const dropZoneRef = useRef(dropZone);

  // Keep refs in sync with state
  useEffect(() => {
    isDraggingRef.current = isDragging;
    dropZoneRef.current = dropZone;
  }, [isDragging, dropZone]);

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
              await acceptTeamInvite(invite.teamId, user.email, user.displayName || user.email);
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
      setTeams(userTeams);

      // If we have a selected team, update it with the refreshed data
      if (selectedTeam) {
        const updatedTeam = userTeams.find(t => t.id === selectedTeam.id);
        if (updatedTeam) {
          if (isDev) console.log('📌 Updating selected team with fresh data:', updatedTeam.name);
          setSelectedTeam(updatedTeam);
        }
      } else if (userTeams.length > 0) {
        // Only auto-select first team if no team is selected
        if (isDev) console.log('📌 Auto-selecting first team:', userTeams[0].name);
        setSelectedTeam(userTeams[0]);
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
            if (urlParams.get('session_id')) {
              if (isDev) console.log('🔄 Verifying checkout session...');
              const success = await handlePaymentSuccess(selectedTeam.id);
              if (success && isDev) {
                console.log('✅ Payment verified successfully!');
              }
            }

            // Sync subscription status with Stripe (polling approach)
            if (isDev) console.log('🔄 Syncing subscription status...');
            await syncSubscriptionStatus(selectedTeam.id);
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
      setFileTree(tree);
      if (isDev) console.log(`✅ Loaded ${tree.length} items from Firebase Storage:`, tree);

      if (tree.length === 0) {
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
          message: `Loaded ${tree.length} items`
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

  // Debounced version of loadFileTree for use in callbacks
  const loadFileTreeDebounced = useCallback(() => {
    if (loadFileTreeTimeoutRef.current) {
      clearTimeout(loadFileTreeTimeoutRef.current);
    }
    loadFileTreeTimeoutRef.current = setTimeout(() => {
      loadFileTree();
    }, 300);
  }, [storageBackend]);

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
          // Single pane mode: close active file or special tab
          if (activeTab !== 'graph') {
            if (activeTab.startsWith('special://')) {
              // Close special tab (Todos/Timeline)
              const newFiles = openFiles.filter(f => f.path !== activeTab);
              setOpenFiles(newFiles);
              setActiveTab(newFiles.length > 0 ? newFiles[0].path : 'graph');
            } else {
              // Close regular file
              handleCloseFile(activeTab);
            }
          }
        } else {
          // Split view mode: close active file in active pane
          if (activePane === 'left') {
            if (leftPaneTab !== 'graph') {
              const newFiles = leftPaneFiles.filter(f => f.path !== leftPaneTab);
              setLeftPaneFiles(newFiles);
              if (newFiles.length > 0) {
                setLeftPaneTab(newFiles[0].path);
              } else {
                setLeftPaneTab('graph');
              }
            }
          } else if (activePane === 'right') {
            if (rightPaneTab !== 'graph') {
              const newFiles = rightPaneFiles.filter(f => f.path !== rightPaneTab);
              setRightPaneFiles(newFiles);
              if (newFiles.length > 0) {
                setRightPaneTab(newFiles[0].path);
              } else {
                // Close split view when last tab in right pane is closed
                handleCloseSplitView();
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
  }, [activeTab, splitView, activeGuide, activePane, leftPaneTab, rightPaneTab, leftPaneFiles, rightPaneFiles, openFiles]); // Re-bind when active tab, splitView, or activeGuide changes

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
          alert(`Storage limit exceeded (${storageUsage.usedFormatted} / ${storageUsage.limitFormatted}). Please upgrade or delete files to create new notes.`);
          setShowUpgradeModal(true);
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
        storageBackend.saveFile(fileName, initialContent, parentFolderPath, true).then(async () => {
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

  const handleOpenInSecondPane = (filePath: string, fileName: string) => {
    if (isDev) {
      console.log('Opening in second pane:', filePath, fileName);
      console.log('Current splitView state:', splitView);
    }

    if (!splitView) {
      // Transfer current files to left pane
      setLeftPaneFiles(openFiles);
      setLeftPaneTab(activeTab);
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
            onTeamCreated={() => {
              setShowCreateTeamModal(false);
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
                handleSelectFile('special://todos', 'Todos');
              }}
              onTimelineClick={() => {
                handleSelectFile('special://timeline', 'Timeline');
              }}
              onChatClick={() => {
                handleSelectFile('special://chat', 'Chat');
              }}
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
                onChangeFolderPath={() => {}}
                filesWithIncomingLinks={filesWithIncomingLinks}
                teamName={selectedTeam.name}
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
                    showUpgradeButton={storageUsage.requiresUpgrade}
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

              {/* Storage Limit Banner */}
              {storageUsage && !storageBannerDismissed && (storageUsage.status === 'exceeded' || storageUsage.status === 'warning') && (
                <StorageLimitBanner
                  usage={storageUsage}
                  onUpgradeClick={() => setShowUpgradeModal(true)}
                  onDismiss={() => setStorageBannerDismissed(true)}
                  dismissable={storageUsage.status === 'warning'}
                />
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
                      />
                    )}
                    {activeTab === 'special://todos' && (
                      <TeamTodoPanel
                        teamId={selectedTeam.id}
                        members={selectedTeam.members}
                        currentUserEmail={user.email}
                      />
                    )}
                    {activeTab === 'special://timeline' && (
                      <TeamTimelinePanel
                        teamId={selectedTeam.id}
                        members={selectedTeam.members}
                        currentUserEmail={user.email}
                      />
                    )}
                    {activeTab === 'special://chat' && (
                      <TeamChatPanel
                        teamId={selectedTeam.id}
                        members={selectedTeam.members}
                        currentUserEmail={user.email}
                        onUpgradeClick={() => setShowUpgradeModal(true)}
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
                          />
                        ) : (
                          <FileViewer
                            key={file.path}
                            filePath={file.path}
                            fileName={file.name}
                            fileId={file.id}
                            rootPath={selectedTeam.driveFolderId}
                            storageBackend={storageBackend || undefined}
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
                        setLeftPaneFiles(newFiles);
                        if (leftPaneTab === filePath) {
                          setLeftPaneTab(newFiles.length > 0 ? newFiles[0].path : (leftPaneShowGraph ? 'graph' : 'special://dashboard'));
                        }
                      }}
                      onGraphClose={() => {
                        // Switch to first open file or dashboard if Graph is closed
                        setLeftPaneShowGraph(false);
                        if (leftPaneFiles.length > 0) {
                          setLeftPaneTab(leftPaneFiles[0].path);
                        } else {
                          setLeftPaneTab('special://dashboard');
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
                        />
                      )}
                      {leftPaneTab === 'special://todos' && (
                        <TeamTodoPanel
                          teamId={selectedTeam.id}
                          members={selectedTeam.members}
                          currentUserEmail={user.email}
                        />
                      )}
                      {leftPaneTab === 'special://timeline' && (
                        <TeamTimelinePanel
                          teamId={selectedTeam.id}
                          members={selectedTeam.members}
                          currentUserEmail={user.email}
                        />
                      )}
                      {leftPaneTab === 'special://chat' && (
                        <TeamChatPanel
                          teamId={selectedTeam.id}
                          members={selectedTeam.members}
                          currentUserEmail={user.email}
                          onUpgradeClick={() => setShowUpgradeModal(true)}
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
                            />
                          ) : (
                            <FileViewer
                              key={file.path}
                              filePath={file.path}
                              fileName={file.name}
                              rootPath={selectedTeam.driveFolderId}
                              storageBackend={storageBackend || undefined}
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
                        setRightPaneFiles(newFiles);
                        if (rightPaneTab === filePath) {
                          setRightPaneTab(newFiles.length > 0 ? newFiles[0].path : (rightPaneShowGraph ? 'graph' : 'special://dashboard'));
                        }
                        if (newFiles.length === 0 && !rightPaneShowGraph) {
                          handleCloseSplitView();
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
                        />
                      )}
                      {rightPaneTab === 'special://todos' && (
                        <TeamTodoPanel
                          teamId={selectedTeam.id}
                          members={selectedTeam.members}
                          currentUserEmail={user.email}
                        />
                      )}
                      {rightPaneTab === 'special://timeline' && (
                        <TeamTimelinePanel
                          teamId={selectedTeam.id}
                          members={selectedTeam.members}
                          currentUserEmail={user.email}
                        />
                      )}
                      {rightPaneTab === 'special://chat' && (
                        <TeamChatPanel
                          teamId={selectedTeam.id}
                          members={selectedTeam.members}
                          currentUserEmail={user.email}
                          onUpgradeClick={() => setShowUpgradeModal(true)}
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
                            />
                          ) : (
                            <FileViewer
                              key={file.path}
                              filePath={file.path}
                              fileName={file.name}
                              rootPath={selectedTeam.driveFolderId}
                              storageBackend={storageBackend || undefined}
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
              allPaths={allPaths}
              mode="team"
              userRole={selectedTeam.members[user.email.toLowerCase()]?.role}
            />
          )}

          {/* Delete Confirmation Modal */}
          {deleteConfirmation && (
            <div className="delete-modal-overlay">
              <div className="delete-modal">
                <div className="delete-modal-header">
                  <h3>Delete {deleteConfirmation.itemName.endsWith('.md') ? 'Note' : 'Item'}</h3>
                </div>
                <div className="delete-modal-body">
                  <p>Are you sure you want to delete "{deleteConfirmation.itemName}"?</p>
                  <p className="delete-modal-hint">This action cannot be undone.</p>
                </div>
                <div className="delete-modal-footer">
                  <button
                    className="delete-modal-cancel"
                    onClick={() => setDeleteConfirmation(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="delete-modal-confirm"
                    onClick={confirmDeleteItem}
                  >
                    Delete
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
