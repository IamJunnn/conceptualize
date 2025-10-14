import React, { useEffect, useRef } from 'react';
import {
  DocumentPlusIcon,
  FolderPlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowPathIcon,
  FolderOpenIcon,
  EyeSlashIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { useGraphVisibility } from '../contexts/GraphVisibilityContext';
import './ContextMenu.css';

interface ContextMenuProps {
  x: number;
  y: number;
  itemPath: string;
  itemType: 'file' | 'folder';
  itemName: string;
  onClose: () => void;
  onDelete: (path: string) => void;
  onRename: (path: string, name: string) => void;
  onCreateNote: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onRefresh: () => void;
  onRevealInExplorer: (path: string) => void;
  onOpenInSecondPane?: (path: string, name: string) => void;
  allPaths?: string[]; // All file/folder paths for cascade operations
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  itemPath,
  itemType,
  itemName,
  onClose,
  onDelete,
  onRename,
  onCreateNote,
  onCreateFolder,
  onRefresh,
  onRevealInExplorer,
  onOpenInSecondPane,
  allPaths = [],
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const { isHidden, hideItem, showItem } = useGraphVisibility();
  const hidden = isHidden(itemPath);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleEscape, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [onClose]);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      {itemType === 'file' && onOpenInSecondPane && (
        <>
          <div
            className="context-menu-item"
            onClick={() => handleAction(() => onOpenInSecondPane(itemPath, itemName))}
          >
            <svg className="menu-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 4v16m6-16v16M4 8h16M4 16h16" />
            </svg>
            Open in Second Pane
          </div>
          <div className="context-menu-separator" />
        </>
      )}
      {itemType === 'folder' && (
        <>
          <div
            className="context-menu-item"
            onClick={() => handleAction(() => onCreateNote(itemPath))}
          >
            <DocumentPlusIcon className="menu-icon" />
            New Note
          </div>
          <div
            className="context-menu-item"
            onClick={() => handleAction(() => onCreateFolder(itemPath))}
          >
            <FolderPlusIcon className="menu-icon" />
            New Folder
          </div>
          <div className="context-menu-separator" />
        </>
      )}
      <div
        className="context-menu-item"
        onClick={() => handleAction(() => onRefresh())}
      >
        <ArrowPathIcon className="menu-icon" />
        Refresh
      </div>
      <div
        className="context-menu-item"
        onClick={() => handleAction(() => onRevealInExplorer(itemPath))}
      >
        <FolderOpenIcon className="menu-icon" />
        Reveal in File Explorer
      </div>
      <div className="context-menu-separator" />
      <div
        className="context-menu-item"
        onClick={() => handleAction(() => {
          if (hidden) {
            showItem(itemPath, itemType === 'folder', allPaths);
          } else {
            hideItem(itemPath, itemType === 'folder', allPaths);
          }
        })}
      >
        {hidden ? (
          <>
            <EyeIcon className="menu-icon" />
            Show in Graph
          </>
        ) : (
          <>
            <EyeSlashIcon className="menu-icon" />
            Hide from Graph
          </>
        )}
      </div>
      <div className="context-menu-separator" />
      <div
        className="context-menu-item"
        onClick={() => handleAction(() => onRename(itemPath, itemName))}
      >
        <PencilIcon className="menu-icon" />
        Rename
      </div>
      <div className="context-menu-separator" />
      <div
        className="context-menu-item danger"
        onClick={() => handleAction(() => onDelete(itemPath))}
      >
        <TrashIcon className="menu-icon" />
        Delete
      </div>
    </div>
  );
};

export default ContextMenu;
