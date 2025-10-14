import { FolderIcon, DocumentIcon, ChevronRightIcon, ChevronDownIcon, DocumentPlusIcon, FolderPlusIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { FolderIcon as FolderSolidIcon, StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { isImportantNote } from '../../utils/importantNotes';
import React from 'react';
import './UnifiedSidebar.css';

// Define the UnifiedSidebarProps interface
interface UnifiedSidebarProps {
  fileTree: FileTreeNode[];
  onSelectFile: (filePath: string, fileName: string) => void;
  getRootPath: () => string;
  editing: EditingState | null;
  onStartEditing: (path: string, type: 'rename' | 'new-note' | 'new-folder') => void;
  onFinishEditing: (newName?: string) => void;
  refreshFileTree: () => Promise<void>;
  onContextMenu: (e: React.MouseEvent, itemPath: string, itemType: 'file' | 'folder', itemName: string) => void;
  onMoveItem?: (sourcePath: string, destinationPath: string) => Promise<void>;
  onChangeFolderPath?: () => void;
}

// Ensure TreeNodeProps is defined
interface TreeNodeProps {
  node: FileTreeNode;
  onSelectFile: (filePath: string, fileName: string) => void;
  level: number;
  editing: EditingState | null;
  onFinishEditing: (newName?: string) => void;
  onContextMenu: (e: React.MouseEvent, itemPath: string, itemType: 'file' | 'folder', itemName: string) => void;
  onMoveItem?: (sourcePath: string, destinationPath: string) => Promise<void>;
  dragState: {
    isDragging: boolean;
    draggedPath: string | null;
    dragStartPos: { x: number; y: number } | null;
    hoveredFolder: string | null;
    draggedNode: FileTreeNode | null;
  };
  setDragState: React.Dispatch<React.SetStateAction<{
    isDragging: boolean;
    draggedPath: string | null;
    dragStartPos: { x: number; y: number } | null;
    hoveredFolder: string | null;
    draggedNode: FileTreeNode | null;
  }>>;
  highlightedPath: string | null;
}

// Define FileTreeNode and EditingState types
interface FileTreeNode {
  path: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
}

interface EditingState {
  path: string;
  type: 'rename' | 'new-note' | 'new-folder';
}

// Corrected the import path for EditInput
import EditInput from './EditInput';

const TreeNode: React.FC<TreeNodeProps> = ({ node, onSelectFile, level, editing, onFinishEditing, onContextMenu, onMoveItem, dragState, setDragState, highlightedPath }) => {
  // Load saved folder state from localStorage, default to true (open) for first time
  const getSavedFolderState = () => {
    if (node.type !== 'folder') return true;
    const savedStates = localStorage.getItem('folderStates');
    if (savedStates) {
      try {
        const states = JSON.parse(savedStates);
        return states[node.path] !== undefined ? states[node.path] : true;
      } catch (e) {
        return true;
      }
    }
    return true;
  };

  const [isOpen, setIsOpen] = React.useState(getSavedFolderState());
  const [isHovered, setIsHovered] = React.useState(false);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);

  // Listen for important notes changes to re-render
  React.useEffect(() => {
    const handleImportantNotesChanged = () => {
      forceUpdate();
    };
    window.addEventListener('importantNotesChanged', handleImportantNotesChanged);
    return () => window.removeEventListener('importantNotesChanged', handleImportantNotesChanged);
  }, []);

  const isCurrentlyEditing = editing?.type === 'rename' && editing.path === node.path;
  const isAddingChild = isOpen && (editing?.type === 'new-note' || editing?.type === 'new-folder') && editing.path === node.path;

  // Check if this node is being dragged
  const isDragging = dragState.isDragging && dragState.draggedPath === node.path;

  // Save folder state to localStorage when it changes
  const saveFolderState = (path: string, state: boolean) => {
    const savedStates = localStorage.getItem('folderStates');
    let states: Record<string, boolean> = {};
    if (savedStates) {
      try {
        states = JSON.parse(savedStates);
      } catch (e) {
        states = {};
      }
    }
    states[path] = state;
    localStorage.setItem('folderStates', JSON.stringify(states));
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, node.path, node.type, node.name);
  };

  const handleClick = (e: React.MouseEvent) => {
    console.log('🖱️ Click:', node.name, 'isDragging:', isDragging);

    // Don't handle click if we just finished dragging
    if (isDragging) {
      e.preventDefault();
      console.log('⚠️ Click prevented - was dragging');
      return;
    }

    if (node.type === 'folder') {
      const newState = !isOpen;
      setIsOpen(newState);
      saveFolderState(node.path, newState);
      console.log('📁 Folder toggled:', node.name, 'isOpen:', newState);
    } else {
      console.log('📄 File selected:', node.name);
      onSelectFile(node.path, node.name);
    }
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !isOpen;
    setIsOpen(newState);
    saveFolderState(node.path, newState);
  };

  // Mouse-based drag and drop handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only allow dragging for files (for now)
    if (node.type !== 'file' || isCurrentlyEditing) {
      return;
    }

    // Don't start drag if clicking chevron
    const target = e.target as HTMLElement;
    if (target.closest('.chevron-container')) {
      return;
    }

    setDragState({
      isDragging: false,
      draggedPath: node.path,
      dragStartPos: { x: e.clientX, y: e.clientY },
      hoveredFolder: null,
      draggedNode: node
    });

    console.log('🖱️ Mouse down on:', node.name);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);

    // Check if something is being dragged and this is a folder
    if (dragState.draggedPath && node.type === 'folder' && dragState.draggedPath !== node.path) {
      setIsDragOver(true);
      // Update the parent's dragState to track which folder we're hovering over
      setDragState(prev => ({ ...prev, hoveredFolder: node.path }));
      console.log('🎯 Mouse enter folder:', node.name, 'while dragging:', dragState.draggedPath);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setIsDragOver(false);
    // Clear the hovered folder when we leave
    if (dragState.hoveredFolder === node.path) {
      setDragState(prev => ({ ...prev, hoveredFolder: null }));
    }
  };

  const isHighlighted = highlightedPath === node.path;

  return (
    <div className="tree-node-container">
      <div
        className={`tree-node ${isHovered ? 'hovered' : ''} ${isDragOver ? 'drag-over' : ''} ${isDragging ? 'dragging' : ''} ${isHighlighted ? 'highlighted' : ''}`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        data-file-path={node.path}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Chevron for folders */}
        {node.type === 'folder' && (
          <div className="chevron-container" onClick={handleChevronClick}>
            {isOpen ? (
              <ChevronDownIcon className="chevron-icon" />
            ) : (
              <ChevronRightIcon className="chevron-icon" />
            )}
          </div>
        )}
        {node.type === 'file' && <div className="chevron-spacer" />}

        {/* Icon */}
        <div className="node-icon">
          {node.type === 'folder' ? (
            isOpen ? (
              <FolderSolidIcon className="folder-icon folder-open" />
            ) : (
              <FolderIcon className="folder-icon folder-closed" />
            )
          ) : (
            <DocumentIcon className={`file-icon ${node.name.endsWith('.md') ? 'md-file' : ''}`} />
          )}
        </div>

        {/* Star icon for important files */}
        {node.type === 'file' && isImportantNote(node.path) && (
          <StarSolidIcon
            className="important-star-icon"
            style={{ width: '14px', height: '14px', color: '#fbbf24', flexShrink: 0, marginRight: '4px' }}
          />
        )}

        {/* Name or EditInput */}
        {isCurrentlyEditing ? (
          <EditInput
            initialValue={node.name}
            onSave={onFinishEditing}
            onCancel={() => onFinishEditing()}
            isFile={node.type === 'file'}
          />
        ) : (
          <span className="node-name">
            {node.type === 'file' && node.name.endsWith('.md')
              ? node.name.slice(0, -3)
              : node.name}
          </span>
        )}
      </div>

      {/* Children */}
      {isOpen && node.type === 'folder' && (
        <div
          className={`tree-node-children ${isDragOver ? 'folder-children-drag-over' : ''}`}
          onMouseEnter={(e) => {
            // When hovering over the children area, set the parent folder as hovered
            if (dragState.draggedPath && dragState.draggedPath !== node.path) {
              e.stopPropagation();
              setIsDragOver(true);
              setDragState(prev => ({ ...prev, hoveredFolder: node.path }));
              console.log('🎯 Mouse enter folder children area:', node.name);
            }
          }}
          onMouseLeave={(e) => {
            // Only clear if we're actually leaving the children area
            const relatedTarget = e.relatedTarget as Node | null;
            if (!relatedTarget || !(e.currentTarget as Node).contains(relatedTarget)) {
              setIsDragOver(false);
              if (dragState.hoveredFolder === node.path) {
                setDragState(prev => ({ ...prev, hoveredFolder: null }));
              }
            }
          }}
        >
          {node.children?.map((child: FileTreeNode) => (
            <TreeNode
              key={child.path}
              node={child}
              onSelectFile={onSelectFile}
              level={level + 1}
              editing={editing}
              onFinishEditing={onFinishEditing}
              onContextMenu={onContextMenu}
              onMoveItem={onMoveItem}
              dragState={dragState}
              setDragState={setDragState}
              highlightedPath={highlightedPath}
            />
          ))}
          {isAddingChild && (
            <div
              className="tree-node new-item"
              style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}
            >
              <div className="chevron-spacer" />
              <div className="node-icon">
                {editing?.type === 'new-note' ? (
                  <DocumentIcon className="file-icon md-file" />
                ) : (
                  <FolderIcon className="folder-icon folder-closed" />
                )}
              </div>
              <EditInput
                initialValue=""
                onSave={onFinishEditing}
                onCancel={() => onFinishEditing()}
                isFile={editing?.type === 'new-note'}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const UnifiedSidebar = React.forwardRef<{ revealFile: (filePath: string) => void }, UnifiedSidebarProps>((props, ref) => {
  const { fileTree, onSelectFile, getRootPath, editing, onStartEditing, onFinishEditing, onContextMenu, onMoveItem, onChangeFolderPath } = props;
  const [isRootDragOver, setIsRootDragOver] = React.useState(false);
  const [highlightedPath, setHighlightedPath] = React.useState<string | null>(null);
  const [treeKey, setTreeKey] = React.useState(0); // Key to force re-render when revealing files
  const sidebarContentRef = React.useRef<HTMLDivElement>(null);

  // Shared drag state for all tree nodes
  const [dragState, setDragState] = React.useState<{
    isDragging: boolean;
    draggedPath: string | null;
    dragStartPos: { x: number; y: number } | null;
    hoveredFolder: string | null; // Track which folder we're hovering over
    draggedNode: FileTreeNode | null; // Store the node being dragged
  }>({
    isDragging: false,
    draggedPath: null,
    dragStartPos: null,
    hoveredFolder: null,
    draggedNode: null
  });

  // State for drag preview cursor position
  const [cursorPos, setCursorPos] = React.useState<{ x: number; y: number } | null>(null);

  console.log('🔄 UnifiedSidebar render - onMoveItem is:', onMoveItem ? 'defined ✅' : 'undefined ❌');

  const folderName = getRootPath().split(/\\/g).pop(); // Extract folder name from path
  const rootPath = getRootPath();

  // Helper function to find all parent paths of a file
  const getParentPaths = (filePath: string, tree: FileTreeNode[]): string[] => {
    const parents: string[] = [];

    const findParents = (nodes: FileTreeNode[], targetPath: string): boolean => {
      for (const node of nodes) {
        if (node.path === targetPath) {
          return true;
        }

        if (node.children) {
          if (findParents(node.children, targetPath)) {
            parents.push(node.path);
            return true;
          }
        }
      }
      return false;
    };

    findParents(tree, filePath);
    return parents.reverse(); // Return in top-down order
  };

  // Expose revealFile function via ref
  React.useImperativeHandle(ref, () => ({
    revealFile: (filePath: string) => {
      console.log('🔍 Revealing file:', filePath);

      // Get all parent folders
      const parentPaths = getParentPaths(filePath, fileTree);
      console.log('📁 Parent paths:', parentPaths);

      // Open all parent folders
      const savedStates = localStorage.getItem('folderStates');
      let states: Record<string, boolean> = {};
      if (savedStates) {
        try {
          states = JSON.parse(savedStates);
        } catch (e) {
          states = {};
        }
      }

      // Set all parents to open
      parentPaths.forEach(path => {
        states[path] = true;
      });
      localStorage.setItem('folderStates', JSON.stringify(states));

      // Force re-render to expand folders
      setTreeKey(prev => prev + 1);

      // Highlight the file
      setHighlightedPath(filePath);

      // Scroll to the file after a short delay to allow folders to expand
      setTimeout(() => {
        const element = document.querySelector(`[data-file-path="${filePath}"]`);
        if (element && sidebarContentRef.current) {
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }
      }, 100);

      // Remove highlight after animation
      setTimeout(() => {
        setHighlightedPath(null);
      }, 2000);
    }
  }));

  // Global mouse event listeners for drag (single set for entire sidebar)
  React.useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!dragState.dragStartPos || !dragState.draggedPath) {
        return;
      }

      const dx = Math.abs(e.clientX - dragState.dragStartPos.x);
      const dy = Math.abs(e.clientY - dragState.dragStartPos.y);

      // Only set dragging once when threshold is exceeded
      if ((dx > 5 || dy > 5) && !dragState.isDragging) {
        console.log('🚀 DRAG START:', dragState.draggedPath);
        setDragState(prev => ({ ...prev, isDragging: true }));
      }

      // Update cursor position for drag preview
      if (dragState.isDragging || (dx > 5 || dy > 5)) {
        setCursorPos({ x: e.clientX, y: e.clientY });
      }
    };

    const handleGlobalMouseUp = async () => {
      if (dragState.dragStartPos || dragState.draggedPath) {
        console.log('🏁 DRAG END (global)');

        // Check if we're dropping on a folder
        if (dragState.hoveredFolder && dragState.draggedPath && onMoveItem) {
          const sourcePath = dragState.draggedPath;
          const destPath = dragState.hoveredFolder;

          console.log('💧 DROP detected');
          console.log('   📦 Source:', sourcePath);
          console.log('   📂 Destination:', destPath);

          // Normalize paths
          const normalizedSource = sourcePath.replace(/\\/g, '/').toLowerCase();
          const normalizedDest = destPath.replace(/\\/g, '/').toLowerCase();

          // Validate
          if (normalizedSource !== normalizedDest && !normalizedDest.startsWith(normalizedSource + '/')) {
            console.log('   ✅ Valid drop - moving item');
            await onMoveItem(sourcePath, destPath);
          } else {
            console.log('   ❌ Invalid drop');
          }
        }

        // Reset drag state
        setDragState({
          isDragging: false,
          draggedPath: null,
          dragStartPos: null,
          hoveredFolder: null,
          draggedNode: null
        });

        // Reset cursor position
        setCursorPos(null);
      }
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragState, onMoveItem]);

  const handleCreateNew = (type: 'new-note' | 'new-folder') => {
    onStartEditing(rootPath, type);
  };

  const isCreatingAtRoot = editing && (editing.type === 'new-note' || editing.type === 'new-folder') && editing.path === rootPath;

  // Root-level drag and drop handlers
  const handleRootDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    // Only update state if it's not already true
    if (!isRootDragOver) {
      setIsRootDragOver(true);
    }
  };

  const handleRootDragLeave = (e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      setIsRootDragOver(false);
    }
  };

  const handleRootDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRootDragOver(false);

    if (onMoveItem) {
      const sourcePath = e.dataTransfer.getData('text/plain');
      console.log('💧 DROP on ROOT');
      console.log('   📦 Source path:', sourcePath);
      console.log('   📂 Destination:', rootPath);

      if (sourcePath && sourcePath !== rootPath) {
        console.log('   ✅ Valid drop - moving to root');
        await onMoveItem(sourcePath, rootPath);
      }
    }
  };

  return (
    <div className="unified-sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <h2
          className="sidebar-title"
          title={`Current folder: ${rootPath}\n\nClick to change the root folder`}
          onClick={onChangeFolderPath}
        >
          {folderName}
        </h2>
        <div className="sidebar-actions">
          {onChangeFolderPath && (
            <button
              onClick={onChangeFolderPath}
              className="action-button"
              title="Change Root Folder"
            >
              <Cog6ToothIcon className="action-icon" />
            </button>
          )}
          <button
            onClick={() => handleCreateNew('new-note')}
            className="action-button"
            title="New Note"
          >
            <DocumentPlusIcon className="action-icon" />
          </button>
          <button
            onClick={() => handleCreateNew('new-folder')}
            className="action-button"
            title="New Folder"
          >
            <FolderPlusIcon className="action-icon" />
          </button>
        </div>
      </div>

      {/* File Tree */}
      <div
        ref={sidebarContentRef}
        className={`sidebar-content ${isRootDragOver ? 'root-drag-over' : ''}`}
        onDragOver={handleRootDragOver}
        onDragLeave={handleRootDragLeave}
        onDrop={handleRootDrop}
      >
        {isCreatingAtRoot && (
          <div className="tree-node new-item" style={{ paddingLeft: '8px' }}>
            <div className="chevron-spacer" />
            <div className="node-icon">
              {editing.type === 'new-note' ? (
                <DocumentIcon className="file-icon md-file" />
              ) : (
                <FolderIcon className="folder-icon folder-closed" />
              )}
            </div>
            <EditInput
              initialValue=""
              onSave={onFinishEditing}
              onCancel={() => onFinishEditing()}
              isFile={editing.type === 'new-note'}
            />
          </div>
        )}
        {fileTree.map((node: FileTreeNode) => (
          <TreeNode
            key={`${node.path}-${treeKey}`}
            node={node}
            onSelectFile={onSelectFile}
            level={0}
            editing={editing}
            onFinishEditing={onFinishEditing}
            onContextMenu={onContextMenu}
            onMoveItem={onMoveItem}
            dragState={dragState}
            setDragState={setDragState}
            highlightedPath={highlightedPath}
          />
        ))}
      </div>

      {/* Drag Preview - follows cursor */}
      {dragState.isDragging && cursorPos && dragState.draggedNode && (
        <div
          className="drag-preview"
          style={{
            position: 'fixed',
            left: `${cursorPos.x + 10}px`,
            top: `${cursorPos.y + 10}px`,
            pointerEvents: 'none',
            zIndex: 10000,
          }}
        >
          <div className="drag-preview-content">
            <DocumentIcon
              className={`drag-preview-icon ${
                dragState.draggedNode.name.endsWith('.md') ? 'md-file' : ''
              }`}
            />
            <span className="drag-preview-name">
              {dragState.draggedNode.name.endsWith('.md')
                ? dragState.draggedNode.name.slice(0, -3)
                : dragState.draggedNode.name}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

export { TreeNode, UnifiedSidebar };