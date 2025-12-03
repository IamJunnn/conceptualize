import React, { useState } from 'react';
import { useDragDrop, EditorPane } from '../../contexts/DragDropContext';
import { FolderIcon as FolderSolidIcon, StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { DocumentIcon, StarIcon, ClipboardDocumentListIcon, CalendarIcon, Squares2X2Icon, XMarkIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { isImportantNote, toggleImportantNote } from '../../utils/importantNotes';
import './TabBar.css';

// Graph icon component
const GraphIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <circle cx="12" cy="18" r="2.5" />
    <path d="M8 7.5L10.5 16" />
    <path d="M16 7.5L13.5 16" />
  </svg>
);

export interface OpenFile {
  path: string;
  name: string;
  id?: string; // Google Drive file ID (for team mode)
}

interface TabBarProps {
  activeTab: string;
  openFiles: OpenFile[];
  pane?: EditorPane;
  showGraphTab?: boolean;
  graphTabIndex?: number; // Position of Graph tab (0 = first, default behavior)
  onTabClick: (tabId: string) => void;
  onTabClose: (filePath: string) => void;
  onGraphClose?: () => void; // Close Graph tab handler
  onReorderTabs?: (reorderedFiles: OpenFile[], graphIndex?: number) => void; // Tab reordering with optional Graph position
  onCrossPaneDrop?: (file: OpenFile, targetIndex: number | null) => void; // Cross-pane drop handler
  dragStartPos: { x: number; y: number } | null;
  setDragStartPos: (pos: { x: number; y: number } | null) => void;
  isPaneActive?: boolean; // Track if this pane is the active one
  onRevealInTree?: (filePath: string) => void; // New prop to reveal file in tree
  onPaneActivate?: () => void; // New prop to activate this pane when a tab is clicked
}

interface TabContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  filePath: string;
}

export function TabBar({
  activeTab,
  openFiles,
  pane,
  showGraphTab = true,
  graphTabIndex = 0, // Default to first position
  onTabClick,
  onTabClose,
  onGraphClose,
  onReorderTabs,
  onCrossPaneDrop,
  dragStartPos,
  setDragStartPos,
  isPaneActive = true, // Default to true for single pane mode
  onRevealInTree,
  onPaneActivate,
}: TabBarProps) {
  const { draggedTab, setDraggedTab } = useDragDrop();
  const [contextMenu, setContextMenu] = useState<TabContextMenuState | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [importantNotes, setImportantNotes] = useState<Set<string>>(new Set());
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const tabBarRef = React.useRef<HTMLDivElement>(null);
  // Track if THIS TabBar started the current drag operation
  const dragOriginRef = React.useRef<{ filePath: string; fileName: string; id?: string } | null>(null);
  // Track pending drag data in a ref to avoid async state issues
  const pendingDragRef = React.useRef<{ filePath: string; fileName: string; sourcePane: EditorPane | 'single'; id?: string } | null>(null);
  // Track if drag has started (past threshold) to avoid re-setting draggedTab
  const dragStartedRef = React.useRef(false);

  // Use 'single' as the pane identifier for single-pane mode to ensure consistent comparison
  const effectivePane = pane ?? 'single';

  const handleTabMouseDown = (e: React.MouseEvent, filePath: string, fileName: string, fileId?: string) => {
    // Don't start drag if clicking the close button
    const target = e.target as HTMLElement;
    if (target.closest('.tab-close')) {
      return;
    }

    // Store drag start position and file info (but don't set draggedTab yet)
    setDragStartPos({ x: e.clientX, y: e.clientY });

    // Store locally that THIS TabBar started the drag
    dragOriginRef.current = { filePath, fileName, id: fileId };

    // Store pending drag data in ref (more reliable than DOM dataset)
    pendingDragRef.current = {
      filePath,
      fileName,
      sourcePane: effectivePane,
      id: fileId,
    };
    dragStartedRef.current = false;
  };

  const handleTabContextMenu = (e: React.MouseEvent, filePath: string) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      filePath,
    });
  };

  // Close context menu when clicking anywhere
  React.useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  // Listen for important notes changes
  React.useEffect(() => {
    const updateImportantNotes = () => {
      const important = new Set<string>();
      openFiles.forEach(file => {
        if (isImportantNote(file.path)) {
          important.add(file.path);
        }
      });
      setImportantNotes(important);
    };

    updateImportantNotes();
    window.addEventListener('importantNotesChanged', updateImportantNotes);
    return () => window.removeEventListener('importantNotesChanged', updateImportantNotes);
  }, [openFiles]);

  // Handle cross-pane drops: listen for mouseup when draggedTab is from a different pane
  React.useEffect(() => {
    if (!draggedTab || draggedTab.sourcePane === effectivePane || effectivePane === 'single') {
      return;
    }

    const handleCrossPaneMouseUp = (e: MouseEvent) => {
      if (!tabBarRef.current || !onCrossPaneDrop) return;

      const rect = tabBarRef.current.getBoundingClientRect();
      const isMouseOverThisTabBar =
        e.clientY >= rect.top && e.clientY <= rect.bottom &&
        e.clientX >= rect.left && e.clientX <= rect.right;

      if (isMouseOverThisTabBar) {
        const dropIndex = calculateDropIndex(e.clientX);
        const droppedFile: OpenFile = {
          path: draggedTab.filePath,
          name: draggedTab.fileName,
          id: draggedTab.id,
        };
        onCrossPaneDrop(droppedFile, dropIndex);
      }

      setDropTargetIndex(null);
    };

    document.addEventListener('mouseup', handleCrossPaneMouseUp, true);
    return () => document.removeEventListener('mouseup', handleCrossPaneMouseUp, true);
  }, [draggedTab, effectivePane, onCrossPaneDrop]);

  // Create combined tabs array that includes Graph tab if visible
  // This allows Graph to be reordered along with other tabs
  // NOTE: This must be defined before the useEffect that uses it
  const allTabs: OpenFile[] = React.useMemo(() => {
    if (showGraphTab) {
      // Check if Graph is already in openFiles (shouldn't be, but safety check)
      const hasGraph = openFiles.some(f => f.path === 'special://graph');
      if (!hasGraph) {
        const graphTab: OpenFile = { path: 'special://graph', name: 'Graph' };
        // Insert Graph at the specified index
        const result = [...openFiles];
        const insertIndex = Math.min(Math.max(0, graphTabIndex), result.length);
        result.splice(insertIndex, 0, graphTab);
        return result;
      }
    }
    return openFiles;
  }, [showGraphTab, openFiles, graphTabIndex]);

  // Calculate drop target index based on cursor position
  // Returns index relative to allTabs array (including Graph tab if visible)
  const calculateDropIndex = (clientX: number): number | null => {
    if (!tabBarRef.current) return null;

    // Get all file tabs (including Graph now that it's part of allTabs)
    const tabs = tabBarRef.current.querySelectorAll('.file-tab');

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i] as HTMLElement;
      const rect = tab.getBoundingClientRect();
      const midPoint = rect.left + rect.width / 2;

      if (clientX < midPoint) {
        return i;
      }
    }
    return tabs.length; // Drop at the end
  };

  // Track cursor position for drag preview and handle mouseup to clear drag state
  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragStartPos) {
        const dx = Math.abs(e.clientX - dragStartPos.x);
        const dy = Math.abs(e.clientY - dragStartPos.y);
        const DRAG_THRESHOLD = 5;

        // Only start actual drag if moved past threshold
        if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
          // Check if we have pending drag data in ref and haven't started drag yet
          if (pendingDragRef.current && !dragStartedRef.current) {
            const dragData = pendingDragRef.current;
            setDraggedTab(dragData);
            dragStartedRef.current = true;
          }

          // Always update cursor position when dragging (use ref data if draggedTab not yet set)
          const activeDragData = draggedTab || pendingDragRef.current;
          if (activeDragData) {
            setCursorPos({ x: e.clientX, y: e.clientY });

            // Update drop target for reordering - for BOTH same pane AND cross-pane drops
            if (tabBarRef.current) {
              const rect = tabBarRef.current.getBoundingClientRect();
              if (e.clientY >= rect.top && e.clientY <= rect.bottom &&
                  e.clientX >= rect.left && e.clientX <= rect.right) {
                const newDropIndex = calculateDropIndex(e.clientX);
                setDropTargetIndex(newDropIndex);
              } else {
                setDropTargetIndex(null);
              }
            }
          }
        }
      } else {
        // Clear cursor position when drag ends
        setCursorPos(null);
        setDropTargetIndex(null);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Only handle reorder if THIS TabBar started the drag (using local ref)
      // This prevents multiple TabBars from all trying to handle the same mouseup
      if (!dragOriginRef.current) {
        return;
      }

      const dragOrigin = dragOriginRef.current;

      // Check if mouse is actually over THIS tab bar
      if (!tabBarRef.current) {
        dragOriginRef.current = null;
        pendingDragRef.current = null;
        dragStartedRef.current = false;
        return;
      }

      const rect = tabBarRef.current.getBoundingClientRect();
      const isMouseOverThisTabBar =
        e.clientY >= rect.top && e.clientY <= rect.bottom &&
        e.clientX >= rect.left && e.clientX <= rect.right;

      // Only reorder if mouse is still over this tab bar AND we actually dragged (past threshold)
      if (isMouseOverThisTabBar && onReorderTabs && dragStartedRef.current) {
        const finalDropIndex = calculateDropIndex(e.clientX);

        if (finalDropIndex !== null) {
          // Build the current allTabs array for this calculation
          const graphTab: OpenFile = { path: 'special://graph', name: 'Graph' };
          let currentAllTabs: OpenFile[];
          if (showGraphTab && !openFiles.some(f => f.path === 'special://graph')) {
            currentAllTabs = [...openFiles];
            const insertIdx = Math.min(Math.max(0, graphTabIndex), currentAllTabs.length);
            currentAllTabs.splice(insertIdx, 0, graphTab);
          } else {
            currentAllTabs = openFiles;
          }

          // Find current index of dragged file in allTabs
          const currentIndex = currentAllTabs.findIndex(f => f.path === dragOrigin.filePath);

          if (currentIndex !== -1 && currentIndex !== finalDropIndex && currentIndex !== finalDropIndex - 1) {
            // Create new array with reordered tabs (including Graph)
            const newAllTabs = [...currentAllTabs];
            const [draggedFile] = newAllTabs.splice(currentIndex, 1);

            // Adjust drop index if we removed an item before the drop position
            const adjustedIndex = currentIndex < finalDropIndex ? finalDropIndex - 1 : finalDropIndex;
            newAllTabs.splice(adjustedIndex, 0, draggedFile);

            // Find the new Graph index
            const newGraphIndex = newAllTabs.findIndex(f => f.path === 'special://graph');

            // Extract just the non-Graph files to pass to onReorderTabs
            const newOpenFiles = newAllTabs.filter(f => f.path !== 'special://graph');

            // Pass both the reordered files and the new Graph index
            onReorderTabs(newOpenFiles, newGraphIndex >= 0 ? newGraphIndex : undefined);

            // Activate the dragged tab after reordering
            const tabId = dragOrigin.filePath === 'special://graph' ? 'graph' : dragOrigin.filePath;
            onTabClick(tabId);
            onPaneActivate?.();
          }
        }
      }

      // Clean up all refs
      dragOriginRef.current = null;
      pendingDragRef.current = null;
      dragStartedRef.current = false;
      setCursorPos(null);
      setDropTargetIndex(null);
    };

    if (dragStartPos) {
      document.addEventListener('mousemove', handleMouseMove);
      // Use capture phase to run BEFORE MainUI's mouseup handler clears dragStartPos
      document.addEventListener('mouseup', handleMouseUp, true);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp, true);
      };
    }
  }, [dragStartPos, draggedTab, effectivePane, openFiles, onReorderTabs, onTabClick, onPaneActivate, showGraphTab, allTabs]);

  return (
    <div className="tab-bar" ref={tabBarRef}>
      {allTabs.map((file, index) => {
        const isGraphTab = file.path === 'special://graph';
        const displayName = file.name.replace(/\.md$/, '');
        // Use pendingDragRef as fallback since draggedTab state update is async
        const activeDragFilePath = draggedTab?.filePath || pendingDragRef.current?.filePath;
        const activeDragSourcePane = draggedTab?.sourcePane || pendingDragRef.current?.sourcePane;
        const isDragging = activeDragFilePath === file.path && dragStartPos !== null;
        // Show drop indicator for both same-pane reordering AND cross-pane drops
        const isSamePaneDrag = activeDragSourcePane === effectivePane;
        const isCrossPaneDrag = activeDragSourcePane && activeDragSourcePane !== effectivePane && activeDragSourcePane !== 'single';
        const showDropIndicator = dropTargetIndex === index && (isSamePaneDrag || isCrossPaneDrag) && activeDragFilePath !== file.path;

        // For Graph tab, check if activeTab is 'graph' (not 'special://graph')
        const isActive = isGraphTab ? activeTab === 'graph' : activeTab === file.path;

        // Only show icons for special tabs (Dashboard, Graph, Todos, Timeline, Settings)
        let SpecialIcon: React.ElementType | null = null;
        let specialIconClass = 'tab-file-icon';
        if (file.path === 'special://dashboard') {
          SpecialIcon = Squares2X2Icon;
          specialIconClass = 'tab-file-icon dashboard';
        } else if (file.path === 'special://graph') {
          SpecialIcon = () => <GraphIcon className="tab-file-icon graph" />;
        } else if (file.path === 'special://todos') {
          SpecialIcon = ClipboardDocumentListIcon;
        } else if (file.path === 'special://timeline') {
          SpecialIcon = CalendarIcon;
        } else if (file.path === 'special://settings') {
          SpecialIcon = Cog6ToothIcon;
          specialIconClass = 'tab-file-icon settings';
        }

        return (
          <div
            key={file.path}
            className={`tab file-tab ${isActive ? 'active' : ''} ${isPaneActive ? 'pane-active' : 'pane-inactive'} ${isDragging ? 'dragging' : ''} ${showDropIndicator ? 'drop-target-left' : ''}`}
            onMouseDown={(e) => handleTabMouseDown(e, file.path, file.name, file.id)}
            onContextMenu={(e) => !isGraphTab && handleTabContextMenu(e, file.path)}
            onClick={() => {
              // Don't trigger click if we were dragging
              if (!isDragging) {
                // For Graph tab, use 'graph' as the tab ID
                onTabClick(isGraphTab ? 'graph' : file.path);
                onPaneActivate?.();
              }
            }}
            title={file.name}
          >
            {SpecialIcon && (
              <SpecialIcon className={specialIconClass} />
            )}
            <span className="tab-name">{displayName}</span>
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                // For Graph tab, call onGraphClose if available
                if (isGraphTab && onGraphClose) {
                  onGraphClose();
                } else {
                  onTabClose(file.path);
                }
              }}
              title="Close (Ctrl+W)"
            >
              <XMarkIcon className="tab-close-icon" />
            </button>
          </div>
        );
      })}
      {/* Drop indicator at the end - show for both same-pane and cross-pane drops */}
      {dropTargetIndex === allTabs.length && (() => {
        const sourcePane = draggedTab?.sourcePane || pendingDragRef.current?.sourcePane;
        const isSamePaneDrag = sourcePane === effectivePane;
        const isCrossPaneDrag = sourcePane && sourcePane !== effectivePane && sourcePane !== 'single';
        return isSamePaneDrag || isCrossPaneDrag;
      })() && (
        <div className="tab-drop-indicator-end" />
      )}

      {/* Context Menu */}
      {contextMenu && contextMenu.visible && (
        <div
          className="tab-context-menu"
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 10000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="tab-context-menu-item"
            onClick={() => {
              toggleImportantNote(contextMenu.filePath);
              window.dispatchEvent(new CustomEvent('importantNotesChanged'));
              setContextMenu(null);
            }}
          >
            {importantNotes.has(contextMenu.filePath) ? (
              <>
                <StarIcon className="menu-icon" style={{ width: '16px', height: '16px' }} />
                <span>Unmark as Important</span>
              </>
            ) : (
              <>
                <StarSolidIcon className="menu-icon" style={{ width: '16px', height: '16px', color: '#fbbf24' }} />
                <span>Mark as Important</span>
              </>
            )}
          </div>
          <div className="tab-context-menu-separator" />
          <div
            className="tab-context-menu-item"
            onClick={() => {
              if (onRevealInTree) {
                onRevealInTree(contextMenu.filePath);
              }
              setContextMenu(null);
            }}
          >
            <FolderSolidIcon className="menu-icon" style={{ width: '16px', height: '16px' }} />
            <span>Reveal in File Tree</span>
          </div>
        </div>
      )}

      {/* Drag Preview - follows cursor */}
      {cursorPos && (draggedTab || pendingDragRef.current) && (() => {
        const previewData = draggedTab || pendingDragRef.current;
        if (!previewData) return null;

        // Determine the icon and display name based on file type
        const isGraph = previewData.filePath === 'special://graph';
        const isTodos = previewData.filePath === 'special://todos';
        const isTimeline = previewData.filePath === 'special://timeline';
        const isDashboard = previewData.filePath === 'special://dashboard';
        const isSettings = previewData.filePath === 'special://settings';

        let PreviewIcon: React.ElementType = DocumentIcon;
        let iconClass = 'tab-drag-preview-icon';
        let displayName = previewData.fileName;

        if (isGraph) {
          PreviewIcon = GraphIcon;
          iconClass = 'tab-drag-preview-icon';
          displayName = 'Graph';
        } else if (isTodos) {
          PreviewIcon = ClipboardDocumentListIcon;
          iconClass = 'tab-drag-preview-icon';
          displayName = 'Todos';
        } else if (isTimeline) {
          PreviewIcon = CalendarIcon;
          iconClass = 'tab-drag-preview-icon';
          displayName = 'Timeline';
        } else if (isDashboard) {
          PreviewIcon = Squares2X2Icon;
          iconClass = 'tab-drag-preview-icon';
          displayName = 'Dashboard';
        } else if (isSettings) {
          PreviewIcon = Cog6ToothIcon;
          iconClass = 'tab-drag-preview-icon';
          displayName = 'Settings';
        } else if (previewData.fileName.endsWith('.md')) {
          iconClass = 'tab-drag-preview-icon md-file';
          displayName = previewData.fileName.slice(0, -3);
        }

        return (
          <div
            className="tab-drag-preview"
            style={{
              position: 'fixed',
              left: `${cursorPos.x + 10}px`,
              top: `${cursorPos.y + 10}px`,
              pointerEvents: 'none',
              zIndex: 10000,
            }}
          >
            <div className="tab-drag-preview-content">
              <PreviewIcon className={iconClass} />
              <span className="tab-drag-preview-name">{displayName}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
