import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { writeFile } from '@tauri-apps/plugin-fs'
import { UnifiedSidebar } from '../renderer/components/UnifiedSidebar'
import TitleBar from './UI/TitleBar'
import IconRail from './UI/IconRail'
import GraphView from './Graph/GraphView'
import ContextMenu from './UI/ContextMenu'
import HelpModal from './UI/HelpModal'
import ConfirmModal from './UI/ConfirmModal'
import { TabBar, OpenFile } from './UI/TabBar'
import { DropZoneOverlay } from './UI/DropZoneOverlay'
import { useDragDrop, EditorPane } from '../contexts/DragDropContext'
import { getFilesWithIncomingLinks } from '../utils/graphUtils'
import { useAuth } from '../contexts/AuthContext'
import { getUserWorkspace, Workspace, getMemberRole, WorkspaceRole } from '../services/workspaceService'
import {
  LocalWhiteboard,
  getLocalWhiteboards,
  createUntitledLocalWhiteboard,
  renameLocalWhiteboard,
  deleteLocalWhiteboard,
} from '../services/localWhiteboardService'
import { WhiteboardMeta } from '../services/whiteboardTypes'
import './MainUI.css'

// Lazy load heavy components for better initial load performance
const FileViewer = lazy(() => import('./Viewers/FileViewer'))
const TodoPanel = lazy(() => import('./Todo/TodoPanel'))
const NoteTodosView = lazy(() => import('./Todo/NoteTodosView'))
const SettingsPanel = lazy(() => import('./Settings/SettingsPanel'))
const DashboardPanel = lazy(() => import('./Dashboard/DashboardPanel'))
const AdminDashboard = lazy(() => import('./Workspace/AdminDashboard'))
const LeaderDashboard = lazy(() => import('./Workspace/LeaderDashboard'))
const LocalWhiteboardPanel = lazy(() => import('./Whiteboard/LocalWhiteboardPanel'))

// Development mode flag
const isDev = import.meta.env.DEV

// Loading fallback component for lazy-loaded components
const LoadingFallback = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#cccccc',
    fontSize: '14px'
  }}>
    Loading...
  </div>
)

interface MainUIProps {
  rootPath: string
  onRootPathChange?: (newPath: string) => void
}

interface FileTreeNode {
  path: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
  id?: string; // Google Drive file ID (for team mode)
}

interface EditingState {
  path: string;
  type: 'rename' | 'new-note' | 'new-folder';
  id?: string; // Google Drive file ID (for team mode)
}

interface ContextMenuState {
  x: number;
  y: number;
  itemPath: string;
  itemType: 'file' | 'folder';
  itemName: string;
  itemId?: string; // Google Drive file ID (for team mode)
}


function MainUI({ rootPath, onRootPathChange }: MainUIProps) {
  const { draggedTab, setDraggedTab, dropZone, setDropZone, isDragging, setIsDragging } = useDragDrop();
  const mainContentRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<{ revealFile: (filePath: string) => void }>(null);

  // Refs to capture latest state values for event handlers
  const isDraggingRef = useRef(isDragging);
  const dropZoneRef = useRef(dropZone);

  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [activeTab, setActiveTab] = useState<string>('') // 'special://graph' | 'special://timeline' | file path
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([])
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [graphKey, setGraphKey] = useState(0) // For forcing graph refresh
  const [todoKey, setTodoKey] = useState(0) // For forcing todo views refresh
  const [activeGuide, setActiveGuide] = useState<'shortcuts' | 'markdown' | null>(null)
  const [filesWithIncomingLinks, setFilesWithIncomingLinks] = useState<Set<string>>(new Set())
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ show: boolean; itemPath: string; itemName: string } | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showAdminDashboard, setShowAdminDashboard] = useState(false)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [userRole, setUserRole] = useState<WorkspaceRole | null>(null)
  const { user } = useAuth()

  // Whiteboard state for local mode
  const [localWhiteboards, setLocalWhiteboards] = useState<LocalWhiteboard[]>([])
  const [activeWhiteboardId, setActiveWhiteboardId] = useState<string | null>(null)
  const [renamingWhiteboardId, setRenamingWhiteboardId] = useState<string | null>(null)
  const [whiteboardContextMenu, setWhiteboardContextMenu] = useState<{
    x: number;
    y: number;
    whiteboard: LocalWhiteboard;
  } | null>(null)

  // Helper function to extract all paths from file tree
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

  // Split view state
  const [splitView, setSplitView] = useState(false)
  const [activePane, setActivePane] = useState<EditorPane>('left')
  const [leftPaneTab, setLeftPaneTab] = useState<string>('')
  const [rightPaneTab, setRightPaneTab] = useState<string>('')
  const [leftPaneFiles, setLeftPaneFiles] = useState<OpenFile[]>([])
  const [rightPaneFiles, setRightPaneFiles] = useState<OpenFile[]>([])

  // Resizable split view
  const [leftPaneWidth, setLeftPaneWidth] = useState(50) // Percentage
  const [isResizingPane, setIsResizingPane] = useState(false)

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(250) // Pixels
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [sessionLoaded, setSessionLoaded] = useState(false) // Track if session was restored
  const [hasUpdate, setHasUpdate] = useState(false) // Track if update is available

  // Keep refs in sync with state
  useEffect(() => {
    isDraggingRef.current = isDragging;
    dropZoneRef.current = dropZone;
  }, [isDragging, dropZone]);

  // Tauri native file drop handling - register at MainUI level so drag visual works
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupTauriDragDrop = async () => {
      try {
        const appWindow = getCurrentWindow();
        unlisten = await appWindow.onDragDropEvent((event) => {
          if (isDev) console.log('[TAURI DRAG MainUI] Event:', event.payload.type);

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

            // Emit custom event for sidebar drag indicator
            window.dispatchEvent(new CustomEvent('sidebar-external-drag', {
              detail: { isDragging: isOverSidebar, position }
            }));
          } else if (event.payload.type === 'leave') {
            // User left the window - hide all overlays
            window.dispatchEvent(new CustomEvent('sidebar-external-drag', { detail: { isDragging: false } }));
          } else if (event.payload.type === 'drop') {
            // Files were dropped - hide sidebar indicator
            window.dispatchEvent(new CustomEvent('sidebar-external-drag', { detail: { isDragging: false } }));

            const dropPosition = event.payload.position;
            const filePaths = event.payload.paths;

            // Check if drop is over the sidebar - if so, dispatch to sidebar handler
            if (dropPosition) {
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

  // Load workspace for team mode
  useEffect(() => {
    const loadWorkspace = async () => {
      if (user) {
        try {
          const userWorkspace = await getUserWorkspace(user.uid);
          setWorkspace(userWorkspace);

          // Get user's role in workspace
          if (userWorkspace) {
            const role = await getMemberRole(userWorkspace.id, user.uid);
            setUserRole(role);
          }
        } catch (error) {
          console.error('Error loading workspace:', error);
        }
      }
    };

    loadWorkspace();
  }, [user]);

  // Debug: Log split view state changes
  useEffect(() => {
    if (isDev) {
      console.log('Split view state changed:', {
        splitView,
        leftPaneFiles: leftPaneFiles.length,
        rightPaneFiles: rightPaneFiles.length,
        leftPaneTab,
        rightPaneTab
      })
    }
  }, [splitView, leftPaneFiles, rightPaneFiles, leftPaneTab, rightPaneTab])

  // Load session from localStorage on mount
  useEffect(() => {
    try {
      const savedSession = localStorage.getItem('editorSession')
      if (savedSession) {
        const session = JSON.parse(savedSession)
        if (isDev) console.log('📂 Restoring session:', session)

        if (session.splitView) {
          // Restore split view
          setSplitView(true)
          setLeftPaneFiles(session.leftPaneFiles || [])
          setRightPaneFiles(session.rightPaneFiles || [])
          setLeftPaneTab(session.leftPaneTab || 'graph')
          setRightPaneTab(session.rightPaneTab || 'graph')
          setActivePane(session.activePane || 'left')
        } else {
          // Restore single pane
          setOpenFiles(session.openFiles || [])
          setActiveTab(session.activeTab || 'graph')
        }

        setSessionLoaded(true)
      } else {
        setSessionLoaded(true)
      }
    } catch (error) {
      console.error('Failed to restore session:', error)
      setSessionLoaded(true)
    }
  }, [])

  // Save session to localStorage whenever tabs change (debounced for performance)
  useEffect(() => {
    // Don't save until we've loaded the session
    if (!sessionLoaded) return

    const timeoutId = setTimeout(() => {
      const session = {
        splitView,
        openFiles,
        activeTab,
        leftPaneFiles,
        rightPaneFiles,
        leftPaneTab,
        rightPaneTab,
        activePane
      }

      if (isDev) console.log('💾 Saving session:', session)
      localStorage.setItem('editorSession', JSON.stringify(session))
    }, 500) // Debounce: wait 500ms after last change before saving

    return () => clearTimeout(timeoutId)
  }, [sessionLoaded, splitView, openFiles, activeTab, leftPaneFiles, rightPaneFiles, leftPaneTab, rightPaneTab, activePane])

  const loadFileTree = useCallback(async () => {
    try {
      const tree = await invoke<FileTreeNode[]>('get_file_tree', { rootPath })
      setFileTree(tree)
    } catch (error) {
      console.error('Failed to load file tree:', error)
    }
  }, [rootPath])

  // Update files with incoming links whenever the file tree changes
  const updateFilesWithIncomingLinks = useCallback(async () => {
    try {
      // Get all file contents using the existing get_markdown_files command
      const result = await invoke<{ files: Array<{ path: string; content: string }>; folders: string[] }>('get_markdown_files', { rootPath })

      // Calculate which files have incoming wiki-links
      const linkedFiles = getFilesWithIncomingLinks(result.files)
      setFilesWithIncomingLinks(linkedFiles)
    } catch (error) {
      console.error('Failed to update files with incoming links:', error)
    }
  }, [rootPath])

  useEffect(() => {
    loadFileTree()
    updateFilesWithIncomingLinks()
  }, [loadFileTree, updateFilesWithIncomingLinks])

  // Load whiteboards for local mode
  const loadWhiteboards = useCallback(async () => {
    try {
      const wbs = await getLocalWhiteboards(rootPath)
      setLocalWhiteboards(wbs)
      // Auto-select first whiteboard if none selected
      if (!activeWhiteboardId && wbs.length > 0) {
        setActiveWhiteboardId(wbs[0].id)
      }
    } catch (error) {
      console.error('Failed to load whiteboards:', error)
    }
  }, [rootPath, activeWhiteboardId])

  useEffect(() => {
    loadWhiteboards()
  }, [loadWhiteboards])

  // Whiteboard handlers for local mode
  const handleCreateWhiteboard = useCallback(async () => {
    try {
      const newWb = await createUntitledLocalWhiteboard(rootPath)
      setLocalWhiteboards(prev => [newWb, ...prev])
      setActiveWhiteboardId(newWb.id)
      // Navigate to whiteboard tab
      handleSelectFile('special://whiteboard', newWb.name)
    } catch (error) {
      console.error('Failed to create whiteboard:', error)
    }
  }, [rootPath])

  const handleSelectWhiteboard = useCallback((whiteboardId: string) => {
    setActiveWhiteboardId(whiteboardId)
    const wb = localWhiteboards.find(w => w.id === whiteboardId)
    if (wb) {
      handleSelectFile('special://whiteboard', wb.name)
    }
  }, [localWhiteboards])

  const handleWhiteboardContextMenu = useCallback((e: React.MouseEvent, whiteboard: LocalWhiteboard) => {
    e.preventDefault()
    setWhiteboardContextMenu({
      x: e.clientX,
      y: e.clientY,
      whiteboard,
    })
  }, [])

  const handleWhiteboardRename = useCallback(async (id: string, newName: string) => {
    try {
      await renameLocalWhiteboard(rootPath, id, newName.trim())
      setLocalWhiteboards(prev =>
        prev.map(wb => wb.id === id ? { ...wb, name: newName.trim() } : wb)
      )
      setRenamingWhiteboardId(null)
    } catch (error) {
      console.error('Failed to rename whiteboard:', error)
    }
  }, [rootPath])

  const handleWhiteboardDelete = useCallback(async (id: string) => {
    try {
      await deleteLocalWhiteboard(rootPath, id)
      setLocalWhiteboards(prev => prev.filter(wb => wb.id !== id))
      if (activeWhiteboardId === id) {
        const remaining = localWhiteboards.filter(wb => wb.id !== id)
        setActiveWhiteboardId(remaining.length > 0 ? remaining[0].id : null)
      }
      setWhiteboardContextMenu(null)
    } catch (error) {
      console.error('Failed to delete whiteboard:', error)
    }
  }, [rootPath, activeWhiteboardId, localWhiteboards])

  // Convert LocalWhiteboard to WhiteboardMeta for UnifiedSidebar
  const whiteboardsForSidebar: WhiteboardMeta[] = useMemo(() => {
    return localWhiteboards.map(wb => ({
      id: wb.id,
      teamId: 'local', // Dummy value for local mode
      name: wb.name,
      createdBy: 'local',
      createdByName: 'You',
      createdAt: new Date(wb.createdAt),
      updatedAt: new Date(wb.updatedAt),
      thumbnail: wb.thumbnail,
    }))
  }, [localWhiteboards])

  // Refs for keyboard shortcuts to avoid re-registering event listener
  const activeTabRef = useRef(activeTab)
  const splitViewRef = useRef(splitView)
  const activeGuideRef = useRef(activeGuide)
  const activePaneRef = useRef(activePane)
  const leftPaneTabRef = useRef(leftPaneTab)
  const rightPaneTabRef = useRef(rightPaneTab)
  const leftPaneFilesRef = useRef(leftPaneFiles)
  const rightPaneFilesRef = useRef(rightPaneFiles)
  const openFilesRef = useRef(openFiles)

  // Update refs when values change
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  useEffect(() => { splitViewRef.current = splitView }, [splitView])
  useEffect(() => { activeGuideRef.current = activeGuide }, [activeGuide])
  useEffect(() => { activePaneRef.current = activePane }, [activePane])
  useEffect(() => { leftPaneTabRef.current = leftPaneTab }, [leftPaneTab])
  useEffect(() => { rightPaneTabRef.current = rightPaneTab }, [rightPaneTab])
  useEffect(() => { leftPaneFilesRef.current = leftPaneFiles }, [leftPaneFiles])
  useEffect(() => { rightPaneFilesRef.current = rightPaneFiles }, [rightPaneFiles])
  useEffect(() => { openFilesRef.current = openFiles }, [openFiles])

  // Keyboard shortcuts - registered once, uses refs for current values
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC - Close help modal
      if (e.key === 'Escape' && activeGuideRef.current) {
        e.preventDefault()
        setActiveGuide(null)
        return
      }

      // Ctrl+W or Cmd+W (Mac) - Close active tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault() // Prevent browser from closing tab/window

        if (!splitViewRef.current) {
          // Single pane mode: close active file or special tab
          if (activeTabRef.current) {
            if (activeTabRef.current.startsWith('special://')) {
              // Close special tab (Todos/Timeline)
              const newFiles = openFilesRef.current.filter(f => f.path !== activeTabRef.current)
              setOpenFiles(newFiles)
              setActiveTab(newFiles.length > 0 ? newFiles[0].path : '')
            } else {
              // Close regular file
              handleCloseFile(activeTabRef.current)
            }
          }
        } else {
          // Split view mode: close active file in active pane
          if (activePaneRef.current === 'left') {
            if (leftPaneTabRef.current) {
              const newFiles = leftPaneFilesRef.current.filter(f => f.path !== leftPaneTabRef.current)
              setLeftPaneFiles(newFiles)
              if (newFiles.length > 0) {
                setLeftPaneTab(newFiles[0].path)
              } else {
                setLeftPaneTab('')
              }
            }
          } else if (activePaneRef.current === 'right') {
            if (rightPaneTabRef.current) {
              const newFiles = rightPaneFilesRef.current.filter(f => f.path !== rightPaneTabRef.current)
              setRightPaneFiles(newFiles)
              if (newFiles.length > 0) {
                setRightPaneTab(newFiles[0].path)
              } else {
                // Close split view when last tab in right pane is closed
                handleCloseSplitView()
              }
            }
          }
        }
      }

      // Ctrl+\ or Cmd+\ (Mac) - Toggle split view
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault()
        if (splitViewRef.current) {
          handleCloseSplitView()
        } else {
          // Open split view: Current content on left, empty right pane
          setSplitView(true)

          // Transfer current state to left pane
          setLeftPaneFiles(openFilesRef.current)
          setLeftPaneTab(activeTabRef.current)

          // Right pane: empty with null/empty state
          setRightPaneFiles([])
          setRightPaneTab('') // Empty string means no content will render

          setActivePane('left')
          // Clear single pane state
          setOpenFiles([])
          setActiveTab('graph')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, []) // Empty dependency array - listener registered once!

  // Handle pane resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingPane && mainContentRef.current) {
        const container = mainContentRef.current
        const containerRect = container.getBoundingClientRect()
        const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100

        // Clamp between 20% and 80% to prevent panels from getting too small
        const clampedWidth = Math.min(Math.max(newLeftWidth, 20), 80)
        setLeftPaneWidth(clampedWidth)
      }
    }

    const handleMouseUp = () => {
      if (isResizingPane) {
        setIsResizingPane(false)
      }
    }

    if (isResizingPane) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizingPane])

  const handleDividerMouseDown = () => {
    setIsResizingPane(true)
  }

  // Handle sidebar resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        const newWidth = e.clientX
        // Clamp between 100px and 500px
        const clampedWidth = Math.min(Math.max(newWidth, 100), 500)
        setSidebarWidth(clampedWidth)
      }
    }

    const handleMouseUp = () => {
      if (isResizingSidebar) {
        setIsResizingSidebar(false)
      }
    }

    if (isResizingSidebar) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizingSidebar])

  const handleSidebarDividerMouseDown = () => {
    setIsResizingSidebar(true)
  }

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
        if (isDev) console.log('🚀 DRAG START (tab):', draggedTab.fileName);
        setIsDragging(true);
      }
    };

    const handleGlobalMouseUp = () => {
      if (dragStartPos || draggedTab) {
        // Use refs to get the latest values
        const currentIsDragging = isDraggingRef.current;
        const currentDropZone = dropZoneRef.current;

        if (isDev) {
          console.log('🏁 DRAG END (tab)', {
            isDragging: currentIsDragging,
            dropZone: currentDropZone,
            draggedTab: draggedTab?.fileName
          });
        }

        // Only handle cross-pane drop if we're dragging AND over a valid drop zone
        // Note: Tab reordering within the same pane is handled by TabBar's mouseup handler (capture phase)
        if (currentIsDragging && currentDropZone && (currentDropZone === 'left' || currentDropZone === 'right')) {
          if (isDev) console.log('✅ Valid drop - handling on', currentDropZone, 'side');
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

  const handleSelectFile = useCallback((filePath: string, fileName: string, pane?: EditorPane) => {

    if (!splitView) {
      // Single pane mode
      setOpenFiles(prev => {
        const existingFile = prev.find(f => f.path === filePath)
        if (existingFile) {
          setActiveTab(filePath)
          return prev
        } else {
          setActiveTab(filePath)
          return [...prev, { path: filePath, name: fileName }]
        }
      })
    } else {
      // Split view mode - if no pane specified, default to left pane
      const targetPane = pane || 'left';

      if (targetPane === 'left') {
        setLeftPaneFiles(prev => {
          const existingFile = prev.find(f => f.path === filePath)
          if (existingFile) {
            setLeftPaneTab(filePath)
            return prev
          } else {
            setLeftPaneTab(filePath)
            return [...prev, { path: filePath, name: fileName }]
          }
        })
      } else {
        setRightPaneFiles(prev => {
          const existingFile = prev.find(f => f.path === filePath)
          if (existingFile) {
            setRightPaneTab(filePath)
            return prev
          } else {
            setRightPaneTab(filePath)
            return [...prev, { path: filePath, name: fileName }]
          }
        })
      }
      setActivePane(targetPane)
    }
  }, [splitView])

  const handleCloseFile = (filePath: string) => {
    const fileIndex = openFiles.findIndex(f => f.path === filePath)
    const newOpenFiles = openFiles.filter(f => f.path !== filePath)
    setOpenFiles(newOpenFiles)

    // If closing the active tab, switch to another tab
    if (activeTab === filePath) {
      if (newOpenFiles.length > 0) {
        // Switch to the previous file if available, otherwise the next one
        const newActiveIndex = Math.max(0, fileIndex - 1)
        setActiveTab(newOpenFiles[newActiveIndex]?.path || 'graph')
      } else {
        // No files left, switch to graph
        setActiveTab('graph')
      }
    }
  }

  const handleStartEditing = (path: string, type: 'rename' | 'new-note' | 'new-folder') => {
    setEditing({ path, type })
  }

  const handleFinishEditing = async (newName?: string) => {
    if (!editing || !newName || newName.trim() === '') {
      setEditing(null)
      return
    }

    try {
      if (editing.type === 'new-note') {
        if (isDev) console.log('📝 Creating file with parentPath:', editing.path, 'fileName:', newName)
        const result = await invoke<{ success: boolean; path?: string; name?: string; error?: string }>('create_file', {
          parentPath: editing.path,
          fileName: newName
        })

        if (result.success) {
          await loadFileTree()
          await updateFilesWithIncomingLinks()
          if (isDev) console.log('Created file:', result.path)
        } else {
          console.error('Failed to create file:', result.error)
          alert(`Failed to create file: ${result.error}`)
        }
      } else if (editing.type === 'new-folder') {
        const result = await invoke<{ success: boolean; path?: string; name?: string; error?: string }>('create_folder', {
          parentPath: editing.path,
          folderName: newName
        })

        if (result.success) {
          await loadFileTree()
          await updateFilesWithIncomingLinks()
          if (isDev) console.log('Created folder:', result.path)
        } else {
          console.error('Failed to create folder:', result.error)
          alert(`Failed to create folder: ${result.error}`)
        }
      } else if (editing.type === 'rename') {
        const result = await invoke<{ success: boolean; path?: string; name?: string; error?: string }>('rename_item', {
          oldPath: editing.path,
          newName: newName,
          rootPath: rootPath
        })

        if (result.success) {
          await loadFileTree()
          await updateFilesWithIncomingLinks()
          if (isDev) console.log('Renamed item:', result.path)

          // Refresh graph if it was a markdown file
          if (editing.path.endsWith('.md')) {
            setGraphKey(prev => prev + 1)
          }
        } else {
          console.error('Failed to rename item:', result.error)
          alert(`Failed to rename: ${result.error}`)
        }
      }
    } catch (error) {
      console.error('Error during editing:', error)
      alert('An error occurred while creating/renaming the file/folder')
    }

    setEditing(null)
  }

  const handleContextMenu = (e: React.MouseEvent, itemPath: string, itemType: 'file' | 'folder', itemName: string, itemId?: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      itemPath,
      itemType,
      itemName,
      itemId
    })
  }

  const handleGraphNodeContextMenu = (e: React.MouseEvent, node: any) => {
    e.preventDefault()
    e.stopPropagation()

    // Extract file name from node
    const fileName = node.name + (node.fileType === 'markdown' ? '.md' : '')

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      itemPath: node.path,
      itemType: node.type === 'folder' || node.type === 'root' ? 'folder' : 'file',
      itemName: fileName
    })
  }

  const handleDeleteItem = (itemPath: string, itemName: string) => {
    setDeleteConfirmation({ show: true, itemPath, itemName })
  }

  const confirmDeleteItem = async () => {
    if (!deleteConfirmation) return

    const itemPath = deleteConfirmation.itemPath
    setDeleteConfirmation(null)

    try {
      const result = await invoke<{ success: boolean; error?: string }>('delete_item', {
        itemPath
      })

      if (result.success) {
        await loadFileTree()
        await updateFilesWithIncomingLinks()
        if (isDev) console.log('Deleted item:', itemPath)
      } else {
        console.error('Failed to delete item:', result.error)
        alert(`Failed to delete: ${result.error}`)
      }
    } catch (error) {
      console.error('Error deleting item:', error)
      alert('An error occurred while deleting the item')
    }
  }

  const handleRenameItem = (itemPath: string) => {
    setEditing({ path: itemPath, type: 'rename' })
  }

  const handleCreateNote = (parentPath: string) => {
    if (isDev) console.log('🆕 handleCreateNote called with parentPath:', parentPath)
    setEditing({ path: parentPath, type: 'new-note' })
  }

  const handleCreateFolder = (parentPath: string) => {
    if (isDev) console.log('📁 handleCreateFolder called with parentPath:', parentPath)
    setEditing({ path: parentPath, type: 'new-folder' })
  }

  const handleRefresh = async () => {
    await loadFileTree()
    await updateFilesWithIncomingLinks()
  }

  const handleRevealInExplorer = async (itemPath: string) => {
    try {
      await invoke('reveal_in_explorer', { path: itemPath })
    } catch (error) {
      console.error('Error revealing in explorer:', error)
      alert('Failed to open file explorer')
    }
  }

  const handleOpenExternal = async (itemPath: string) => {
    try {
      await invoke('open_file_external', { path: itemPath })
    } catch (error) {
      console.error('Error opening file externally:', error)
      alert('Failed to open file in external application')
    }
  }

  const _handleChangeFolderPath = async () => {
    try {
      const newFolder = await invoke<string | null>('select_folder')
      if (newFolder && onRootPathChange) {
        // Save the new root folder
        await invoke('save_root_folder', { folderPath: newFolder })
        // Notify parent to update the root path
        onRootPathChange(newFolder)
      }
    } catch (error) {
      console.error('Error selecting folder:', error)
      alert('Failed to select folder')
    }
  }
  void _handleChangeFolderPath // Reserved for future use

  // Wrapper for TitleBar search results that adapts the line parameter
  const handleSearchResultClick = (filePath: string, fileName: string, _line?: number) => {
    // Note: line parameter is not currently used but preserved for future content-based search
    handleSelectFile(filePath, fileName)
  }

  const handleGuideOpen = (guideName: 'shortcuts' | 'markdown') => {
    if (isDev) console.log('Opening guide:', guideName)
    setActiveGuide(guideName)
  }

  const handleRevealInTree = (filePath: string) => {
    if (isDev) console.log('📂 Revealing in tree:', filePath)
    if (sidebarRef.current) {
      sidebarRef.current.revealFile(filePath)
    }
  }

  const handleMoveItem = async (sourcePath: string, destinationPath: string) => {
    try {
      if (isDev) console.log('🔄 Moving:', sourcePath, 'to:', destinationPath)

      const result = await invoke<{ success: boolean; path?: string; name?: string; error?: string }>('move_item', {
        sourcePath: sourcePath,
        destinationPath: destinationPath
      })

      if (result.success) {
        if (isDev) console.log('✅ Move successful! New path:', result.path, 'New name:', result.name)
        // Refresh the file tree to show the updated structure
        await loadFileTree()
        await updateFilesWithIncomingLinks()
      } else {
        console.error('❌ Failed to move item:', result.error)
        // Don't show alert for "already in folder" case
        if (result.error !== "Item is already in this folder") {
          alert(`Failed to move: ${result.error}`)
        }
      }
    } catch (error) {
      console.error('❌ Error moving item:', error)
      alert(`An error occurred while moving the item: ${error}`)
    }
  }

  // Handle dropping external files (from OS file explorer) onto folders
  const handleDropExternalFiles = async (files: File[], destinationPath: string) => {
    try {
      if (isDev) console.log('📂 Saving external files to:', destinationPath, files.map(f => f.name))

      for (const file of files) {
        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)

        // Construct destination file path
        const separator = destinationPath.includes('/') ? '/' : '\\'
        const destFilePath = `${destinationPath}${separator}${file.name}`

        if (isDev) console.log('   💾 Writing:', file.name, 'to', destFilePath)

        // Write the file
        await writeFile(destFilePath, uint8Array)
      }

      // Refresh the file tree to show the new files
      await loadFileTree()

      if (isDev) console.log('✅ All files saved successfully!')
    } catch (error) {
      console.error('❌ Error saving external files:', error)
      alert(`Failed to save files: ${error}`)
    }
  }

  // Handle dropping external directories (from OS file explorer) onto folders
  const handleDropExternalDirectory = async (sourcePath: string, destinationPath: string) => {
    try {
      if (isDev) console.log('📂 Copying directory:', sourcePath, 'to:', destinationPath)

      // Use Tauri command to copy the directory recursively
      await invoke('copy_directory', { source: sourcePath, destination: destinationPath })

      // Refresh the file tree to show the new folder
      await loadFileTree()

      if (isDev) console.log('✅ Directory copied successfully!')
    } catch (error) {
      console.error('❌ Error copying directory:', error)
      alert(`Failed to copy folder: ${error}`)
    }
  }

  const handleOpenInSecondPane = (filePath: string, fileName: string) => {
    if (isDev) {
      console.log('Opening in second pane:', filePath, fileName)
      console.log('Current splitView state:', splitView)
    }

    if (!splitView) {
      // Transfer current files to left pane
      setLeftPaneFiles(openFiles)
      setLeftPaneTab(activeTab)
      setSplitView(true)

      // Clear single pane state
      setOpenFiles([])
      setActiveTab('graph')
    }

    // Add file to right pane
    const existingFile = rightPaneFiles.find(f => f.path === filePath)
    if (!existingFile) {
      setRightPaneFiles([...rightPaneFiles, { path: filePath, name: fileName }])
    }
    setRightPaneTab(filePath)
    setActivePane('right')
  }

  const handleCloseSplitView = (filesToTransfer?: OpenFile[], tabToActivate?: string) => {
    // Use provided files or fall back to current state
    const finalFiles = filesToTransfer || leftPaneFiles;
    const finalTab = tabToActivate || leftPaneTab;

    // Transfer left pane files back to single pane
    setOpenFiles(finalFiles)
    setActiveTab(finalTab)

    // Clear split view state
    setSplitView(false)
    setLeftPaneFiles([])
    setLeftPaneTab('graph')
    setRightPaneFiles([])
    setRightPaneTab('graph')
    setActivePane('left')
  }

  // Handle tab drop
  const handleTabDrop = useCallback(() => {
    if (!draggedTab) return;

    // Get the current drop zone from ref (not stale closure)
    const currentDropZone = dropZoneRef.current;

    if (isDev) console.log('Handling tab drop:', { draggedTab, dropZone: currentDropZone });

    const { filePath, fileName, sourcePane } = draggedTab;

    // Only handle if dropping on left or right edge
    if (!currentDropZone || (currentDropZone !== 'left' && currentDropZone !== 'right')) {
      if (isDev) console.log('No valid drop zone - ignoring drop');
      setDraggedTab(null);
      setDropZone(null);
      return;
    }

    // Handle left/right edge drops - create new splits or move between panes
    if (currentDropZone === 'left' || currentDropZone === 'right') {
      if (!splitView) {
        // Create new split view
        if (isDev) console.log('Creating new split view on', currentDropZone, 'side');

        // Remove the dragged file from openFiles
        const newOpenFiles = openFiles.filter(f => f.path !== filePath);

        if (currentDropZone === 'left') {
          // Drop on LEFT: dragged file goes to left pane, others to right
          setLeftPaneFiles([{ path: filePath, name: fileName }]);
          setLeftPaneTab(filePath);

          setRightPaneFiles(newOpenFiles);
          setRightPaneTab(newOpenFiles.length > 0 ? newOpenFiles[0].path : '');
          setActivePane('left');
        } else {
          // Drop on RIGHT: others stay on left, dragged file goes to right
          setLeftPaneFiles(newOpenFiles);
          setLeftPaneTab(newOpenFiles.length > 0 ? newOpenFiles[0].path : '');

          setRightPaneFiles([{ path: filePath, name: fileName }]);
          setRightPaneTab(filePath);
          setActivePane('right');
        }

        // Enable split view and clear single pane state
        setSplitView(true);
        setOpenFiles([]);
        setActiveTab('graph');
      } else {
        // Already in split view - move tab based on drop zone
        if (isDev) console.log('Moving tab in split view from', sourcePane, 'to', currentDropZone);

        if (currentDropZone === 'left') {
          // Drop on LEFT pane
          if (sourcePane === 'right') {
            // Move from right to left
            const newRightFiles = rightPaneFiles.filter(f => f.path !== filePath);
            setRightPaneFiles(newRightFiles);

            const existingInLeft = leftPaneFiles.find(f => f.path === filePath);

            let newLeftFiles = leftPaneFiles;
            if (!existingInLeft) {
              newLeftFiles = [...leftPaneFiles, { path: filePath, name: fileName }];
              setLeftPaneFiles(newLeftFiles);
            }
            setLeftPaneTab(filePath);
            setActivePane('left');

            // Close split if right pane is empty
            if (newRightFiles.length === 0) {
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
              setRightPaneFiles([...rightPaneFiles, { path: filePath, name: fileName }]);
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


  return (
    <div className="main-ui">
      {/* Custom Title Bar */}
      <TitleBar
        onSearchResultClick={handleSearchResultClick}
        onGuideOpen={handleGuideOpen}
        rootPath={rootPath}
      />

      <div className="main-ui-content">
        {/* Icon Rail - Navigation */}
        <IconRail
          onDashboardClick={() => handleSelectFile('special://dashboard', 'Dashboard')}
          onGraphClick={() => handleSelectFile('special://graph', 'Graph')}
          onTodosClick={() => handleSelectFile('special://todos', 'Todos')}
          onTimelineClick={() => handleSelectFile('special://timeline', 'Timeline')}
          onWhiteboardClick={async () => {
            // If no whiteboards exist, auto-create one
            if (localWhiteboards.length === 0) {
              await handleCreateWhiteboard()
            } else {
              const activeWb = localWhiteboards.find(wb => wb.id === activeWhiteboardId)
              const wbName = activeWb?.name || localWhiteboards[0]?.name || 'Whiteboard'
              handleSelectFile('special://whiteboard', wbName)
            }
          }}
          onSettingsClick={() => setShowSettings(true)}
          activeItem={
            activeTab === 'special://dashboard' ? 'dashboard' :
            activeTab === 'special://graph' ? 'graph' :
            activeTab === 'special://todos' ? 'todos' :
            activeTab === 'special://timeline' ? 'timeline' :
            activeTab === 'special://whiteboard' ? 'whiteboard' :
            showSettings ? 'settings' : null
          }
          hasUpdate={hasUpdate}
        />

        {/* Left Sidebar - Explorer */}
        <div className="explorer-sidebar" style={{ width: `${sidebarWidth}px` }}>
          <UnifiedSidebar
            ref={sidebarRef}
            fileTree={fileTree}
            onSelectFile={handleSelectFile}
            getRootPath={() => rootPath}
            editing={editing}
            onStartEditing={handleStartEditing}
            onFinishEditing={handleFinishEditing}
            refreshFileTree={loadFileTree}
            onContextMenu={handleContextMenu}
            onMoveItem={handleMoveItem}
            onDropExternalFiles={handleDropExternalFiles}
            onDropExternalDirectory={handleDropExternalDirectory}
            filesWithIncomingLinks={filesWithIncomingLinks}
            // Whiteboard section props for local mode
            showWhiteboardSection={activeTab === 'special://whiteboard'}
            whiteboards={whiteboardsForSidebar}
            activeWhiteboardId={activeWhiteboardId}
            onSelectWhiteboard={handleSelectWhiteboard}
            onCreateWhiteboard={handleCreateWhiteboard}
            onWhiteboardContextMenu={(e, wb) => {
              const localWb = localWhiteboards.find(w => w.id === wb.id)
              if (localWb) handleWhiteboardContextMenu(e, localWb)
            }}
            renamingWhiteboardId={renamingWhiteboardId}
            onWhiteboardRenameSubmit={handleWhiteboardRename}
            onWhiteboardRenameCancel={() => setRenamingWhiteboardId(null)}
          />
        </div>

        {/* Sidebar Divider */}
        <div className="sidebar-divider" onMouseDown={handleSidebarDividerMouseDown}></div>

        {/* Main Content Area */}
        <div
          className="main-content"
          ref={mainContentRef}
        >
        {isDragging && <DropZoneOverlay containerRef={mainContentRef} />}

        {!splitView ? (
          // Single pane mode
          <>
            <TabBar
              activeTab={activeTab}
              openFiles={openFiles}
              showGraphTab={false}
              onTabClick={setActiveTab}
              onTabClose={handleCloseFile}
              onReorderTabs={setOpenFiles}
              dragStartPos={dragStartPos}
              setDragStartPos={setDragStartPos}
              isPaneActive={true}
              onRevealInTree={handleRevealInTree}
              onPaneActivate={() => setActivePane('left')}
            />
            <div className="tab-content" onClick={() => setActivePane('left')}>
              {activeTab === 'special://dashboard' && (
                <Suspense fallback={<LoadingFallback />}>
                  <DashboardPanel
                    rootPath={rootPath}
                    onSelectFile={handleSelectFile}
                    isTabMode={true}
                  />
                </Suspense>
              )}
              {activeTab === 'special://graph' && (
                <GraphView
                  key={graphKey}
                  rootPath={rootPath}
                  onFileOpen={handleSelectFile}
                  onNodeContextMenu={handleGraphNodeContextMenu}
                  onCreateNote={() => handleCreateNote(rootPath)}
                  onCreateFolder={() => handleCreateFolder(rootPath)}
                />
              )}
              {activeTab === 'special://todos' && (
                <Suspense fallback={<LoadingFallback />}>
                  <NoteTodosView key={todoKey} rootPath={rootPath} onOpenFile={handleSelectFile} onTodoCreated={() => setTodoKey(prev => prev + 1)} />
                </Suspense>
              )}
              {activeTab === 'special://timeline' && (
                <Suspense fallback={<LoadingFallback />}>
                  <TodoPanel key={todoKey} initialView="timeline" rootPath={rootPath} onTodoCreated={() => setTodoKey(prev => prev + 1)} />
                </Suspense>
              )}
              {activeTab === 'special://whiteboard' && (
                <Suspense fallback={<LoadingFallback />}>
                  <LocalWhiteboardPanel rootPath={rootPath} fileTree={fileTree} selectedWhiteboardId={activeWhiteboardId} onWhiteboardsChange={setLocalWhiteboards} />
                </Suspense>
              )}
              {openFiles.filter(file => !file.path.startsWith('special://')).map((file) => {
                const isEditable = file.name.toLowerCase().endsWith('.md') || file.name.toLowerCase().endsWith('.txt')
                return activeTab === file.path && (
                  <Suspense key={file.path} fallback={<LoadingFallback />}>
                    {isEditable ? (
                      <FileViewer
                        key={file.path}
                        filePath={file.path}
                        fileName={file.name}
                        rootPath={rootPath}
                        onOpenFile={handleSelectFile}
                        onFileCreated={() => {
                          loadFileTree()
                          setGraphKey(prev => prev + 1)
                        }}
                        onFileRenamed={(oldPath, newPath, newName) => {
                          const updatedOpenFiles = openFiles.map(f =>
                            f.path === oldPath ? { path: newPath, name: newName } : f
                          )
                          setOpenFiles(updatedOpenFiles)
                          if (activeTab === oldPath) {
                            setActiveTab(newPath)
                          }
                          loadFileTree()
                          setGraphKey(prev => prev + 1)
                        }}
                        isActive={true}
                      />
                    ) : (
                      <FileViewer
                        key={file.path}
                        filePath={file.path}
                        fileName={file.name}
                        rootPath={rootPath}
                      />
                    )}
                  </Suspense>
                )
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
                showGraphTab={false}
                onTabClick={setLeftPaneTab}
                onTabClose={(filePath) => {
                  const newFiles = leftPaneFiles.filter(f => f.path !== filePath);
                  setLeftPaneFiles(newFiles);
                  if (leftPaneTab === filePath) {
                    setLeftPaneTab(newFiles.length > 0 ? newFiles[0].path : '');
                  }
                }}
                onReorderTabs={setLeftPaneFiles}
                dragStartPos={dragStartPos}
                setDragStartPos={setDragStartPos}
                isPaneActive={activePane === 'left'}
                onRevealInTree={handleRevealInTree}
                onPaneActivate={() => setActivePane('left')}
              />
              <div className="tab-content" onClick={() => setActivePane('left')}>
                {leftPaneTab === 'special://dashboard' && <DashboardPanel rootPath={rootPath} onSelectFile={(path, name) => handleSelectFile(path, name, 'left')} isTabMode={true} />}
                {leftPaneTab === 'special://graph' && <GraphView key={graphKey} rootPath={rootPath} onFileOpen={(path, name) => handleSelectFile(path, name, 'left')} onNodeContextMenu={handleGraphNodeContextMenu} onCreateNote={() => handleCreateNote(rootPath)} onCreateFolder={() => handleCreateFolder(rootPath)} />}
                {leftPaneTab === 'special://todos' && <NoteTodosView key={todoKey} rootPath={rootPath} onOpenFile={(path, name) => handleSelectFile(path, name, 'left')} onTodoCreated={() => setTodoKey(prev => prev + 1)} />}
                {leftPaneTab === 'special://timeline' && <TodoPanel key={todoKey} initialView="timeline" rootPath={rootPath} onTodoCreated={() => setTodoKey(prev => prev + 1)} />}
                {leftPaneTab === 'special://whiteboard' && <LocalWhiteboardPanel rootPath={rootPath} fileTree={fileTree} selectedWhiteboardId={activeWhiteboardId} onWhiteboardsChange={setLocalWhiteboards} />}
                {leftPaneFiles.filter(file => !file.path.startsWith('special://')).map((file) => {
                  const isEditable = file.name.toLowerCase().endsWith('.md') || file.name.toLowerCase().endsWith('.txt')
                  return leftPaneTab === file.path && (
                    isEditable ? (
                      <FileViewer
                        key={file.path}
                        filePath={file.path}
                        fileName={file.name}
                        rootPath={rootPath}
                        onOpenFile={(path, name) => handleSelectFile(path, name, 'left')}
                        onFileCreated={() => {
                          loadFileTree()
                          setGraphKey(prev => prev + 1)
                        }}
                        onFileRenamed={(oldPath, newPath, newName) => {
                          const updatedFiles = leftPaneFiles.map(f =>
                            f.path === oldPath ? { path: newPath, name: newName } : f
                          )
                          setLeftPaneFiles(updatedFiles)
                          if (leftPaneTab === oldPath) {
                            setLeftPaneTab(newPath)
                          }
                          loadFileTree()
                          setGraphKey(prev => prev + 1)
                        }}
                        onPaneActivate={() => setActivePane('left')}
                        editorId="left"
                        isActive={activePane === 'left'}
                      />
                    ) : (
                      <FileViewer
                        key={file.path}
                        filePath={file.path}
                        fileName={file.name}
                        rootPath={rootPath}
                      />
                    )
                  )
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
                showGraphTab={false}
                onTabClick={setRightPaneTab}
                onTabClose={(filePath) => {
                  const newFiles = rightPaneFiles.filter(f => f.path !== filePath);
                  setRightPaneFiles(newFiles);
                  if (rightPaneTab === filePath) {
                    setRightPaneTab(newFiles.length > 0 ? newFiles[0].path : '');
                  }
                  if (newFiles.length === 0) {
                    handleCloseSplitView();
                  }
                }}
                onReorderTabs={setRightPaneFiles}
                dragStartPos={dragStartPos}
                setDragStartPos={setDragStartPos}
                isPaneActive={activePane === 'right'}
                onRevealInTree={handleRevealInTree}
                onPaneActivate={() => setActivePane('right')}
              />
              <div className="tab-content" onClick={() => setActivePane('right')}>
                {rightPaneTab === 'special://dashboard' && <DashboardPanel rootPath={rootPath} onSelectFile={(path, name) => handleSelectFile(path, name, 'right')} isTabMode={true} />}
                {rightPaneTab === 'special://graph' && <GraphView key={graphKey} rootPath={rootPath} onFileOpen={(path, name) => handleSelectFile(path, name, 'right')} onNodeContextMenu={handleGraphNodeContextMenu} />}
                {rightPaneTab === 'special://todos' && <NoteTodosView key={todoKey} rootPath={rootPath} onOpenFile={(path, name) => handleSelectFile(path, name, 'right')} onTodoCreated={() => setTodoKey(prev => prev + 1)} />}
                {rightPaneTab === 'special://timeline' && <TodoPanel key={todoKey} initialView="timeline" rootPath={rootPath} onTodoCreated={() => setTodoKey(prev => prev + 1)} />}
                {rightPaneTab === 'special://whiteboard' && <LocalWhiteboardPanel rootPath={rootPath} fileTree={fileTree} selectedWhiteboardId={activeWhiteboardId} onWhiteboardsChange={setLocalWhiteboards} />}
                {rightPaneFiles.filter(file => !file.path.startsWith('special://')).map((file) => {
                  const isEditable = file.name.toLowerCase().endsWith('.md') || file.name.toLowerCase().endsWith('.txt')
                  return rightPaneTab === file.path && (
                    isEditable ? (
                      <FileViewer
                        key={file.path}
                        filePath={file.path}
                        fileName={file.name}
                        rootPath={rootPath}
                        onOpenFile={(path, name) => handleSelectFile(path, name, 'right')}
                        onFileCreated={() => {
                          loadFileTree()
                          setGraphKey(prev => prev + 1)
                        }}
                        onFileRenamed={(oldPath, newPath, newName) => {
                          const updatedFiles = rightPaneFiles.map(f =>
                            f.path === oldPath ? { path: newPath, name: newName } : f
                          )
                          setRightPaneFiles(updatedFiles)
                          if (rightPaneTab === oldPath) {
                            setRightPaneTab(newPath)
                          }
                          loadFileTree()
                          setGraphKey(prev => prev + 1)
                        }}
                        onPaneActivate={() => setActivePane('right')}
                        editorId="right"
                        isActive={activePane === 'right'}
                      />
                    ) : (
                      <FileViewer
                        key={file.path}
                        filePath={file.path}
                        fileName={file.name}
                        rootPath={rootPath}
                      />
                    )
                  )
                })}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          itemPath={contextMenu.itemPath}
          itemType={contextMenu.itemType}
          itemName={contextMenu.itemName}
          mode="local"
          onClose={() => setContextMenu(null)}
          onDelete={handleDeleteItem}
          onRename={handleRenameItem}
          onCreateNote={handleCreateNote}
          onCreateFolder={handleCreateFolder}
          onRefresh={handleRefresh}
          onRevealInExplorer={handleRevealInExplorer}
          onOpenExternal={handleOpenExternal}
          onOpenInSecondPane={handleOpenInSecondPane}
          allPaths={allPaths}
        />
      )}

      {/* Whiteboard Context Menu */}
      {whiteboardContextMenu && (
        <div
          className="whiteboard-context-menu-overlay"
          onClick={() => setWhiteboardContextMenu(null)}
        >
          <div
            className="whiteboard-context-menu"
            style={{ left: whiteboardContextMenu.x, top: whiteboardContextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setRenamingWhiteboardId(whiteboardContextMenu.whiteboard.id)
                setWhiteboardContextMenu(null)
              }}
            >
              Rename
            </button>
            <button
              className="delete"
              onClick={() => handleWhiteboardDelete(whiteboardContextMenu.whiteboard.id)}
            >
              Delete
            </button>
          </div>
        </div>
      )}

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

      {/* Help Modal */}
      {activeGuide && (
        <HelpModal
          guide={activeGuide}
          onClose={() => setActiveGuide(null)}
        />
      )}

      {/* Settings Panel */}
      {showSettings && (
        <Suspense fallback={<LoadingFallback />}>
          <SettingsPanel
            onClose={() => setShowSettings(false)}
            onModeSwitch={() => {
              setShowSettings(false);
              window.location.reload();
            }}
            onUpdateAvailable={setHasUpdate}
          />
        </Suspense>
      )}

      {/* Admin/Leader Dashboard */}
      {showAdminDashboard && workspace && userRole && (
        <Suspense fallback={<LoadingFallback />}>
          {userRole === 'admin' ? (
            <AdminDashboard
              workspace={workspace}
              onClose={() => setShowAdminDashboard(false)}
            />
          ) : userRole === 'leader' ? (
            <LeaderDashboard
              workspace={workspace}
              onClose={() => setShowAdminDashboard(false)}
            />
          ) : null}
        </Suspense>
      )}

    </div>
  )
}

export default MainUI