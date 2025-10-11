import React, { useEffect, useRef } from 'react';
import {
  DocumentPlusIcon,
  FolderPlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowPathIcon,
  FolderOpenIcon
} from '@heroicons/react/24/outline';
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
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

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

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
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
