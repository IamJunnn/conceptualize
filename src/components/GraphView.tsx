import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import GraphEngine from './GraphEngine';
import { buildGraphFromFiles, GraphData } from '../utils/graphUtils';
import './GraphView.css';

interface GraphViewProps {
  rootPath: string;
}

interface MarkdownFile {
  path: string;
  content: string;
}

interface MarkdownFilesResult {
  files: MarkdownFile[];
  folders: string[];
}

function GraphView({ rootPath }: GraphViewProps) {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGraphData();
  }, [rootPath]);

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
      const data = buildGraphFromFiles(result.files, result.folders);
      setGraphData(data);
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
    // TODO: Open the note in an editor tab
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
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
      />
      <div className="graph-stats">
        <span className="stat">
          <strong>{graphData.nodes.filter(n => n.type === 'file').length}</strong> files
        </span>
        <span className="stat-divider">•</span>
        <span className="stat">
          <strong>{graphData.nodes.filter(n => n.type === 'folder' || n.type === 'root').length}</strong> folders
        </span>
        <span className="stat-divider">•</span>
        <span className="stat">
          <strong>{graphData.links.filter(l => l.type === 'conceptual').length}</strong> wiki-links
        </span>
        <button onClick={loadGraphData} className="refresh-graph-button" title="Refresh Graph">
          ↻
        </button>
      </div>
    </div>
  );
}

export default GraphView;
