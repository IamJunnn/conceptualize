import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import GraphEngine from './GraphEngine';
import ConfirmModal from '../UI/ConfirmModal';
import { buildGraphFromFiles, GraphData, GraphNode, getHiddenNodes } from '../../utils/graphUtils';
import { useGraphVisibility } from '../../contexts/GraphVisibilityContext';
import { TeamDriveStorage } from '../../services/teamDriveStorage';
import { FilePlus, FolderPlus, AlertCircle } from 'lucide-react';
import './GraphView.css';

interface GraphViewProps {
  rootPath: string;
  onFileOpen?: (filePath: string, fileName: string) => void;
  onNodeContextMenu?: (event: React.MouseEvent, node: any) => void;
  onCreateNote?: () => void;
  onCreateFolder?: () => void;
  storageBackend?: TeamDriveStorage; // For team mode
}

interface MarkdownFile {
  path: string;
  content: string;
}

interface MarkdownFilesResult {
  files: MarkdownFile[];
  folders: string[];
}

function GraphView({ rootPath, onFileOpen, onNodeContextMenu, onCreateNote, onCreateFolder, storageBackend }: GraphViewProps) {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [hiddenNodesData, setHiddenNodesData] = useState<GraphNode[]>([]);
  const [totalNodes, setTotalNodes] = useState(0); // Total before filtering
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const { hiddenPaths, showAll, getHiddenCount } = useGraphVisibility();
  const isTeamMode = !!storageBackend;

  useEffect(() => {
    loadGraphData();
  }, [rootPath, hiddenPaths, storageBackend]);

  // Reload graph when important notes change
  useEffect(() => {
    const handleImportantNotesChange = () => {
      loadGraphData();
    };

    window.addEventListener('importantNotesChanged', handleImportantNotesChange);
    return () => window.removeEventListener('importantNotesChanged', handleImportantNotesChange);
  }, []);

  const loadGraphData = async () => {
    setLoading(true);
    setError(null);

    try {
      let result: MarkdownFilesResult;

      if (isTeamMode && storageBackend) {
        // Team mode: Load files from Google Drive
        const files = await storageBackend.listFiles();

        // Separate folders from files (use fullPath for hierarchical structure)
        // Include Drive IDs for folders
        const folders = files
          .filter(f => f.contentType === 'application/vnd.google-apps.folder')
          .map(f => ({ path: f.fullPath, driveId: f.id }));

        // Filter for markdown files and load their content
        const markdownFiles = files.filter(f => f.name.endsWith('.md'));
        const filesWithContent: Array<{ path: string; content: string; driveId: string }> = await Promise.all(
          markdownFiles.map(async (file) => {
            try {
              const content = await storageBackend.getFile(file.name);
              return {
                path: file.fullPath, // Use fullPath for hierarchical structure
                content: content,
                driveId: file.id // Include Google Drive file ID
              };
            } catch (error) {
              console.error(`Failed to load file ${file.name}:`, error);
              return {
                path: file.fullPath, // Use fullPath for hierarchical structure
                content: '',
                driveId: file.id // Include Google Drive file ID even for failed loads
              };
            }
          })
        );

        result = {
          files: filesWithContent,
          folders: folders
        };
      } else {
        // Local mode: Fetch from Rust backend
        result = await invoke<MarkdownFilesResult>('get_markdown_files', {
          rootPath
        });
      }

      if (result.files.length === 0 && result.folders.length === 0) {
        setGraphData({ nodes: [], links: [] });
        setLoading(false);
        return;
      }

      // Build graph data structure with all folders (including empty ones)
      const dataWithoutFilter = buildGraphFromFiles(result.files, result.folders);
      setTotalNodes(dataWithoutFilter.nodes.filter(n => n.type === 'file').length);

      // Apply hidden paths filter
      const data = buildGraphFromFiles(result.files, result.folders, hiddenPaths);
      setGraphData(data);

      // Build hidden nodes for ghost rendering
      const hiddenNodes = getHiddenNodes(result.files, result.folders, hiddenPaths);
      setHiddenNodesData(hiddenNodes);
    } catch (err) {
      console.error('Failed to load graph data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load graph data');
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = (node: any) => {
    console.log('Node clicked:', node);
    // TODO: Highlight node or show info panel
  };

  const handleNodeDoubleClick = (node: any) => {
    console.log('Node double-clicked:', node);
    // Open file nodes (not folders or root)
    if (node.type === 'file' && onFileOpen) {
      // Extract file name from path
      const fileName = node.path.split(/[\\\/]/).pop() || node.name;
      onFileOpen(node.path, fileName);
    }
  };

  if (loading) {
    return (
      <div className="graph-view">
        <div className="graph-loading">
          <div className="loading-spinner"></div>
          <p>Loading knowledge graph...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="graph-view">
        <div className="graph-error">
          <AlertCircle size={64} strokeWidth={1.5} style={{ color: '#ef4444', marginBottom: '16px' }} />
          <h3>Error Loading Graph</h3>
          <p>{error}</p>
          <button onClick={loadGraphData} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="graph-view">
        <div className="graph-empty">
          <div className="graph-empty-icons">
            <FilePlus size={48} strokeWidth={1.5} style={{ color: '#64c8ca', marginRight: '12px' }} />
            <FolderPlus size={48} strokeWidth={1.5} style={{ color: '#c44fc4' }} />
          </div>
          <h2 className="graph-empty-title">Your Knowledge Graph Awaits</h2>
          {isTeamMode && (
            <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
              Team Mode - Files stored in Google Drive
            </p>
          )}
          <p className="graph-empty-description">
            Start building your knowledge base by creating notes and folders.
            <br />
            Your graph will visualize connections as you add [[wiki-links]] between notes.
          </p>
          <div className="graph-empty-actions">
            <button
              className="graph-empty-button graph-empty-button-note"
              onClick={onCreateNote}
              disabled={!onCreateNote}
            >
              <FilePlus size={20} strokeWidth={2} style={{ marginRight: '8px', flexShrink: 0 }} />
              <span>Create a new note</span>
            </button>
            <button
              className="graph-empty-button graph-empty-button-folder"
              onClick={onCreateFolder}
              disabled={!onCreateFolder}
            >
              <FolderPlus size={20} strokeWidth={2} style={{ marginRight: '8px', flexShrink: 0 }} />
              <span>Create a new folder</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-view">
      <GraphEngine
        data={graphData}
        hiddenNodes={hiddenNodesData}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        isTeamMode={isTeamMode}
      />
      <div className="graph-stats">
        <span className="stat">
          <strong>{graphData.nodes.filter(n => n.type === 'file').length}</strong>
          {getHiddenCount() > 0 ? ` of ${totalNodes}` : ''} files
        </span>
        {getHiddenCount() > 0 && (
          <>
            <span className="stat-divider">•</span>
            <span className="stat hidden-count">
              <strong>{getHiddenCount()}</strong> hidden
            </span>
          </>
        )}
        <span className="stat-divider">•</span>
        <span className="stat">
          <strong>{isTeamMode
            ? graphData.nodes.filter(n => n.type === 'folder').length
            : graphData.nodes.filter(n => n.type === 'folder' || n.type === 'root').length - 1}</strong> folders
        </span>
        <span className="stat-divider">•</span>
        <span className="stat">
          <strong>{graphData.links.filter(l => l.type === 'conceptual').length}</strong> wiki-links
        </span>
        {getHiddenCount() > 0 && (
          <button
            onClick={() => setShowConfirmModal(true)}
            className="show-all-button"
            title={`Show ${getHiddenCount()} hidden items`}
          >
            Show All
          </button>
        )}
        <button onClick={loadGraphData} className="refresh-graph-button" title="Refresh Graph">
          ↻
        </button>
      </div>

      <ConfirmModal
        isOpen={showConfirmModal}
        title="Show All Hidden Items"
        message={`Are you sure you want to unhide ${getHiddenCount()} item${getHiddenCount() !== 1 ? 's' : ''}? This will make them visible in the graph again.`}
        confirmText="Show All"
        cancelText="Cancel"
        onConfirm={() => {
          showAll();
          setShowConfirmModal(false);
        }}
        onCancel={() => setShowConfirmModal(false)}
      />
    </div>
  );
}

export default GraphView;
