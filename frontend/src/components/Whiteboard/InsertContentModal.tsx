/**
 * InsertContentModal Component
 * Modal for inserting app content (notes, files, todos) into the whiteboard
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Search,
  FileText,
  Folder,
  FolderOpen,
  ChevronRight,
  Image,
  File,
  Upload,
} from 'lucide-react';
import './InsertContentModal.css';

interface FileTreeNode {
  path: string;
  name: string;
  type: 'file' | 'folder';
  id?: string;
  children?: FileTreeNode[];
}

export interface InsertedContent {
  type: 'note' | 'file' | 'folder' | 'todo' | 'external-file';
  path: string;
  name: string;
  content?: string; // Preview content for notes
  fileType?: string; // For files: 'image', 'pdf', 'document', etc.
  // For external files dropped from Explorer
  dataUrl?: string; // Base64 data URL for images
  fileSize?: number; // File size in bytes
  mimeType?: string; // MIME type
}

interface InsertContentModalProps {
  contentType: 'note' | 'file' | 'todo';
  fileTree: FileTreeNode[];
  onClose: () => void;
  onInsert: (content: InsertedContent) => void;
  // Optional: for searching note contents
  onSearch?: (query: string) => Promise<Array<{ path: string; name: string; snippet?: string }>>;
}

// Get file type from extension
const getFileType = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
  const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

  if (imageExts.includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (docExts.includes(ext)) return 'document';
  if (ext === 'md') return 'markdown';
  return 'other';
};

// Get icon for file type
const getFileIcon = (node: FileTreeNode) => {
  if (node.type === 'folder') return <Folder size={16} />;

  const fileType = getFileType(node.name);
  switch (fileType) {
    case 'image':
      return <Image size={16} className="file-icon image" />;
    case 'markdown':
      return <FileText size={16} className="file-icon markdown" />;
    case 'pdf':
      return <File size={16} className="file-icon pdf" />;
    default:
      return <File size={16} className="file-icon" />;
  }
};

// Flatten file tree for searching
const flattenTree = (nodes: FileTreeNode[], parentPath = ''): FileTreeNode[] => {
  const result: FileTreeNode[] = [];

  for (const node of nodes) {
    const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    result.push({ ...node, path: node.path || fullPath });

    if (node.children) {
      result.push(...flattenTree(node.children, fullPath));
    }
  }

  return result;
};

// Build hierarchical tree from flat list
const buildTree = (nodes: FileTreeNode[]): FileTreeNode[] => {
  const root: FileTreeNode[] = [];
  const pathMap = new Map<string, FileTreeNode>();

  // Sort by path to ensure parents come before children
  const sorted = [...nodes].sort((a, b) => a.path.localeCompare(b.path));

  for (const node of sorted) {
    const pathParts = node.path.split('/');

    if (pathParts.length === 1 || node.path === node.name) {
      // Root level item
      const treeNode = { ...node, children: node.type === 'folder' ? [] : undefined };
      root.push(treeNode);
      pathMap.set(node.path, treeNode);
    } else {
      // Find parent
      const parentPath = pathParts.slice(0, -1).join('/');
      const parent = pathMap.get(parentPath);

      if (parent && parent.children) {
        const treeNode = { ...node, children: node.type === 'folder' ? [] : undefined };
        parent.children.push(treeNode);
        pathMap.set(node.path, treeNode);
      } else {
        // Parent not found, add to root
        root.push({ ...node, children: node.type === 'folder' ? [] : undefined });
      }
    }
  }

  return root;
};

const InsertContentModal: React.FC<InsertContentModalProps> = ({
  contentType,
  fileTree,
  onClose,
  onInsert,
  onSearch,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ path: string; name: string; snippet?: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<FileTreeNode | null>(null);
  const [isDraggingExternal, setIsDraggingExternal] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dragCounterRef = useRef(0);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Filter and organize file tree
  const filteredTree = useMemo(() => {
    const allItems = flattenTree(fileTree);

    // Filter based on content type
    let filtered = allItems;

    if (contentType === 'note') {
      filtered = allItems.filter(
        (item) => item.type === 'folder' || item.name.endsWith('.md')
      );
    } else if (contentType === 'file') {
      // Show all files
      filtered = allItems;
    }

    // If searching, filter by query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((item) =>
        item.name.toLowerCase().includes(query) ||
        item.path.toLowerCase().includes(query)
      );
    }

    return buildTree(filtered);
  }, [fileTree, contentType, searchQuery]);

  // Handle search with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    if (onSearch) {
      setIsSearching(true);
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const results = await onSearch(searchQuery);
          setSearchResults(results);
        } catch (err) {
          console.error('Search failed:', err);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, onSearch]);

  // Toggle folder expansion
  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Handle item selection
  const handleSelect = (item: FileTreeNode) => {
    if (item.type === 'folder') {
      toggleFolder(item.path);
    } else {
      setSelectedItem(item);
    }
  };

  // Handle insert
  const handleInsert = () => {
    if (!selectedItem) return;

    const inserted: InsertedContent = {
      type: selectedItem.type === 'folder' ? 'folder' :
            selectedItem.name.endsWith('.md') ? 'note' : 'file',
      path: selectedItem.path,
      name: selectedItem.name,
      fileType: selectedItem.type === 'file' ? getFileType(selectedItem.name) : undefined,
    };

    onInsert(inserted);
    onClose();
  };

  // Handle double-click to insert immediately
  const handleDoubleClick = (item: FileTreeNode) => {
    if (item.type === 'folder') return;

    const inserted: InsertedContent = {
      type: item.name.endsWith('.md') ? 'note' : 'file',
      path: item.path,
      name: item.name,
      fileType: item.type === 'file' ? getFileType(item.name) : undefined,
    };

    onInsert(inserted);
    onClose();
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && selectedItem) {
        handleInsert();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, selectedItem]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Helper to read file as data URL
  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Handle drag enter - show overlay for external files
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;

    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingExternal(true);
    }
  };

  // Handle drag leave - hide overlay when leaving
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;

    if (dragCounterRef.current === 0) {
      setIsDraggingExternal(false);
    }
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  // Handle drop from Explorer
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingExternal(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Process the first file (or you could process all)
    const file = files[0];
    const isImage = file.type.startsWith('image/');
    const fileType = getFileType(file.name);

    if (isImage) {
      // For images, read as data URL so it can be embedded
      try {
        const dataUrl = await readFileAsDataUrl(file);
        onInsert({
          type: 'external-file',
          path: file.name, // Use filename as path for external files
          name: file.name,
          fileType: 'image',
          dataUrl: dataUrl,
          fileSize: file.size,
          mimeType: file.type,
        });
        onClose();
      } catch (error) {
        console.error('Failed to read dropped file:', error);
      }
    } else {
      // For non-image files, just pass the metadata
      onInsert({
        type: 'external-file',
        path: file.name,
        name: file.name,
        fileType: fileType,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
      });
      onClose();
    }
  };

  // Render tree node
  const renderTreeNode = (node: FileTreeNode, depth = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedItem?.path === node.path;

    return (
      <div key={node.path}>
        <div
          className={`tree-item ${isSelected ? 'selected' : ''} ${node.type}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => handleSelect(node)}
          onDoubleClick={() => handleDoubleClick(node)}
        >
          {node.type === 'folder' && (
            <ChevronRight
              size={14}
              className={`folder-chevron ${isExpanded ? 'expanded' : ''}`}
            />
          )}
          {node.type === 'folder' ? (
            isExpanded ? (
              <FolderOpen size={16} className="folder-icon open" />
            ) : (
              <Folder size={16} className="folder-icon" />
            )
          ) : (
            getFileIcon(node)
          )}
          <span className="item-name">{node.name}</span>
        </div>

        {node.type === 'folder' && isExpanded && node.children && (
          <div className="tree-children">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Get modal title based on content type
  const getTitle = () => {
    switch (contentType) {
      case 'note':
        return 'Insert Note';
      case 'file':
        return 'Insert File';
      case 'todo':
        return 'Insert Todo';
      default:
        return 'Insert Content';
    }
  };

  return (
    <div className="insert-modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="insert-modal"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drop overlay for external files */}
        {isDraggingExternal && (
          <div className="modal-drop-overlay">
            <div className="modal-drop-content">
              <Upload size={40} strokeWidth={1.5} />
              <h3>Drop to import</h3>
              <p>Import file from your computer</p>
            </div>
          </div>
        )}

        <div className="modal-header">
          <h2>{getTitle()}</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-search">
          <Search size={16} className="search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={`Search ${contentType}s...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="modal-body">
          {isSearching ? (
            <div className="search-loading">Searching...</div>
          ) : searchQuery && searchResults.length > 0 ? (
            <div className="search-results">
              <div className="results-label">
                Search Results ({searchResults.length})
              </div>
              {searchResults.map((result) => (
                <div
                  key={result.path}
                  className={`result-item ${selectedItem?.path === result.path ? 'selected' : ''}`}
                  onClick={() =>
                    setSelectedItem({ path: result.path, name: result.name, type: 'file' })
                  }
                  onDoubleClick={() => {
                    onInsert({
                      type: result.name.endsWith('.md') ? 'note' : 'file',
                      path: result.path,
                      name: result.name,
                    });
                    onClose();
                  }}
                >
                  <FileText size={16} />
                  <div className="result-info">
                    <span className="result-name">{result.name}</span>
                    <span className="result-path">{result.path}</span>
                    {result.snippet && (
                      <span className="result-snippet">{result.snippet}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : filteredTree.length > 0 ? (
            <div className="file-tree">
              {filteredTree.map((node) => renderTreeNode(node))}
            </div>
          ) : (
            <div className="empty-state">
              <FileText size={32} strokeWidth={1.5} />
              <p>
                {searchQuery
                  ? `No ${contentType}s found matching "${searchQuery}"`
                  : `No ${contentType}s available`}
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {selectedItem && (
            <div className="selected-info">
              <span>Selected:</span>
              <span className="selected-name">{selectedItem.name}</span>
            </div>
          )}
          <div className="footer-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="insert-btn"
              onClick={handleInsert}
              disabled={!selectedItem}
            >
              {contentType === 'note' ? <FileText size={16} /> : <File size={16} />}
              Insert
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsertContentModal;
