import { FolderIcon, DocumentIcon, ChevronRightIcon, ChevronDownIcon, DocumentPlusIcon, FolderPlusIcon, Cog6ToothIcon, PlusIcon } from '@heroicons/react/24/outline';
import { FolderIcon as FolderSolidIcon, StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { isImportantNote } from '../../utils/importantNotes';
import { getLocalStorage, setLocalStorage } from '../../hooks/useLocalStorage';
import { getPlatformEventConfig } from '../../utils/platform';
import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import './UnifiedSidebar.css';

// Development mode flag
const isDev = import.meta.env.DEV;

// Platform-specific event configuration
const platformConfig = getPlatformEventConfig();

// Whiteboard metadata type (matching whiteboardTypes.ts)
interface WhiteboardMeta {
  id: string;
  teamId: string;
  name: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  thumbnail?: string;
}

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
  onDropExternalFiles?: (files: File[], destinationPath: string) => Promise<void>;  // Drop files from OS
  onDropExternalDirectory?: (sourcePath: string, destinationPath: string) => Promise<void>;  // Drop folders from OS
  onChangeFolderPath?: () => void;
  filesWithIncomingLinks?: Set<string>;
  teamName?: string;  // Optional team name to display at the top
  // Whiteboard props (for team mode)
  whiteboards?: WhiteboardMeta[];
  activeWhiteboardId?: string | null;
  onSelectWhiteboard?: (whiteboardId: string) => void;
  onCreateWhiteboard?: () => void;
  onWhiteboardContextMenu?: (e: React.MouseEvent, whiteboard: WhiteboardMeta) => void;
  showWhiteboardSection?: boolean;
  // Whiteboard inline rename props
  renamingWhiteboardId?: string | null;
  onWhiteboardRenameSubmit?: (id: string, newName: string) => void;
  onWhiteboardRenameCancel?: () => void;
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
  onDropExternalFiles?: (files: File[], destinationPath: string) => Promise<void>;
  dragState: {
    isDragging: boolean;
    draggedPath: string | null;
    dragStartPos: { x: number; y: number } | null;
    dragStartTime: number | null;
    hoveredFolder: string | null;
    draggedNode: FileTreeNode | null;
  };
  setDragState: React.Dispatch<React.SetStateAction<{
    isDragging: boolean;
    draggedPath: string | null;
    dragStartPos: { x: number; y: number } | null;
    dragStartTime: number | null;
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

const TreeNode: React.FC<TreeNodeProps> = React.memo(({ node, onSelectFile, level, editing, onFinishEditing, onContextMenu, onMoveItem, onDropExternalFiles, dragState, setDragState, hoveredFolderRef, highlightedPath, filesWithIncomingLinks }) => {
  // Load saved folder state from localStorage, default to true (open) for first time
  const getSavedFolderState = () => {
    if (node.type !== 'folder') return true;
    const states = getLocalStorage<Record<string, boolean>>('folderStates', {});
    return states[node.path] !== undefined ? states[node.path] : true;
  };

  const [isOpen, setIsOpen] = React.useState(getSavedFolderState());
  const [isHovered, setIsHovered] = React.useState(false);
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);

  // Mac trackpad fix: Use ref to track mousedown position for synchronous click detection
  const mouseDownPosRef = React.useRef<{ x: number; y: number; time: number } | null>(null);

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

  // Check if this node is being dragged (used for visual styling only)
  const isBeingDragged = dragState.isDragging && dragState.draggedPath === node.path;

  // Save folder state to localStorage when it changes
  const saveFolderState = (path: string, state: boolean) => {
    const states = getLocalStorage<Record<string, boolean>>('folderStates', {});
    states[path] = state;
    setLocalStorage('folderStates', states);
  };

  const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, node.path, node.type, node.name, node.id);
  }, [onContextMenu, node.path, node.type, node.name, node.id]);

  const handleClick = React.useCallback((e: React.MouseEvent) => {
    // Mac trackpad fix: Use synchronous ref-based detection instead of async React state
    // Check if this click is actually the end of a drag operation
    const mouseDownPos = mouseDownPosRef.current;

    if (mouseDownPos) {
      const dx = Math.abs(e.clientX - mouseDownPos.x);
      const dy = Math.abs(e.clientY - mouseDownPos.y);
      const timeSinceMouseDown = Date.now() - mouseDownPos.time;

      // If significant movement occurred, this was a drag, not a click
      // Use platform-specific thresholds
      const wasDrag = (dx > platformConfig.dragDistanceThreshold || dy > platformConfig.dragDistanceThreshold)
        && timeSinceMouseDown > platformConfig.dragTimeThreshold;

      if (wasDrag) {
        if (isDev) console.log('🚫 CLICK blocked (was drag):', { dx, dy, timeMs: timeSinceMouseDown });
        mouseDownPosRef.current = null;
        return;
      }
    }

    // Clear the ref
    mouseDownPosRef.current = null;

    if (node.type === 'folder') {
      if (isDev) console.log('📂 CLICK: toggle folder', node.path);
      setIsOpen((prev: boolean) => {
        const newState = !prev;
        saveFolderState(node.path, newState);
        return newState;
      });
    } else {
      if (isDev) console.log('📄 CLICK: select file', node.path);
      onSelectFile(node.path, node.name);
    }
  }, [node.type, node.path, node.name, onSelectFile]);

  const handleChevronClick = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((prev: boolean) => {
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

    // Mac trackpad fix: Record mousedown position in ref for synchronous click detection
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };

    // Set drag state for potential drag operation
    setDragState({
      isDragging: false,
      draggedPath: node.path,
      dragStartPos: { x: e.clientX, y: e.clientY },
      dragStartTime: Date.now(),
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

  // Helper to get parent folder path from a file path
  const getParentFolderPath = React.useCallback((filePath: string): string => {
    // Handle both Windows (\) and Unix (/) path separators
    const lastBackslash = filePath.lastIndexOf('\\');
    const lastSlash = filePath.lastIndexOf('/');
    const lastSeparator = Math.max(lastBackslash, lastSlash);

    if (lastSeparator === -1) {
      return ''; // Root level
    }
    return filePath.substring(0, lastSeparator);
  }, []);

  // HTML5 drag event handlers for external file drops (works on both files and folders)
  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    // Check if this is an external file drag (has files in dataTransfer)
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';

      // Show drag-over styling
      if (nodeRef.current) {
        nodeRef.current.classList.add('drag-over');
      }
    }
  }, []);

  const handleDragLeaveExternal = React.useCallback((_e: React.DragEvent) => {
    // Remove drag-over styling
    if (nodeRef.current) {
      nodeRef.current.classList.remove('drag-over');
    }
  }, []);

  const handleDropExternal = React.useCallback(async (e: React.DragEvent) => {
    // Check for external files
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && onDropExternalFiles) {
      e.preventDefault();
      e.stopPropagation();

      // Remove drag-over styling
      if (nodeRef.current) {
        nodeRef.current.classList.remove('drag-over');
      }

      // Determine destination folder:
      // - If dropped on a folder, use that folder
      // - If dropped on a file, use the file's parent folder
      const destinationPath = node.type === 'folder'
        ? node.path
        : getParentFolderPath(node.path);

      if (isDev) console.log('📂 External files dropped on', node.type, ':', node.path, '→ saving to:', destinationPath, files.map(f => f.name));

      // Call the handler to save files to the destination folder
      await onDropExternalFiles(files, destinationPath);
    }
  }, [node.type, node.path, onDropExternalFiles, getParentFolderPath]);

  const isHighlighted = highlightedPath === node.path;

  return (
    <div className="tree-node-container">
      <div
        ref={nodeRef}
        className={`tree-node ${isHovered ? 'hovered' : ''} ${isBeingDragged ? 'dragging' : ''} ${isHighlighted ? 'highlighted' : ''}`}
        style={{ paddingLeft: `${level * 12 + 4}px` }}
        data-file-path={node.path}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeaveExternal}
        onDrop={handleDropExternal}
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
              onDropExternalFiles={onDropExternalFiles}
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
              style={{ paddingLeft: `${(level + 1) * 12 + 4}px` }}
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
  const {
    fileTree, onSelectFile, getRootPath, editing, onStartEditing, onFinishEditing,
    onContextMenu, onMoveItem, onDropExternalFiles, onDropExternalDirectory,
    onChangeFolderPath, filesWithIncomingLinks, teamName,
    // Whiteboard props
    whiteboards = [], activeWhiteboardId, onSelectWhiteboard, onCreateWhiteboard,
    onWhiteboardContextMenu, showWhiteboardSection = false,
    // Whiteboard inline rename props
    renamingWhiteboardId, onWhiteboardRenameSubmit, onWhiteboardRenameCancel
  } = props;
  const [isRootDragOver, setIsRootDragOver] = React.useState(false);
  const [highlightedPath, setHighlightedPath] = React.useState<string | null>(null);
  const [treeKey, setTreeKey] = React.useState(0); // Key to force re-render when revealing files
  const sidebarContentRef = React.useRef<HTMLDivElement>(null);

  // Section collapse state (only used when whiteboard section is shown)
  const [filesCollapsed, setFilesCollapsed] = React.useState(() => {
    return getLocalStorage<boolean>('sidebar-files-collapsed', true);
  });
  const [whiteboardsCollapsed, setWhiteboardsCollapsed] = React.useState(() => {
    return getLocalStorage<boolean>('sidebar-whiteboards-collapsed', false);
  });

  // Section height state for draggable divider (percentage for files section)
  const [filesSectionHeight, setFilesSectionHeight] = React.useState(() => {
    return getLocalStorage<number>('sidebar-files-height', 30); // Default 30% for files, 70% for whiteboards
  });
  const [isDraggingDivider, setIsDraggingDivider] = React.useState(false);
  const sidebarSectionsRef = React.useRef<HTMLDivElement>(null);

  // Save section states to localStorage
  React.useEffect(() => {
    setLocalStorage('sidebar-files-collapsed', filesCollapsed);
  }, [filesCollapsed]);

  React.useEffect(() => {
    setLocalStorage('sidebar-whiteboards-collapsed', whiteboardsCollapsed);
  }, [whiteboardsCollapsed]);

  React.useEffect(() => {
    setLocalStorage('sidebar-files-height', filesSectionHeight);
  }, [filesSectionHeight]);

  // Draggable divider handlers
  React.useEffect(() => {
    if (!isDraggingDivider) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!sidebarSectionsRef.current) return;

      const rect = sidebarSectionsRef.current.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const percentage = Math.min(80, Math.max(20, (relativeY / rect.height) * 100));
      setFilesSectionHeight(percentage);
    };

    const handleMouseUp = () => {
      setIsDraggingDivider(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingDivider]);

  // Shared drag state for all tree nodes - minimal state to reduce re-renders
  const [dragState, setDragState] = React.useState<{
    isDragging: boolean;
    draggedPath: string | null;
    dragStartPos: { x: number; y: number } | null;
    dragStartTime: number | null;
    hoveredFolder: string | null; // Track which folder we're hovering over
    draggedNode: FileTreeNode | null; // Store the node being dragged
  }>({
    isDragging: false,
    draggedPath: null,
    dragStartPos: null,
    dragStartTime: null,
    hoveredFolder: null,
    draggedNode: null
  });

  // Use ref to track hovered folder without causing re-renders during drag
  const hoveredFolderRef = React.useRef<string | null>(null);

  // Ref to track dragState for event handlers (prevents re-registering listeners)
  const dragStateRef = React.useRef(dragState);
  React.useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  // Ref for onMoveItem to avoid re-registering listeners
  const onMoveItemRef = React.useRef(onMoveItem);
  React.useEffect(() => {
    onMoveItemRef.current = onMoveItem;
  }, [onMoveItem]);

  // Ref for drag preview cursor position (using ref to avoid re-renders)
  const cursorPosRef = React.useRef<{ x: number; y: number } | null>(null);
  const dragPreviewRef = React.useRef<HTMLDivElement>(null);

  // Ref to track currently highlighted external drag folder element
  const externalDragHighlightRef = React.useRef<HTMLElement | null>(null);

  // Listen for external drag events from Tauri (team mode)
  React.useEffect(() => {
    const handleExternalDrag = (event: Event) => {
      const customEvent = event as CustomEvent<{ isDragging: boolean; position?: { x: number; y: number } }>;
      const { isDragging, position } = customEvent.detail;

      if (!isDragging) {
        // Clear any highlighted node when drag ends
        if (externalDragHighlightRef.current) {
          externalDragHighlightRef.current.classList.remove('drag-over');
          externalDragHighlightRef.current = null;
        }
        setIsRootDragOver(false);
        return;
      }

      // Find which node is under the cursor
      if (position) {
        // Get element at cursor position
        const elementAtPoint = document.elementFromPoint(position.x, position.y);

        // Find the closest tree-node (folder or file)
        const treeNode = elementAtPoint?.closest('.tree-node') as HTMLElement | null;

        // Check if it's a folder
        const isFolder = treeNode?.querySelector('.folder-icon') !== null;

        // If over a file, try to find its parent folder (tree-node-container > tree-node)
        let targetNode = treeNode;
        if (treeNode && !isFolder) {
          // It's a file - find the parent folder's tree-node
          const parentContainer = treeNode.closest('.tree-node-children');
          if (parentContainer) {
            const parentNode = parentContainer.previousElementSibling as HTMLElement | null;
            if (parentNode?.classList.contains('tree-node')) {
              targetNode = parentNode;
            }
          }
        }

        // Remove highlight from previous element if different
        if (externalDragHighlightRef.current && externalDragHighlightRef.current !== targetNode) {
          externalDragHighlightRef.current.classList.remove('drag-over');
        }

        // Add highlight to target node (folder)
        if (targetNode && targetNode.querySelector('.folder-icon')) {
          targetNode.classList.add('drag-over');
          externalDragHighlightRef.current = targetNode;
          setIsRootDragOver(false); // Don't show full sidebar overlay
        } else if (elementAtPoint?.closest('.sidebar-content')) {
          // Over sidebar but not on any node - show root overlay
          if (externalDragHighlightRef.current) {
            externalDragHighlightRef.current.classList.remove('drag-over');
            externalDragHighlightRef.current = null;
          }
          setIsRootDragOver(true);
        } else {
          // Not over sidebar at all
          if (externalDragHighlightRef.current) {
            externalDragHighlightRef.current.classList.remove('drag-over');
            externalDragHighlightRef.current = null;
          }
          setIsRootDragOver(false);
        }
      }
    };

    window.addEventListener('sidebar-external-drag', handleExternalDrag);
    return () => {
      window.removeEventListener('sidebar-external-drag', handleExternalDrag);
    };
  }, []);

  // Listen for external drop events from Tauri (team mode)
  React.useEffect(() => {
    const handleExternalDrop = async (event: Event) => {
      const customEvent = event as CustomEvent<{ paths: string[]; position: { x: number; y: number } }>;
      const { paths, position } = customEvent.detail;

      if (!paths || paths.length === 0) {
        return;
      }

      if (isDev) console.log('[SIDEBAR] External drop event:', paths, position);

      // Clear any highlight
      if (externalDragHighlightRef.current) {
        externalDragHighlightRef.current.classList.remove('drag-over');
        externalDragHighlightRef.current = null;
      }

      // Find which folder the drop is over
      let destinationPath = getRootPath(); // Default to root

      if (position) {
        const elementAtPoint = document.elementFromPoint(position.x, position.y);
        const treeNode = elementAtPoint?.closest('.tree-node') as HTMLElement | null;

        if (treeNode) {
          // Get path from data-file-path attribute
          const nodePath = treeNode.getAttribute('data-file-path');
          const isFolder = treeNode.querySelector('.folder-icon') !== null;

          if (nodePath) {
            if (isFolder) {
              // Drop directly into this folder
              destinationPath = nodePath;
            } else {
              // It's a file - get its parent folder
              const lastSeparator = Math.max(nodePath.lastIndexOf('\\'), nodePath.lastIndexOf('/'));
              if (lastSeparator > 0) {
                destinationPath = nodePath.substring(0, lastSeparator);
              }
            }
            if (isDev) console.log('[SIDEBAR] Drop destination folder:', destinationPath);
          }
        }
      }

      // Process each dropped path - check if it's a file or directory
      try {
        const files: File[] = [];
        const mimeTypes: Record<string, string> = {
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'gif': 'image/gif',
          'webp': 'image/webp',
          'svg': 'image/svg+xml',
          'pdf': 'application/pdf',
          'txt': 'text/plain',
          'md': 'text/markdown',
        };

        for (const filePath of paths) {
          // Check if this path is a directory
          const isDir = await invoke<boolean>('is_path_directory', { path: filePath });

          if (isDir) {
            // Handle directory drop
            if (onDropExternalDirectory) {
              if (isDev) console.log('[SIDEBAR] Dropping directory:', filePath, 'to:', destinationPath);
              await onDropExternalDirectory(filePath, destinationPath);
            } else {
              console.warn('[SIDEBAR] Directory dropped but no handler available:', filePath);
            }
          } else {
            // Handle file drop
            const fileName = filePath.split(/[/\\]/).pop() || 'file';
            const ext = fileName.split('.').pop()?.toLowerCase() || '';
            const mimeType = mimeTypes[ext] || 'application/octet-stream';

            // Read file as binary using Tauri command
            const bytes = await invoke<number[]>('read_binary_file', { filePath });
            const uint8Array = new Uint8Array(bytes);
            const file = new File([uint8Array], fileName, { type: mimeType });
            if (isDev) console.log('[SIDEBAR] Read file:', fileName, 'size:', file.size, 'bytes');
            files.push(file);
          }
        }

        if (files.length > 0 && onDropExternalFiles) {
          if (isDev) console.log('[SIDEBAR] Calling onDropExternalFiles with', files.length, 'files to:', destinationPath);
          await onDropExternalFiles(files, destinationPath);
        }
      } catch (err) {
        console.error('[SIDEBAR] Failed to process dropped files:', err);
      }
    };

    window.addEventListener('sidebar-external-drop', handleExternalDrop);
    return () => {
      window.removeEventListener('sidebar-external-drop', handleExternalDrop);
    };
  }, [onDropExternalFiles, onDropExternalDirectory, getRootPath]);

  const rootPath = getRootPath();
  const rawFolderName = rootPath.split(/\\/g).pop(); // Extract folder name from path

  // Strip "Conceptualize - " prefix if present to show just the workspace name
  const folderName = rawFolderName?.startsWith('Conceptualize - ')
    ? rawFolderName.slice('Conceptualize - '.length)
    : rawFolderName;

  // Check if this is a Google Drive folder ID (long alphanumeric string)
  const isGoogleDriveFolderId = rawFolderName && rawFolderName.length > 20 && /^[A-Za-z0-9_-]+$/.test(rawFolderName);

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
      const states = getLocalStorage<Record<string, boolean>>('folderStates', {});

      // Set all parents to open
      parentPaths.forEach(path => {
        states[path] = true;
      });
      setLocalStorage('folderStates', states);

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
  // Using refs to avoid re-registering listeners on every state change
  React.useEffect(() => {
    let rafId: number | null = null;
    let lastUpdateTime = 0;
    const THROTTLE_MS = 16; // ~60fps

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const currentDragState = dragStateRef.current;
      if (!currentDragState.dragStartPos || !currentDragState.draggedPath) {
        return;
      }

      const dx = Math.abs(e.clientX - currentDragState.dragStartPos.x);
      const dy = Math.abs(e.clientY - currentDragState.dragStartPos.y);
      const timeSinceMouseDown = currentDragState.dragStartTime ? Date.now() - currentDragState.dragStartTime : 0;

      // Mac trackpad fix: Require BOTH distance AND time before starting drag
      // This prevents tap-to-click micro-movements from triggering drag
      // Use platform-specific thresholds
      const distanceThresholdMet = dx > platformConfig.dragDistanceThreshold || dy > platformConfig.dragDistanceThreshold;
      const timeThresholdMet = timeSinceMouseDown > platformConfig.dragTimeThreshold;

      if (distanceThresholdMet && timeThresholdMet && !currentDragState.isDragging) {
        if (isDev) console.log('🚀 DRAG START:', currentDragState.draggedPath);
        setDragState(prev => ({ ...prev, isDragging: true }));
      }

      // Throttle cursor position updates using requestAnimationFrame
      if (currentDragState.isDragging || (distanceThresholdMet && timeThresholdMet)) {
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

    // Helper to reset drag state (used by multiple handlers)
    const resetDragState = () => {
      setDragState({
        isDragging: false,
        draggedPath: null,
        dragStartPos: null,
        dragStartTime: null,
        hoveredFolder: null,
        draggedNode: null
      });
      hoveredFolderRef.current = null;
      cursorPosRef.current = null;
      document.querySelectorAll('.drag-over, .folder-children-drag-over').forEach(el => {
        el.classList.remove('drag-over', 'folder-children-drag-over');
      });
    };

    const handleGlobalMouseUp = async () => {
      const currentDragState = dragStateRef.current;
      const currentOnMoveItem = onMoveItemRef.current;

      if (currentDragState.dragStartPos || currentDragState.draggedPath) {

        // Store the drop info before resetting state - use ref for hoveredFolder
        const destPath = hoveredFolderRef.current;
        const shouldMove = destPath && currentDragState.draggedPath && currentOnMoveItem;
        const sourcePath = currentDragState.draggedPath;

        // Reset drag state IMMEDIATELY for responsive UI
        resetDragState();

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
            currentOnMoveItem(sourcePath, destPath).catch((error) => {
              console.error('Error moving item:', error);
            });
          } else {
            if (isDev) console.log('   ❌ Invalid drop');
          }
        }
      }
    };

    // Mac trackpad fix: Reset drag state when window loses focus
    // This handles cases where mouseup doesn't fire (e.g., three-finger gestures, app switching)
    // IMPORTANT: On macOS with custom decorations, blur fires during normal clicks!
    // Only reset if we're ACTUALLY dragging (not just mousedown), to avoid breaking normal clicks
    const handleWindowBlur = () => {
      const currentDragState = dragStateRef.current;
      // Only reset if we're actually dragging and truly lost focus
      if (currentDragState.isDragging && !document.hasFocus()) {
        resetDragState();
      }
    };

    // Mac trackpad fix: Reset drag state when tab becomes hidden
    const handleVisibilityChange = () => {
      if (document.hidden) {
        const currentDragState = dragStateRef.current;
        if (currentDragState.dragStartPos || currentDragState.draggedPath) {
          resetDragState();
        }
      }
    };

    // Mac trackpad fix: Handle interrupted pointer interactions
    const handlePointerCancel = () => {
      const currentDragState = dragStateRef.current;
      if (currentDragState.dragStartPos || currentDragState.draggedPath) {
        resetDragState();
      }
    };

    // Touch cancel also resets drag state
    const handleTouchCancel = () => {
      const currentDragState = dragStateRef.current;
      if (currentDragState.dragStartPos || currentDragState.draggedPath) {
        resetDragState();
      }
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('pointercancel', handlePointerCancel);
    document.addEventListener('touchcancel', handleTouchCancel);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('pointercancel', handlePointerCancel);
      document.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, []); // Empty deps - uses refs for current values

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

    // Check if this is an external file drag (from OS/Windows Explorer)
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    } else {
      e.dataTransfer.dropEffect = 'move';
    }

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

    // Check for external files first
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && onDropExternalFiles) {
      if (isDev) console.log('📂 External files dropped on ROOT:', rootPath, files.map(f => f.name));
      await onDropExternalFiles(files, rootPath);
      return;
    }

    // Otherwise, handle internal move
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

  // Render file tree content (reused in both layouts)
  const renderFileTree = () => (
    <>
      {isCreatingAtRoot && (
        <div className="tree-node new-item" style={{ paddingLeft: '4px' }}>
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
          onDropExternalFiles={onDropExternalFiles}
          dragState={dragState}
          setDragState={setDragState}
          hoveredFolderRef={hoveredFolderRef}
          highlightedPath={highlightedPath}
          filesWithIncomingLinks={filesWithIncomingLinks}
        />
      ))}
    </>
  );

  // Render whiteboard list items (simple style like file tree - no icons)
  const renderWhiteboardList = () => (
    <>
      {whiteboards.map((wb) => {
        const isRenaming = renamingWhiteboardId === wb.id;
        return (
          <div
            key={wb.id}
            className={`whiteboard-item ${activeWhiteboardId === wb.id ? 'active' : ''}`}
            onClick={() => {
              if (!isRenaming) {
                onSelectWhiteboard?.(wb.id);
              }
            }}
            onContextMenu={(e) => {
              if (!isRenaming) {
                onWhiteboardContextMenu?.(e, wb);
              }
            }}
            title={isRenaming ? undefined : `Created by ${wb.createdByName}\nLast updated: ${wb.updatedAt.toLocaleDateString()}`}
          >
            {isRenaming ? (
              <EditInput
                initialValue={wb.name}
                onSave={(newName) => onWhiteboardRenameSubmit?.(wb.id, newName)}
                onCancel={() => onWhiteboardRenameCancel?.()}
                isFile={false}
              />
            ) : (
              <span className="whiteboard-item-name">{wb.name}</span>
            )}
          </div>
        );
      })}
      {/* Empty space when no whiteboards - just show nothing */}
    </>
  );

  // Sectioned layout (when whiteboard section is shown)
  if (showWhiteboardSection) {
    return (
      <div className="unified-sidebar">
        {/* Team Header */}
        {teamName && (
          <div className="sidebar-header">
            <div className="team-header-info">
              <h2 className="sidebar-title team-name">{teamName}</h2>
            </div>
          </div>
        )}

        {/* Sectioned Content */}
        <div className="sidebar-sections" ref={sidebarSectionsRef}>
          {/* FILES Section */}
          {/* FILES Section - collapsed bar style */}
          <div
            className="section-collapsed-bar"
            onClick={() => setFilesCollapsed(!filesCollapsed)}
            title={filesCollapsed ? "Expand Files" : "Collapse Files"}
          >
            <FolderIcon className="collapsed-bar-icon" />
            <span className="collapsed-bar-label">Files</span>
            <div className="section-actions" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => {
                  if (filesCollapsed) setFilesCollapsed(false);
                  onStartEditing(getRootPath(), 'new-note');
                }}
                className="section-action-btn"
                title="New Note"
              >
                <DocumentPlusIcon className="action-icon" />
              </button>
              <button
                onClick={() => {
                  if (filesCollapsed) setFilesCollapsed(false);
                  onStartEditing(getRootPath(), 'new-folder');
                }}
                className="section-action-btn"
                title="New Folder"
              >
                <FolderPlusIcon className="action-icon" />
              </button>
            </div>
            {filesCollapsed ? (
              <ChevronRightIcon className="collapsed-bar-chevron" />
            ) : (
              <ChevronDownIcon className="collapsed-bar-chevron" />
            )}
          </div>
          {!filesCollapsed && (
            <div
              className={`sidebar-section files-section`}
              style={{ height: whiteboardsCollapsed ? 'calc(100% - 64px)' : `calc(${filesSectionHeight}% - 36px)` }}
            >
              <div
                ref={sidebarContentRef}
                className={`section-content ${isRootDragOver ? 'root-drag-over' : ''}`}
                onDragOver={handleRootDragOver}
                onDragLeave={handleRootDragLeave}
                onDrop={handleRootDrop}
              >
                {renderFileTree()}
              </div>
            </div>
          )}

          {/* Draggable Divider */}
          {!filesCollapsed && !whiteboardsCollapsed && (
            <div
              className={`section-divider ${isDraggingDivider ? 'dragging' : ''}`}
              onMouseDown={() => setIsDraggingDivider(true)}
            >
              <div className="divider-handle" />
            </div>
          )}

          {/* WHITEBOARDS Section - collapsed bar style */}
          <div
            className="section-collapsed-bar"
            onClick={() => setWhiteboardsCollapsed(!whiteboardsCollapsed)}
            title={whiteboardsCollapsed ? "Expand Whiteboards" : "Collapse Whiteboards"}
          >
            <svg className="collapsed-bar-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
              <circle cx="11" cy="11" r="2" />
            </svg>
            <span className="collapsed-bar-label">Whiteboards</span>
            <div className="section-actions" onClick={(e) => e.stopPropagation()}>
              {onCreateWhiteboard && (
                <button
                  onClick={onCreateWhiteboard}
                  className="section-action-btn"
                  title="New Whiteboard"
                >
                  <PlusIcon className="action-icon" />
                </button>
              )}
            </div>
            {whiteboardsCollapsed ? (
              <ChevronRightIcon className="collapsed-bar-chevron" />
            ) : (
              <ChevronDownIcon className="collapsed-bar-chevron" />
            )}
          </div>
          {!whiteboardsCollapsed && (
            <div
              className={`sidebar-section whiteboards-section`}
              style={{ height: filesCollapsed ? 'calc(100% - 64px)' : `calc(${100 - filesSectionHeight}% - 36px)` }}
            >
              <div className="section-content whiteboard-list">
                {renderWhiteboardList()}
              </div>
            </div>
          )}
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
  }

  // Original layout (no whiteboard section)
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
        {renderFileTree()}
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