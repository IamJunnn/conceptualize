import React, { useState } from 'react';
import { useDragDrop, EditorPane } from '../../contexts/DragDropContext';
import { FolderIcon as FolderSolidIcon, StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { DocumentIcon, StarIcon, ClipboardDocumentListIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { isImportantNote, toggleImportantNote } from '../../utils/importantNotes';
import './TabBar.css';

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
  onTabClick: (tabId: string) => void;
  onTabClose: (filePath: string) => void;
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
  onTabClick,
  onTabClose,
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

  const handleTabMouseDown = (e: React.MouseEvent, filePath: string, fileName: string, fileId?: string) => {
    // Don't start drag if clicking the close button
    const target = e.target as HTMLElement;
    if (target.closest('.tab-close')) {
      return;
    }

    console.log('🖱️ Mouse down on tab:', fileName);

    // Store drag start position and file info (but don't set draggedTab yet)
    setDragStartPos({ x: e.clientX, y: e.clientY });

    // Store the file info temporarily for potential drag
    // We'll only set draggedTab if the mouse moves past the threshold
    (e.currentTarget as any).dataset.pendingDrag = JSON.stringify({
      filePath,
      fileName,
      sourcePane: pane,
      id: fileId,
    });
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

  // Track cursor position for drag preview and handle mouseup to clear drag state
  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragStartPos) {
        const dx = Math.abs(e.clientX - dragStartPos.x);
        const dy = Math.abs(e.clientY - dragStartPos.y);
        const DRAG_THRESHOLD = 5;

        // Only start actual drag if moved past threshold
        if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
          // Check if we have pending drag data
          const tabs = document.querySelectorAll('.file-tab');
          for (const tab of tabs) {
            const pendingDragData = (tab as any).dataset.pendingDrag;
            if (pendingDragData) {
              const dragData = JSON.parse(pendingDragData);
              setDraggedTab(dragData);
              (tab as any).dataset.pendingDrag = '';
              break;
            }
          }

          // Update cursor position for drag preview
          if (draggedTab) {
            setCursorPos({ x: e.clientX, y: e.clientY });
          }
        }
      } else {
        // Clear cursor position when drag ends
        setCursorPos(null);
      }
    };

    const handleMouseUp = () => {
      // Don't clear drag state here - let the parent (MainUI/TeamMainUI) handle it
      // Just clear the cursor position for the drag preview
      if (dragStartPos) {
        console.log('🖱️ [TabBar] Mouse up - clearing cursor position only');
        setCursorPos(null);

        // Clear any pending drag data
        const tabs = document.querySelectorAll('.file-tab');
        for (const tab of tabs) {
          (tab as any).dataset.pendingDrag = '';
        }
      }
    };

    if (dragStartPos) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragStartPos, draggedTab]);

  return (
    <div className="tab-bar">
      {showGraphTab && (
        <button
          className={`tab ${activeTab === 'graph' ? 'active' : ''} ${isPaneActive ? 'pane-active' : 'pane-inactive'}`}
          onClick={() => {
            onTabClick('graph');
            onPaneActivate?.();
          }}
          title="Graph"
        >
          Graph
        </button>
      )}

      {openFiles.map((file) => {
        const displayName = file.name.replace(/\.md$/, '');
        const isDragging = draggedTab?.filePath === file.path && dragStartPos !== null;
        const isSpecialTab = file.path.startsWith('special://');

        // Get icon for special tabs
        let SpecialIcon = null;
        if (file.path === 'special://todos') {
          SpecialIcon = ClipboardDocumentListIcon;
        } else if (file.path === 'special://timeline') {
          SpecialIcon = CalendarIcon;
        }

        return (
          <div
            key={file.path}
            className={`tab file-tab ${activeTab === file.path ? 'active' : ''} ${isPaneActive ? 'pane-active' : 'pane-inactive'} ${isDragging ? 'dragging' : ''}`}
            onMouseDown={(e) => handleTabMouseDown(e, file.path, file.name, file.id)}
            onContextMenu={(e) => handleTabContextMenu(e, file.path)}
            onClick={() => {
              // Don't trigger click if we were dragging
              if (!isDragging) {
                onTabClick(file.path);
                onPaneActivate?.();
              }
            }}
            title={displayName}
          >
            {!isSpecialTab && importantNotes.has(file.path) && (
              <StarSolidIcon
                className="tab-star-icon"
                style={{ width: '14px', height: '14px', color: '#fbbf24', flexShrink: 0 }}
              />
            )}
            {SpecialIcon && (
              <SpecialIcon
                className="tab-icon"
                style={{ width: '14px', height: '14px', flexShrink: 0 }}
              />
            )}
            <span className="tab-name">{displayName}</span>
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(file.path);
              }}
              title="Close"
            >
              ×
            </button>
          </div>
        );
      })}

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
      {cursorPos && draggedTab && (
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
            <DocumentIcon
              className={`tab-drag-preview-icon ${
                draggedTab.fileName.endsWith('.md') ? 'md-file' : ''
              }`}
            />
            <span className="tab-drag-preview-name">
              {draggedTab.fileName.endsWith('.md')
                ? draggedTab.fileName.slice(0, -3)
                : draggedTab.fileName}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
