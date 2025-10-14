import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import GraphEngine from './GraphEngine';
import ConfirmModal from './ConfirmModal';
import { buildGraphFromFiles, GraphData, GraphNode, getHiddenNodes } from '../utils/graphUtils';
import { useGraphVisibility } from '../contexts/GraphVisibilityContext';
import './GraphView.css';

interface GraphViewProps {
  rootPath: string;
  onFileOpen?: (filePath: string, fileName: string) => void;
  onNodeContextMenu?: (event: React.MouseEvent, node: any) => void;
}

interface MarkdownFile {
  path: string;
  content: string;
}

interface MarkdownFilesResult {
  files: MarkdownFile[];
  folders: string[];
}

function GraphView({ rootPath, onFileOpen, onNodeContextMenu }: GraphViewProps) {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [hiddenNodesData, setHiddenNodesData] = useState<GraphNode[]>([]);
  const [totalNodes, setTotalNodes] = useState(0); // Total before filtering
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const { hiddenPaths, showAll, getHiddenCount } = useGraphVisibility();

  useEffect(() => {
    loadGraphData();
  }, [rootPath, hiddenPaths]);

  const loadGraphData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all markdown files and folders from the Rust backend
      const result = await invoke<MarkdownFilesResult>('get_markdown_files', {
        rootPath
      });

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
          <div className="error-icon">⚠️</div>
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
          <div className="graph-empty-icon">
            <img src="/logo.svg" alt="Logo" />
          </div>
          <h2 className="graph-empty-title">No Notes Yet</h2>
          <p className="graph-empty-description">
            Create some markdown notes with [[wiki-links]] to see your knowledge graph.
            <br /><br />
            <strong>Example:</strong> In a note, type <code>[[Another Note]]</code> to create a link.
          </p>
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
          <strong>{graphData.nodes.filter(n => n.type === 'folder' || n.type === 'root').length - 1}</strong> folders
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
