import { FolderIcon, DocumentIcon, ChevronRightIcon, ChevronDownIcon, DocumentPlusIcon, FolderPlusIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { FolderIcon as FolderSolidIcon, StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { isImportantNote } from '../../utils/importantNotes';
import React from 'react';
import './UnifiedSidebar.css';

// Development mode flag
const isDev = import.meta.env.DEV;

// Define the UnifiedSidebarProps interface
interface UnifiedSidebarProps {
  fileTree: FileTreeNode[];
  onSelectFile: (filePath: string, fileName: string) => void;
  getRootPath: () => string;
  editing: EditingState | null;
  onStartEditing: (path: string, type: 'rename' | 'new-note' | 'new-folder') => void;
  onFinishEditing: (newName?: string) => void;
  refreshFileTree: () => Promise<void>;
  onContextMenu: (e: React.MouseEvent, itemPath: string, itemType: 'file' | 'folder', itemName: string, itemId?: string) => void;
  onMoveItem?: (sourcePath: string, destinationPath: string) => Promise<void>;
  onChangeFolderPath?: () => void;
  filesWithIncomingLinks?: Set<string>;
  teamName?: string;  // Optional team name to display at the top
}

// Ensure TreeNodeProps is defined
interface TreeNodeProps {
  node: FileTreeNode;
  onSelectFile: (filePath: string, fileName: string) => void;
  level: number;
  editing: EditingState | null;
  onFinishEditing: (newName?: string) => void;
  onContextMenu: (e: React.MouseEvent, itemPath: string, itemType: 'file' | 'folder', itemName: string, itemId?: string) => void;
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
  // Ref for tracking hovered folder without causing re-renders
  hoveredFolderRef: React.MutableRefObject<string | null>;
  highlightedPath: string | null;
  filesWithIncomingLinks?: Set<string>;
}

// Define FileTreeNode and EditingState types
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

// Corrected the import path for EditInput
import EditInput from './EditInput';

/**
 * Sort file tree nodes with hierarchy: folders > notes > other files
 * Within each category, sort alphabetically (case-insensitive)
 */
const sortFileTreeNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
  return [...nodes].sort((a, b) => {
    // First priority: folders come first
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;

    // Second priority: among files, markdown notes come before other files
    if (a.type === 'file' && b.type === 'file') {
      const aIsMarkdown = a.name.toLowerCase().endsWith('.md');
      const bIsMarkdown = b.name.toLowerCase().endsWith('.md');

      if (aIsMarkdown && !bIsMarkdown) return -1;
      if (!aIsMarkdown && bIsMarkdown) return 1;
    }

    // Third priority: alphabetical (case-insensitive)
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
};

const TreeNode: React.FC<TreeNodeProps> = React.memo(({ node, onSelectFile, level, editing, onFinishEditing, onContextMenu, onMoveItem, dragState, setDragState, hoveredFolderRef, highlightedPath, filesWithIncomingLinks }) => {
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
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);

  // Refs for direct DOM manipulation (avoid re-renders during drag)
  const nodeRef = React.useRef<HTMLDivElement>(null);
  const childrenRef = React.useRef<HTMLDivElement>(null);

  // Listen for important notes changes to re-render
  React.useEffect(() => {
    const handleImportantNotesChanged = () => {
      forceUpdate();
    };
    window.addEventListener('importantNotesChanged', handleImportantNotesChanged);
    return () => window.removeEventListener('importantNotesChanged', handleImportantNotesChanged);
  }, []);

  const isCurrentlyEditing = editing?.type === 'rename' && editing.path === node.path;
  const isAddingChild = (editing?.type === 'new-note' || editing?.type === 'new-folder') && editing.path === node.path;

  // Memoize sorted children to avoid re-sorting on every render
  const sortedChildren = React.useMemo(() => {
    return sortFileTreeNodes(node.children || []);
  }, [node.children]);

  // Auto-open folder when creating a new item inside it
  React.useEffect(() => {
    if (isAddingChild && !isOpen) {
      const newState = true;
      setIsOpen(newState);
      saveFolderState(node.path, newState);
    }
  }, [isAddingChild]);

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

  const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, node.path, node.type, node.name, node.id);
  }, [onContextMenu, node.path, node.type, node.name, node.id]);

  const handleClick = React.useCallback((e: React.MouseEvent) => {
    // Don't handle click if we just finished dragging
    if (isDragging) {
      e.preventDefault();
      return;
    }

    if (node.type === 'folder') {
      setIsOpen(prev => {
        const newState = !prev;
        saveFolderState(node.path, newState);
        return newState;
      });
    } else {
      onSelectFile(node.path, node.name);
    }
  }, [isDragging, node.type, node.path, node.name, onSelectFile]);

  const handleChevronClick = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(prev => {
      const newState = !prev;
      saveFolderState(node.path, newState);
      return newState;
    });
  }, [node.path]);

  // Mouse-based drag and drop handlers
  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    // Don't allow dragging while editing
    if (isCurrentlyEditing) {
      return;
    }

    // Don't start drag if clicking chevron (for folders)
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
  }, [isCurrentlyEditing, node, setDragState]);

  const handleMouseEnter = React.useCallback(() => {
    setIsHovered(true);

    // Check if something is being dragged and this is a folder
    if (dragState.draggedPath && node.type === 'folder' && dragState.draggedPath !== node.path) {
      // Use direct DOM manipulation for drag-over styling (no re-render)
      if (nodeRef.current) {
        nodeRef.current.classList.add('drag-over');
      }
      if (childrenRef.current) {
        childrenRef.current.classList.add('folder-children-drag-over');
      }
      // Update ref instead of state for hovered folder tracking
      hoveredFolderRef.current = node.path;
    }
  }, [dragState.draggedPath, node.type, node.path, hoveredFolderRef]);

  const handleMouseLeave = React.useCallback(() => {
    setIsHovered(false);
    // Use direct DOM manipulation to remove drag-over styling
    if (nodeRef.current) {
      nodeRef.current.classList.remove('drag-over');
    }
    if (childrenRef.current) {
      childrenRef.current.classList.remove('folder-children-drag-over');
    }
    // Clear the hovered folder ref if this was the hovered one
    if (hoveredFolderRef.current === node.path) {
      hoveredFolderRef.current = null;
    }
  }, [node.path, hoveredFolderRef]);

  const isHighlighted = highlightedPath === node.path;

  return (
    <div className="tree-node-container">
      <div
        ref={nodeRef}
        className={`tree-node ${isHovered ? 'hovered' : ''} ${isDragging ? 'dragging' : ''} ${isHighlighted ? 'highlighted' : ''}`}
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
          ref={childrenRef}
          className="tree-node-children"
          onMouseEnter={(e) => {
            // When hovering over the children area, set the parent folder as hovered
            if (dragState.draggedPath && dragState.draggedPath !== node.path) {
              e.stopPropagation();
              // Use direct DOM manipulation
              if (nodeRef.current) {
                nodeRef.current.classList.add('drag-over');
              }
              if (childrenRef.current) {
                childrenRef.current.classList.add('folder-children-drag-over');
              }
              hoveredFolderRef.current = node.path;
            }
          }}
          onMouseLeave={(e) => {
            // Only clear if we're actually leaving the children area
            const relatedTarget = e.relatedTarget;
            const currentTarget = e.currentTarget;

            // Check if relatedTarget is a valid Node before using contains
            // If relatedTarget is null or not a child of currentTarget, we're leaving
            if (!relatedTarget || !(relatedTarget instanceof Node) || !currentTarget.contains(relatedTarget)) {
              // Use direct DOM manipulation
              if (nodeRef.current) {
                nodeRef.current.classList.remove('drag-over');
              }
              if (childrenRef.current) {
                childrenRef.current.classList.remove('folder-children-drag-over');
              }
              if (hoveredFolderRef.current === node.path) {
                hoveredFolderRef.current = null;
              }
            }
          }}
        >
          {sortedChildren.map((child: FileTreeNode) => (
            <TreeNode
              key={child.id || child.path}
              node={child}
              onSelectFile={onSelectFile}
              level={level + 1}
              editing={editing}
              onFinishEditing={onFinishEditing}
              onContextMenu={onContextMenu}
              onMoveItem={onMoveItem}
              dragState={dragState}
              setDragState={setDragState}
              hoveredFolderRef={hoveredFolderRef}
              highlightedPath={highlightedPath}
              filesWithIncomingLinks={filesWithIncomingLinks}
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
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Only re-render if these specific props change
  // NOTE: We intentionally exclude hoveredFolder from comparison to avoid re-renders
  // The drag-over visual is handled via local isDragOver state instead
  const prevIsBeingDragged = prevProps.dragState.draggedPath === prevProps.node.path;
  const nextIsBeingDragged = nextProps.dragState.draggedPath === nextProps.node.path;

  return (
    prevProps.node.path === nextProps.node.path &&
    prevProps.node.name === nextProps.node.name &&
    prevProps.node.type === nextProps.node.type &&
    prevProps.level === nextProps.level &&
    prevProps.editing?.path === nextProps.editing?.path &&
    prevProps.editing?.type === nextProps.editing?.type &&
    prevProps.highlightedPath === nextProps.highlightedPath &&
    prevProps.dragState.isDragging === nextProps.dragState.isDragging &&
    prevIsBeingDragged === nextIsBeingDragged &&
    // Only compare children length for folders to detect structural changes
    (prevProps.node.children?.length || 0) === (nextProps.node.children?.length || 0)
  );
});

const UnifiedSidebar = React.forwardRef<{ revealFile: (filePath: string) => void }, UnifiedSidebarProps>((props, ref) => {
  const { fileTree, onSelectFile, getRootPath, editing, onStartEditing, onFinishEditing, onContextMenu, onMoveItem, onChangeFolderPath, filesWithIncomingLinks, teamName } = props;
  const [isRootDragOver, setIsRootDragOver] = React.useState(false);
  const [highlightedPath, setHighlightedPath] = React.useState<string | null>(null);
  const [treeKey, setTreeKey] = React.useState(0); // Key to force re-render when revealing files
  const sidebarContentRef = React.useRef<HTMLDivElement>(null);

  // Shared drag state for all tree nodes - minimal state to reduce re-renders
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

  // Use ref to track hovered folder without causing re-renders during drag
  const hoveredFolderRef = React.useRef<string | null>(null);

  // Ref for drag preview cursor position (using ref to avoid re-renders)
  const cursorPosRef = React.useRef<{ x: number; y: number } | null>(null);
  const dragPreviewRef = React.useRef<HTMLDivElement>(null);

  const rootPath = getRootPath();
  const folderName = rootPath.split(/\\/g).pop(); // Extract folder name from path

  // Check if this is a Google Drive folder ID (long alphanumeric string)
  const isGoogleDriveFolderId = folderName && folderName.length > 20 && /^[A-Za-z0-9_-]+$/.test(folderName);

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
      if (isDev) console.log('🔍 Revealing file:', filePath);

      // Get all parent folders
      const parentPaths = getParentPaths(filePath, fileTree);
      if (isDev) console.log('📁 Parent paths:', parentPaths);

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
    let rafId: number | null = null;
    let lastUpdateTime = 0;
    const THROTTLE_MS = 16; // ~60fps

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!dragState.dragStartPos || !dragState.draggedPath) {
        return;
      }

      const dx = Math.abs(e.clientX - dragState.dragStartPos.x);
      const dy = Math.abs(e.clientY - dragState.dragStartPos.y);

      // Only set dragging once when threshold is exceeded
      if ((dx > 5 || dy > 5) && !dragState.isDragging) {
        if (isDev) console.log('🚀 DRAG START:', dragState.draggedPath);
        setDragState(prev => ({ ...prev, isDragging: true }));
      }

      // Throttle cursor position updates using requestAnimationFrame
      if (dragState.isDragging || (dx > 5 || dy > 5)) {
        const now = Date.now();
        if (now - lastUpdateTime < THROTTLE_MS && rafId !== null) {
          return; // Skip this update
        }

        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }

        rafId = requestAnimationFrame(() => {
          // Update cursor position via ref and directly manipulate DOM
          cursorPosRef.current = { x: e.clientX, y: e.clientY };
          if (dragPreviewRef.current) {
            dragPreviewRef.current.style.transform = `translate(${e.clientX + 10}px, ${e.clientY + 10}px)`;
          }
          lastUpdateTime = Date.now();
          rafId = null;
        });
      }
    };

    const handleGlobalMouseUp = async () => {
      if (dragState.dragStartPos || dragState.draggedPath) {
        if (isDev) console.log('🏁 DRAG END (global)');

        // Store the drop info before resetting state - use ref for hoveredFolder
        const destPath = hoveredFolderRef.current;
        const shouldMove = destPath && dragState.draggedPath && onMoveItem;
        const sourcePath = dragState.draggedPath;

        // Reset drag state IMMEDIATELY for responsive UI
        setDragState({
          isDragging: false,
          draggedPath: null,
          dragStartPos: null,
          hoveredFolder: null,
          draggedNode: null
        });

        // Reset refs
        hoveredFolderRef.current = null;
        cursorPosRef.current = null;

        // Clear all drag-over highlights via DOM
        document.querySelectorAll('.drag-over, .folder-children-drag-over').forEach(el => {
          el.classList.remove('drag-over', 'folder-children-drag-over');
        });

        // Perform the move operation in the background (non-blocking)
        if (shouldMove && sourcePath && destPath) {
          if (isDev) {
            console.log('💧 DROP detected');
            console.log('   📦 Source:', sourcePath);
            console.log('   📂 Destination:', destPath);
          }

          // Normalize paths
          const normalizedSource = sourcePath.replace(/\\/g, '/').toLowerCase();
          const normalizedDest = destPath.replace(/\\/g, '/').toLowerCase();

          // Validate
          if (normalizedSource !== normalizedDest && !normalizedDest.startsWith(normalizedSource + '/')) {
            if (isDev) console.log('   ✅ Valid drop - moving item');
            // Execute move asynchronously without blocking UI
            onMoveItem(sourcePath, destPath).catch((error) => {
              console.error('Error moving item:', error);
            });
          } else {
            if (isDev) console.log('   ❌ Invalid drop');
          }
        }
      }
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragState, onMoveItem]);

  const handleCreateNew = (type: 'new-note' | 'new-folder') => {
    onStartEditing(rootPath, type);
  };

  const isCreatingAtRoot = editing && (editing.type === 'new-note' || editing.type === 'new-folder') && (editing.path === rootPath || editing.path === '');

  // Memoize sorted file tree to avoid re-sorting on every render
  const sortedFileTree = React.useMemo(() => {
    return sortFileTreeNodes(fileTree);
  }, [fileTree]);

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
      if (isDev) {
        console.log('💧 DROP on ROOT');
        console.log('   📦 Source path:', sourcePath);
        console.log('   📂 Destination:', rootPath);
      }

      if (sourcePath && sourcePath !== rootPath) {
        if (isDev) console.log('   ✅ Valid drop - moving to root');
        await onMoveItem(sourcePath, rootPath);
      }
    }
  };

  return (
    <div className="unified-sidebar">
      {/* Header */}
      <div className="sidebar-header">
        {teamName && (
          <div className="team-header-info">
            <h2 className="sidebar-title team-name">
              {teamName}
            </h2>
          </div>
        )}
        {!isGoogleDriveFolderId && !teamName && (
          <h2
            className="sidebar-title"
            title={`Current folder: ${rootPath}\n\nClick to change the root folder`}
            onClick={onChangeFolderPath}
          >
            {folderName}
          </h2>
        )}
        <div className="sidebar-actions">
          {onChangeFolderPath && !isGoogleDriveFolderId && !teamName && (
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
        {sortedFileTree.map((node: FileTreeNode) => (
          <TreeNode
            key={node.id ? `${node.id}-${treeKey}` : `${node.path}-${treeKey}`}
            node={node}
            onSelectFile={onSelectFile}
            level={0}
            editing={editing}
            onFinishEditing={onFinishEditing}
            onContextMenu={onContextMenu}
            onMoveItem={onMoveItem}
            dragState={dragState}
            setDragState={setDragState}
            hoveredFolderRef={hoveredFolderRef}
            highlightedPath={highlightedPath}
            filesWithIncomingLinks={filesWithIncomingLinks}
          />
        ))}
      </div>

      {/* Drag Preview - follows cursor */}
      {dragState.isDragging && dragState.draggedNode && (
        <div
          ref={dragPreviewRef}
          className="drag-preview"
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            pointerEvents: 'none',
            zIndex: 10000,
            willChange: 'transform',
          }}
        >
          <div className="drag-preview-content">
            {dragState.draggedNode.type === 'folder' ? (
              <FolderIcon className="drag-preview-icon folder-icon" />
            ) : (
              <DocumentIcon
                className={`drag-preview-icon ${
                  dragState.draggedNode.name.endsWith('.md') ? 'md-file' : ''
                }`}
              />
            )}
            <span className="drag-preview-name">
              {dragState.draggedNode.type === 'file' && dragState.draggedNode.name.endsWith('.md')
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