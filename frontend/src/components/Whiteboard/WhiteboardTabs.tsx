/**
 * WhiteboardTabs Component
 * Tab bar for switching between whiteboards
 */

import React, { useRef, useEffect } from 'react';
import { PenTool } from 'lucide-react';
import { WhiteboardMeta } from '../../services/whiteboardTypes';
import './WhiteboardTabs.css';

interface WhiteboardTabsProps {
  whiteboards: WhiteboardMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, whiteboard: WhiteboardMeta) => void;
  onRename: (id: string, newName: string) => void;
  renameId: string | null;
  setRenameId: (id: string | null) => void;
  renameValue: string;
  setRenameValue: (value: string) => void;
  isCreating?: boolean;
}

const WhiteboardTabs: React.FC<WhiteboardTabsProps> = ({
  whiteboards,
  activeId,
  onSelect,
  onContextMenu,
  onRename,
  renameId,
  setRenameId,
  renameValue,
  setRenameValue,
  isCreating: _isCreating = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Focus input when renaming
  useEffect(() => {
    if (renameId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renameId]);

  // Handle rename submit
  const handleRenameSubmit = (id: string) => {
    if (renameValue.trim()) {
      onRename(id, renameValue.trim());
    }
    setRenameId(null);
  };

  // Handle rename key down
  const handleRenameKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      handleRenameSubmit(id);
    } else if (e.key === 'Escape') {
      setRenameId(null);
    }
  };

  // Scroll active tab into view
  useEffect(() => {
    if (activeId && tabsRef.current) {
      const activeTab = tabsRef.current.querySelector(`[data-id="${activeId}"]`);
      if (activeTab) {
        activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [activeId]);

  if (whiteboards.length === 0) {
    return (
      <div className="whiteboard-tabs">
        <div className="whiteboard-tab active creating">
          <PenTool size={14} />
          <span className="tab-name">Untitled</span>
        </div>
      </div>
    );
  }

  return (
    <div className="whiteboard-tabs" ref={tabsRef}>
      {whiteboards.map((wb) => (
        <div
          key={wb.id}
          data-id={wb.id}
          className={`whiteboard-tab ${activeId === wb.id ? 'active' : ''}`}
          onClick={() => onSelect(wb.id)}
          onContextMenu={(e) => onContextMenu(e, wb)}
          title={`${wb.name}\nCreated by ${wb.createdByName}\n${wb.updatedAt.toLocaleDateString()}`}
        >
          {renameId === wb.id ? (
            <input
              ref={inputRef}
              type="text"
              className="rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => handleRenameSubmit(wb.id)}
              onKeyDown={(e) => handleRenameKeyDown(e, wb.id)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <PenTool size={14} />
              <span className="tab-name">{wb.name}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
};

export default WhiteboardTabs;
