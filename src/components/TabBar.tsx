import React, { useState } from 'react';
import { useDragDrop, EditorPane } from '../contexts/DragDropContext';
import './TabBar.css';

export interface OpenFile {
  path: string;
  name: string;
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
}: TabBarProps) {
  const { draggedTab, setDraggedTab } = useDragDrop();
  const [contextMenu, setContextMenu] = useState<TabContextMenuState | null>(null);

  const handleTabMouseDown = (e: React.MouseEvent, filePath: string, fileName: string) => {
    // Don't start drag if clicking the close button
    const target = e.target as HTMLElement;
    if (target.closest('.tab-close')) {
      return;
    }

    console.log('🖱️ Mouse down on tab:', fileName);

    // Store drag start position and file info
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setDraggedTab({
      filePath,
      fileName,
      sourcePane: pane,
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

  return (
    <div className="tab-bar">
      {showGraphTab && (
        <button
          className={`tab ${activeTab === 'graph' ? 'active' : ''} ${isPaneActive ? 'pane-active' : 'pane-inactive'}`}
          onClick={() => onTabClick('graph')}
          title="Graph"
        >
          Graph
        </button>
      )}

      {openFiles.map((file) => {
        const displayName = file.name.replace(/\.md$/, '');
        const isDragging = draggedTab?.filePath === file.path && dragStartPos !== null;

        return (
          <div
            key={file.path}
            className={`tab file-tab ${activeTab === file.path ? 'active' : ''} ${isPaneActive ? 'pane-active' : 'pane-inactive'} ${isDragging ? 'dragging' : ''}`}
            onMouseDown={(e) => handleTabMouseDown(e, file.path, file.name)}
            onContextMenu={(e) => handleTabContextMenu(e, file.path)}
            onClick={(e) => {
              // Don't trigger click if we were dragging
              if (!isDragging) {
                onTabClick(file.path);
              }
            }}
            title={displayName}
          >
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
              if (onRevealInTree) {
                onRevealInTree(contextMenu.filePath);
              }
              setContextMenu(null);
            }}
          >
            <span className="menu-icon">📂</span>
            <span>Reveal in File Tree</span>
          </div>
        </div>
      )}
    </div>
  );
}
