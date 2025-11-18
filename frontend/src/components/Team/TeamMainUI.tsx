import { useState, useEffect, useRef, useCallback } from 'react';
import { User } from '../../services/authServiceTauri';
import { getUserTeams, Team } from '../../services/teamService';
import TitleBar from '../UI/TitleBar';
import { UnifiedSidebar } from '../../renderer/components/UnifiedSidebar';
import GraphView from '../Graph/GraphView';
import FileViewer from '../Viewers/FileViewer';
import { TabBar, OpenFile } from '../UI/TabBar';
import TodoPanel from '../Todo/TodoPanel';
import NoteTodosView from '../Todo/NoteTodosView';
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
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [graphKey, setGraphKey] = useState(0);
  const [todoKey, setTodoKey] = useState(0);
  const [filesWithIncomingLinks, setFilesWithIncomingLinks] = useState<Set<string>>(new Set());

  // Split view state (same as MainUI)
  const [splitView, setSplitView] = useState(false);
  const [activePane, setActivePane] = useState<EditorPane>('left');
  const [leftPaneTab, setLeftPaneTab] = useState<string>('graph');
  const [rightPaneTab, setRightPaneTab] = useState<string>('graph');
  const [leftPaneFiles, setLeftPaneFiles] = useState<OpenFile[]>([]);
  const [rightPaneFiles, setRightPaneFiles] = useState<OpenFile[]>([]);

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
        } else {
          // Restore single pane
          setOpenFiles(session.openFiles || []);
          setActiveTab(session.activeTab || 'graph');
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

  // Save session to localStorage whenever tabs change
  useEffect(() => {
    // Don't save until we've loaded the session
    if (!sessionLoaded) return;

    const session = {
      splitView,
      openFiles,
      activeTab,
      leftPaneFiles,
      rightPaneFiles,
      leftPaneTab,
      rightPaneTab,
      activePane
    };

    if (isDev) console.log('💾 Saving team session:', session);
    localStorage.setItem('teamEditorSession', JSON.stringify(session));
  }, [sessionLoaded, splitView, openFiles, activeTab, leftPaneFiles, rightPaneFiles, leftPaneTab, rightPaneTab, activePane]);

  // Load user's teams on mount
  useEffect(() => {
    loadTeams();
  }, [user.email]);

  const loadTeams = async () => {
    try {
      setLoading(true);
      console.log('🔄 Loading teams for user:', user.email);
      const userTeams = await getUserTeams(user.email);
      console.log('✅ Loaded teams:', userTeams);
      console.log('📋 Team details:', userTeams.map(t => ({
        name: t.name,
        driveFolderId: t.driveFolderId,
        createdBy: t.createdBy,
        createdAt: t.createdAt,
        members: Object.keys(t.members),
        yourRole: t.members[user.email]?.role,
        yourJoinedAt: t.members[user.email]?.joinedAt
      })));
      setTeams(userTeams);

      // Auto-select first team if available
      if (userTeams.length > 0 && !selectedTeam) {
        console.log('📌 Auto-selecting first team:', userTeams[0].name);
        setSelectedTeam(userTeams[0]);
      } else if (userTeams.length === 0) {
        // If no teams, show create team modal directly
        console.log('ℹ️ No teams found, showing create team modal');
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
    if (selectedTeam) {
      console.log('✅ Initializing team storage with Google Drive...');
      console.log('📁 Team:', selectedTeam.name);
      console.log('📁 Drive folder ID:', selectedTeam.driveFolderId);

      try {
        const backend = getTeamDriveStorage(selectedTeam.driveFolderId);
        setStorageBackend(backend);
        loadFileTree(backend);
      } catch (error) {
        console.error('❌ Failed to initialize storage backend:', error);
      }
    }
  }, [selectedTeam]);

  const loadFileTree = async (backend?: TeamDriveStorage) => {
    const backendToUse = backend || storageBackend;
    if (!backendToUse) {
      console.error('❌ Cannot load file tree - storage backend not initialized');
      return;
    }

    console.log('🔄 Loading file tree from Google Drive...');
    console.log('📁 Team folder ID:', selectedTeam?.driveFolderId);
    console.log('👤 Current user:', user.email);
    try {
      const tree = await backendToUse.getFileTree();
      setFileTree(tree);
      console.log(`✅ Loaded ${tree.length} items from Google Drive:`, tree);

      // Show diagnostic info if empty
      if (tree.length === 0) {
        console.log('⚠️ File tree is empty! This could mean:');
        console.log('  1. The Google Drive folder has no files yet');
        console.log('  2. You don\'t have access to the folder');
        console.log('  3. There was a permissions issue');
        console.log('💡 Try creating a new note to see if it appears.');
      }
    } catch (error) {
      console.error('❌ Failed to load file tree:', error);
      console.error('📊 Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        type: error?.constructor?.name,
        stack: error instanceof Error ? error.stack : undefined
      });

      // If authentication failed, show helpful message
      if (error instanceof Error && error.message.includes('Not authenticated')) {
        console.log('💡 Tip: Please make sure you are signed in with Google.');
      }
    }
  };

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
        // Clamp between 200px and 500px
        const clampedWidth = Math.min(Math.max(newWidth, 200), 500);
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
        console.log('🚀 [TEAM] DRAG START (tab):', draggedTab.fileName);
        setIsDragging(true);
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      console.log('🖱️ [TEAM] Mouse up detected', {
        hasDragStartPos: !!dragStartPos,
        hasDraggedTab: !!draggedTab,
        draggedTabName: draggedTab?.fileName
      });

      if (dragStartPos || draggedTab) {
        // Use refs to get the latest values
        const currentIsDragging = isDraggingRef.current;
        const currentDropZone = dropZoneRef.current;

        console.log('🏁 [TEAM] DRAG END (tab)', {
          isDragging: currentIsDragging,
          dropZone: currentDropZone,
          draggedTab: draggedTab?.fileName,
          mouseX: e.clientX,
          mouseY: e.clientY
        });

        // Only handle drop if we're dragging AND over a valid drop zone
        if (currentIsDragging && currentDropZone && (currentDropZone === 'left' || currentDropZone === 'right')) {
          console.log('✅ [TEAM] Valid drop - handling on', currentDropZone, 'side');
          handleTabDrop();
        } else {
          console.log('❌ [TEAM] No valid drop zone - tab stays in place', {
            isDragging: currentIsDragging,
            dropZone: currentDropZone,
            reason: !currentIsDragging ? 'not dragging' : !currentDropZone ? 'no drop zone' : 'invalid drop zone'
          });
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
    console.log('📂 handleSelectFile called:', { filePath, fileName, pane, splitView });

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
      // Single pane mode
      const existingFile = openFiles.find(f => f.path === filePath);
      if (existingFile) {
        setActiveTab(filePath);
      } else {
        setOpenFiles([...openFiles, { path: filePath, name: fileName, id: fileId }]);
        setActiveTab(filePath);
      }
    } else {
      // Split view mode - if no pane specified, default to left pane
      const targetPane = pane || 'left';
      const targetFiles = targetPane === 'left' ? leftPaneFiles : rightPaneFiles;
      const setTargetFiles = targetPane === 'left' ? setLeftPaneFiles : setRightPaneFiles;
      const setTargetTab = targetPane === 'left' ? setLeftPaneTab : setRightPaneTab;

      const existingFile = targetFiles.find(f => f.path === filePath);
      if (existingFile) {
        setTargetTab(filePath);
      } else {
        setTargetFiles([...targetFiles, { path: filePath, name: fileName, id: fileId }]);
        setTargetTab(filePath);
      }
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
      } else {
        setActiveTab('graph');
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
      console.log('⚠️ Save already in progress, ignoring duplicate call');
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
        // Create a new note file in Google Drive
        const fileName = newName.endsWith('.md') ? newName : `${newName}.md`;
        const initialContent = '';
        const parentFolderId = editing.id; // Google Drive folder ID

        console.log(`📝 Creating note: ${fileName} in folder ID: ${parentFolderId || 'root'}`);

        // OPTIMISTIC UPDATE: Add to UI immediately
        const tempNode: FileTreeNode = {
          path: fileName,
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

        // Now save to Google Drive in background
        storageBackend.saveFile(fileName, initialContent, parentFolderId, true).then(() => {
          console.log(`✅ Created note: ${fileName}`);
          // Sync file tree to get real ID and ensure consistency
          loadFileTree();
          setGraphKey(prev => prev + 1);
        }).catch(error => {
          console.error('Failed to create note:', error);
          // Revert optimistic update on error
          loadFileTree();
          alert(`Failed to create note: ${error.message}`);
        });

        // Open the newly created file immediately
        handleSelectFile(fileName, fileName);
      } else if (editing.type === 'new-folder') {
        // Create a new folder in Google Drive
        const parentFolderId = editing.id; // Google Drive folder ID
        console.log(`📁 Creating folder: ${newName} in folder ID: ${parentFolderId || 'root'}`);

        // OPTIMISTIC UPDATE: Add to UI immediately
        const tempNode: FileTreeNode = {
          path: newName,
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

        // Now create in Google Drive in background
        storageBackend.createFolder(newName, parentFolderId).then(() => {
          console.log(`✅ Created folder: ${newName}`);
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
        console.log(`✅ Renamed: ${oldFileName} -> ${newFileName}`);

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
      const newWidth = Math.max(200, Math.min(500, startWidth + (e.clientX - startX)));
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

    try {
      // Extract file/folder names from paths
      const sourceName = sourcePath.split(/[\\\/]/).pop() || sourcePath;
      const destName = destinationPath.split(/[\\\/]/).pop() || '';

      await storageBackend.moveItem(sourceName, destName);
      console.log(`✅ Moved "${sourceName}" to "${destName}"`);

      // Refresh file tree and graph
      await loadFileTree();
      setGraphKey(prev => prev + 1);
    } catch (error) {
      console.error('Failed to move item:', error);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, itemPath: string, itemType: 'file' | 'folder', itemName: string, itemId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('📋 handleContextMenu - itemPath:', itemPath, 'itemId:', itemId);
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
    console.log('[CLOSE SPLIT] 🔄 Closing split view');

    // Use provided files or fall back to current state
    const finalFiles = filesToTransfer || leftPaneFiles;
    const finalTab = tabToActivate || leftPaneTab;

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
    setOpenFiles(finalFiles);
    setActiveTab(finalTab);

    // Clear split view state
    setSplitView(false);
    setLeftPaneFiles([]);
    setLeftPaneTab('graph');
    setRightPaneFiles([]);
    setRightPaneTab('graph');
    setActivePane('left');

    console.log('[CLOSE SPLIT] ✅ Split view closed');
  };

  // Handle tab drop
  const handleTabDrop = useCallback(() => {
    if (!draggedTab) return;

    // Get the current drop zone from ref (not stale closure)
    const currentDropZone = dropZoneRef.current;

    console.log('🎯 [TEAM] Handling tab drop:', { draggedTab, dropZone: currentDropZone, splitView });

    const { filePath, fileName, sourcePane, id: fileId } = draggedTab;

    // Only handle if dropping on left or right edge
    if (!currentDropZone || (currentDropZone !== 'left' && currentDropZone !== 'right')) {
      console.log('❌ [TEAM] No valid drop zone - ignoring drop');
      setDraggedTab(null);
      setDropZone(null);
      return;
    }

    // Handle left/right edge drops - create new splits or move between panes
    if (currentDropZone === 'left' || currentDropZone === 'right') {
      if (!splitView) {
        // Create new split view
        console.log('✅ [TEAM] Creating new split view on', currentDropZone, 'side');

        // Remove the dragged file from openFiles
        const newOpenFiles = openFiles.filter(f => f.path !== filePath);

        if (currentDropZone === 'left') {
          // Drop on LEFT: dragged file goes to left pane, others to right
          console.log('📌 [TEAM] Setting up LEFT split:', { filePath, fileName, fileId, otherFiles: newOpenFiles });
          setLeftPaneFiles([{ path: filePath, name: fileName, id: fileId }]);
          setLeftPaneTab(filePath);

          setRightPaneFiles(newOpenFiles);
          setRightPaneTab(newOpenFiles.length > 0 ? newOpenFiles[0].path : 'graph');
          setActivePane('left');
        } else {
          // Drop on RIGHT: others stay on left, dragged file goes to right
          console.log('📌 [TEAM] Setting up RIGHT split:', { filePath, fileName, fileId, otherFiles: newOpenFiles });
          setLeftPaneFiles(newOpenFiles);
          setLeftPaneTab(newOpenFiles.length > 0 ? newOpenFiles[0].path : 'graph');

          setRightPaneFiles([{ path: filePath, name: fileName, id: fileId }]);
          setRightPaneTab(filePath);
          setActivePane('right');
        }

        // Enable split view and clear single pane state
        console.log('🔧 [TEAM] Enabling split view...', {
          currentSplitView: splitView,
          leftPaneWillHave: currentDropZone === 'left' ? 1 : newOpenFiles.length,
          rightPaneWillHave: currentDropZone === 'right' ? 1 : newOpenFiles.length
        });
        setSplitView(true);
        setOpenFiles([]);
        setActiveTab('graph');
        console.log('✅ [TEAM] Split view state updated!');
      } else {
        // Already in split view - move tab based on drop zone
        if (isDev) console.log('Moving tab in split view from', sourcePane, 'to', currentDropZone);

        if (currentDropZone === 'left') {
          // Drop on LEFT pane
          if (sourcePane === 'right') {
            // Move from right to left
            console.log('[DRAG] 📦 Moving from RIGHT to LEFT');
            console.log('[DRAG] 📋 Current state:', {
              leftPaneFiles: leftPaneFiles.map(f => f.name),
              rightPaneFiles: rightPaneFiles.map(f => f.name),
              draggedFile: fileName
            });

            const newRightFiles = rightPaneFiles.filter(f => f.path !== filePath);
            console.log('[DRAG] ➡️ New right pane files after removal:', newRightFiles.map(f => f.name));
            setRightPaneFiles(newRightFiles);

            const existingInLeft = leftPaneFiles.find(f => f.path === filePath);
            console.log('[DRAG] 🔍 File already exists in left?', !!existingInLeft);

            let newLeftFiles = leftPaneFiles;
            if (!existingInLeft) {
              newLeftFiles = [...leftPaneFiles, { path: filePath, name: fileName, id: fileId }];
              console.log('[DRAG] ⬅️ New left pane files after adding:', newLeftFiles.map(f => f.name));
              setLeftPaneFiles(newLeftFiles);
            }
            setLeftPaneTab(filePath);
            setActivePane('left');

            // Close split if right pane is empty
            if (newRightFiles.length === 0) {
              console.log('[DRAG] ⚠️ Right pane is now empty - closing split view!');
              console.log('[DRAG] 📊 Passing updated files to handleCloseSplitView:', newLeftFiles.map(f => f.name));
              // Pass the updated files directly to avoid stale state
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

    // Clear drag state
    setDraggedTab(null);
    setDropZone(null);
  }, [draggedTab, splitView, openFiles, activeTab, leftPaneFiles, rightPaneFiles, leftPaneTab, rightPaneTab]);

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
      console.log(`✅ Deleted: ${itemPath}`);

      // Close file if it's open
      const newOpenFiles = openFiles.filter(f => f.path !== itemPath);
      setOpenFiles(newOpenFiles);
      if (activeTab === itemPath) {
        setActiveTab(newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1].path : 'graph');
      }

      // Refresh
      await loadFileTree();
      setGraphKey(prev => prev + 1);
    } catch (error) {
      console.error('Failed to delete item:', error);
      alert(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleRenameItem = (itemPath: string) => {
    setEditing({ path: itemPath, type: 'rename' });
  };

  const handleCreateNote = (folderPath: string) => {
    console.log('📝 handleCreateNote - folderPath:', folderPath, 'folderId:', contextMenu?.itemId);
    setEditing({ path: folderPath, type: 'new-note', id: contextMenu?.itemId });
  };

  const handleCreateFolder = (folderPath: string) => {
    console.log('📁 handleCreateFolder - folderPath:', folderPath, 'folderId:', contextMenu?.itemId);
    setEditing({ path: folderPath, type: 'new-folder', id: contextMenu?.itemId });
  };

  const handleRefresh = async () => {
    await loadFileTree();
    setGraphKey(prev => prev + 1);
  };

  const getAllPaths = (nodes: FileTreeNode[]): string[] => {
    let paths: string[] = [];
    for (const node of nodes) {
      paths.push(node.path);
      if (node.children) {
        paths = paths.concat(getAllPaths(node.children));
      }
    }
    return paths;
  };

  if (loading) {
    return (
      <div className="team-main-ui">
        <TitleBar
          onSearchResultClick={() => {}}
          onSettingsOpen={() => setShowSettings(true)}
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
          onSettingsOpen={() => setShowSettings(true)}
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
          onSettingsOpen={() => setShowSettings(true)}
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
            onSearchResultClick={(filePath: string, fileName: string, line?: number) => {
              // Search result click - ignore line number for now, just open the file
              handleSelectFile(filePath, fileName);
            }}
            onGuideOpen={handleGuideOpen}
            onSettingsOpen={() => setShowSettings(true)}
            rootPath={selectedTeam.driveFolderId}
          />

          <div className="main-ui-content">
            {/* Left Sidebar - File Tree */}
            <div className="explorer-sidebar" style={{ width: `${sidebarWidth}px` }}>
              <UnifiedSidebar
                ref={sidebarRef}
                fileTree={fileTree}
                onSelectFile={handleSelectFile}
                getRootPath={() => selectedTeam.driveFolderId}
                editing={editing}
                onStartEditing={handleStartEditing}
                onFinishEditing={handleFinishEditing}
                refreshFileTree={() => loadFileTree()}
                onContextMenu={handleContextMenu}
                onMoveItem={handleMoveItem}
                onChangeFolderPath={() => {}}
                filesWithIncomingLinks={filesWithIncomingLinks}
                teamName={selectedTeam.name}
                onTeamManagement={() => setShowTeamManagement(true)}
                userRole={selectedTeam.members[user.email]?.role}
              />
            </div>

            {/* Sidebar Divider */}
            <div className="sidebar-divider" onMouseDown={handleSidebarDividerMouseDown}></div>

            {/* Main Content Area */}
            <div className="main-content" ref={mainContentRef}>
              {isDragging && <DropZoneOverlay containerRef={mainContentRef} />}

              {!splitView ? (
                // Single pane mode
                <>
                  <TabBar
                    activeTab={activeTab}
                    openFiles={openFiles}
                    showGraphTab={true}
                    onTabClick={setActiveTab}
                    onTabClose={handleCloseFile}
                    dragStartPos={dragStartPos}
                    setDragStartPos={setDragStartPos}
                    isPaneActive={true}
                    onRevealInTree={handleRevealInTree}
                    onPaneActivate={() => setActivePane('left')}
                  />
                  <div className="tab-content" onClick={() => setActivePane('left')}>
                    {activeTab === 'graph' && (
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
                    {activeTab === 'special://todos' && (
                      <NoteTodosView
                        key={todoKey}
                        rootPath={selectedTeam.driveFolderId}
                        onOpenFile={handleSelectFile}
                        onTodoCreated={() => setTodoKey(prev => prev + 1)}
                      />
                    )}
                    {activeTab === 'special://timeline' && (
                      <TodoPanel
                        key={todoKey}
                        initialView="timeline"
                        rootPath={selectedTeam.driveFolderId}
                        onTodoCreated={() => setTodoKey(prev => prev + 1)}
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
                              console.log('[TeamMainUI] onFileRenamed callback:', { oldPath, newPath, newName, currentOpenFiles: openFiles });

                              const updatedOpenFiles = openFiles.map(f =>
                                f.path === oldPath ? { path: newPath, name: newName } : f
                              );

                              console.log('[TeamMainUI] Updated open files:', updatedOpenFiles);

                              setOpenFiles(updatedOpenFiles);
                              if (activeTab === oldPath) {
                                console.log('[TeamMainUI] Updating active tab from', activeTab, 'to', newPath);
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
                      showGraphTab={true}
                      onTabClick={setLeftPaneTab}
                      onTabClose={(filePath) => {
                        const newFiles = leftPaneFiles.filter(f => f.path !== filePath);
                        setLeftPaneFiles(newFiles);
                        if (leftPaneTab === filePath) {
                          setLeftPaneTab(newFiles.length > 0 ? newFiles[0].path : 'graph');
                        }
                      }}
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
                      {leftPaneTab === 'special://todos' && (
                        <NoteTodosView
                          key={todoKey}
                          rootPath={selectedTeam.driveFolderId}
                          onOpenFile={(path, name) => handleSelectFile(path, name, 'left')}
                          onTodoCreated={() => setTodoKey(prev => prev + 1)}
                        />
                      )}
                      {leftPaneTab === 'special://timeline' && (
                        <TodoPanel
                          key={todoKey}
                          initialView="timeline"
                          rootPath={selectedTeam.driveFolderId}
                          onTodoCreated={() => setTodoKey(prev => prev + 1)}
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
                      showGraphTab={rightPaneFiles.length === 0 && rightPaneTab !== ''}
                      onTabClick={setRightPaneTab}
                      onTabClose={(filePath) => {
                        const newFiles = rightPaneFiles.filter(f => f.path !== filePath);
                        setRightPaneFiles(newFiles);
                        if (rightPaneTab === filePath) {
                          setRightPaneTab(newFiles.length > 0 ? newFiles[0].path : 'graph');
                        }
                        if (newFiles.length === 0) {
                          handleCloseSplitView();
                        }
                      }}
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
                      {rightPaneTab === 'special://todos' && (
                        <NoteTodosView
                          key={todoKey}
                          rootPath={selectedTeam.driveFolderId}
                          onOpenFile={(path, name) => handleSelectFile(path, name, 'right')}
                          onTodoCreated={() => setTodoKey(prev => prev + 1)}
                        />
                      )}
                      {rightPaneTab === 'special://timeline' && (
                        <TodoPanel
                          key={todoKey}
                          initialView="timeline"
                          rootPath={selectedTeam.driveFolderId}
                          onTodoCreated={() => setTodoKey(prev => prev + 1)}
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

          {/* Settings Panel */}
          {showSettings && (
            <SettingsPanel
              onClose={() => setShowSettings(false)}
              currentTeam={selectedTeam}
              availableTeams={teams}
              onSwitchTeam={(team) => {
                setSelectedTeam(team);
                setShowSettings(false);
              }}
            />
          )}

          {/* Team Management Modal */}
          {showTeamManagement && (
            <TeamManagementModal
              team={selectedTeam}
              onClose={() => setShowTeamManagement(false)}
              onInviteMore={() => {
                setShowInviteMember(true);
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
              allPaths={getAllPaths(fileTree)}
              mode="team"
              userRole={selectedTeam.members[user.email]?.role}
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
