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
}: TabBarProps) {
  const { draggedTab, setDraggedTab } = useDragDrop();

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

  return (
    <div className="tab-bar">
      {showGraphTab && (
        <button
          className={`tab ${activeTab === 'graph' ? 'active' : ''}`}
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
            className={`tab file-tab ${activeTab === file.path ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
            onMouseDown={(e) => handleTabMouseDown(e, file.path, file.name)}
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
    </div>
  );
}
