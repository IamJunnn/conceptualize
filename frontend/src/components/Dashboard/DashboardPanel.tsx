import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as d3 from 'd3';
import { formatBytes } from '../../services/billingTypes';
import {
  X,
  FileText,
  Folder,
  HardDrive,
  Link2,
  AlertCircle,
  FileX,
  TrendingUp,
  Network,
  Lightbulb,
  RefreshCw,
  Shuffle,
  ChevronLeft,
  ArrowRight
} from 'lucide-react';
import { extractWikiLinks } from '../../utils/graphUtils';
import './DashboardPanel.css';

interface FileInfo {
  name: string;
  path: string;
  size: number;
  folder: string;
}

interface FolderInfo {
  name: string;
  path: string;
  noteCount: number;
  children: string[];
}

interface LinkInfo {
  from: string;
  fromPath: string;
  to: string;
  toPath: string;
}

interface WorkspaceStats {
  totalNotes: number;
  totalFolders: number;
  totalLinks: number;
  storageUsed: string;
  storageBytes: number;
  mostLinkedNotes: { name: string; path: string; linkCount: number }[];
  orphanNotes: { name: string; path: string }[];
  brokenLinks: { from: string; to: string; link: string }[];
  // Detailed data for interactive views
  allFiles: FileInfo[];
  allFolders: FolderInfo[];
  allLinks: LinkInfo[];
  notesByFolder: Record<string, FileInfo[]>;
}

type DetailView = 'notes' | 'folders' | 'links' | 'storage' | null;

interface DashboardPanelProps {
  onClose?: () => void;
  rootPath: string;
  onSelectFile?: (path: string, name: string) => void;
  isTabMode?: boolean;
}

const DashboardPanel: React.FC<DashboardPanelProps> = ({
  onClose,
  rootPath,
  onSelectFile,
  isTabMode = false
}) => {
  const [workspaceStats, setWorkspaceStats] = useState<WorkspaceStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [randomNote, setRandomNote] = useState<{ name: string; path: string } | null>(null);
  const [allNotes, setAllNotes] = useState<{ name: string; path: string }[]>([]);
  const [activeDetailView, setActiveDetailView] = useState<DetailView>(null);
  const storagePieRef = useRef<SVGSVGElement>(null);

  // Calculate workspace statistics
  const calculateWorkspaceStats = async (folderPath: string): Promise<WorkspaceStats> => {
    try {
      // Get all files (returns path and content for markdown files)
      const result = await invoke<{ files: Array<{ path: string; content: string }> }>('get_markdown_files', { rootPath: folderPath });

      // Filter for markdown files and extract name from path
      const files = (result?.files || [])
        .filter(f => f && f.path && f.path.toLowerCase().endsWith('.md'))
        .map(f => ({
          ...f,
          name: f.path.split(/[/\\]/).pop() || ''
        }));

      // Store all notes for random selection
      setAllNotes(files.map(f => ({ name: f.name.replace(/\.md$/i, ''), path: f.path })));

      // Get file tree for folder count
      const fileTree = await invoke<Array<{ type: string; children?: any[] }>>('get_file_tree', { rootPath: folderPath });

      // Count folders and collect folder info recursively
      const allFoldersInfo: FolderInfo[] = [];
      const countFolders = (nodes: Array<{ type: string; name?: string; path?: string; children?: any[] }>, parentPath: string = ''): number => {
        let count = 0;
        for (const node of nodes) {
          if (node.type === 'folder') {
            count++;
            const folderPath = node.path || parentPath + '/' + (node.name || '');
            const childNames = (node.children || [])
              .filter((c: any) => c.type === 'file' && c.name?.toLowerCase().endsWith('.md'))
              .map((c: any) => c.name);
            allFoldersInfo.push({
              name: node.name || folderPath.split(/[/\\]/).pop() || '',
              path: folderPath,
              noteCount: childNames.length,
              children: childNames
            });
            if (node.children) {
              count += countFolders(node.children, folderPath);
            }
          }
        }
        return count;
      };

      const totalFolders = countFolders(fileTree);

      // Calculate storage and analyze links
      let totalBytes = 0;
      let totalLinks = 0;
      const linkCounts: Record<string, number> = {};
      const allNoteNames = new Set<string>();
      const notesWithLinks = new Set<string>();
      const brokenLinks: { from: string; to: string; link: string }[] = [];
      const allLinksInfo: LinkInfo[] = [];
      const allFilesInfo: FileInfo[] = [];
      const notesByFolder: Record<string, FileInfo[]> = {};

      // Build set of all note names (without .md extension)
      files.forEach(file => {
        if (file.name) {
          const noteName = file.name.replace(/\.md$/i, '').toLowerCase();
          allNoteNames.add(noteName);
        }
      });

      // Analyze each markdown file for wiki-links and build file info
      for (const file of files) {
        if (!file.path || !file.name) continue;

        const content = file.content || '';
        const fileSize = content ? new Blob([content]).size : 0;
        const folderPath = file.path.substring(0, file.path.lastIndexOf(/[/\\]/.test(file.path) ? (file.path.includes('\\') ? '\\' : '/') : '/'));
        const folderName = folderPath.split(/[/\\]/).pop() || 'Root';

        // Build file info
        const fileInfo: FileInfo = {
          name: file.name.replace(/\.md$/i, ''),
          path: file.path,
          size: fileSize,
          folder: folderName
        };
        allFilesInfo.push(fileInfo);

        // Group by folder
        if (!notesByFolder[folderName]) {
          notesByFolder[folderName] = [];
        }
        notesByFolder[folderName].push(fileInfo);

        if (content) {
          // Extract wiki-links using the same function as the graph
          const wikiLinks = extractWikiLinks(content);

          for (const linkText of wikiLinks) {
            const linkedNote = linkText.toLowerCase().split('|')[0].trim();
            notesWithLinks.add(file.name.replace(/\.md$/i, '').toLowerCase());

            // Count incoming links
            linkCounts[linkedNote] = (linkCounts[linkedNote] || 0) + 1;

            // Only count resolved links (links to existing notes) - matches Graph behavior
            if (allNoteNames.has(linkedNote)) {
              totalLinks++;
              // Find target file for link info
              const targetFile = files.find(f => f.name.replace(/\.md$/i, '').toLowerCase() === linkedNote);
              allLinksInfo.push({
                from: file.name.replace(/\.md$/i, ''),
                fromPath: file.path,
                to: targetFile?.name.replace(/\.md$/i, '') || linkedNote,
                toPath: targetFile?.path || ''
              });
            } else {
              // Track broken links separately
              brokenLinks.push({
                from: file.name,
                to: linkedNote,
                link: linkText
              });
            }
          }
        }
      }

      // Calculate total storage from ALL files (not just markdown)
      const allFiles = result?.files || [];
      for (const file of allFiles) {
        if (file.content) {
          totalBytes += new Blob([file.content]).size;
        } else if (file.path) {
          // For non-markdown files, get file size from backend
          try {
            const fileSize = await invoke<number>('get_file_size', { filePath: file.path });
            totalBytes += fileSize;
          } catch {
            // Skip files we can't get size for
          }
        }
      }

      // Find most linked notes
      const mostLinkedNotes = Object.entries(linkCounts)
        .filter(([name]) => allNoteNames.has(name))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => {
          const file = files.find(f => f.name.replace(/\.md$/i, '').toLowerCase() === name);
          return {
            name: file?.name.replace(/\.md$/i, '') || name,
            path: file?.path || '',
            linkCount: count
          };
        });

      // Find orphan notes (no incoming or outgoing links)
      const notesWithIncoming = new Set(Object.keys(linkCounts).filter(name => allNoteNames.has(name)));
      const orphanNotes = files
        .filter(file => {
          const noteName = file.name.replace(/\.md$/i, '').toLowerCase();
          return !notesWithIncoming.has(noteName) && !notesWithLinks.has(noteName);
        })
        .slice(0, 5)
        .map(file => ({
          name: file.name.replace(/\.md$/i, ''),
          path: file.path
        }));

      return {
        totalNotes: files.length,
        totalFolders,
        totalLinks,
        storageUsed: formatBytes(totalBytes),
        storageBytes: totalBytes,
        mostLinkedNotes,
        orphanNotes,
        brokenLinks: brokenLinks.slice(0, 5),
        allFiles: allFilesInfo,
        allFolders: allFoldersInfo,
        allLinks: allLinksInfo,
        notesByFolder
      };
    } catch (error) {
      console.error('[Dashboard] Error calculating workspace stats:', error);
      console.error('[Dashboard] Error details:', JSON.stringify(error, null, 2));
      return {
        totalNotes: 0,
        totalFolders: 0,
        totalLinks: 0,
        storageUsed: '0 B',
        storageBytes: 0,
        mostLinkedNotes: [],
        orphanNotes: [],
        brokenLinks: [],
        allFiles: [],
        allFolders: [],
        allLinks: [],
        notesByFolder: {}
      };
    }
  };

  const loadStats = async () => {
    setIsLoadingStats(true);
    const stats = await calculateWorkspaceStats(rootPath);
    setWorkspaceStats(stats);
    setIsLoadingStats(false);
  };

  useEffect(() => {
    loadStats();
  }, [rootPath]);

  const handleRefresh = () => {
    loadStats();
  };

  const handleRandomNote = () => {
    if (allNotes.length > 0) {
      const randomIndex = Math.floor(Math.random() * allNotes.length);
      const note = allNotes[randomIndex];
      setRandomNote(note);
    }
  };

  const handleNoteClick = (path: string, name: string) => {
    if (onSelectFile) {
      onSelectFile(path, name + '.md');
      if (onClose && !isTabMode) {
        onClose();
      }
    }
  };

  // Get workspace name from folder path
  const workspaceName = rootPath ? rootPath.split(/[/\\]/).pop() || 'Workspace' : 'Workspace';

  // D3 pie chart for storage visualization
  useEffect(() => {
    if (activeDetailView === 'storage' && storagePieRef.current && workspaceStats) {
      const svg = d3.select(storagePieRef.current);
      svg.selectAll('*').remove();

      const width = 300;
      const height = 300;
      const radius = Math.min(width, height) / 2 - 20;

      // Prepare data - group by folder
      const folderSizes: Record<string, number> = {};
      workspaceStats.allFiles.forEach(file => {
        const folder = file.folder || 'Root';
        folderSizes[folder] = (folderSizes[folder] || 0) + file.size;
      });

      const data = Object.entries(folderSizes)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8); // Top 8 folders

      if (data.length === 0) return;

      const color = d3.scaleOrdinal<string>()
        .domain(data.map(d => d.name))
        .range(['#64c8ca', '#c44fc4', '#4a90d9', '#d9a04a', '#7dd94a', '#d94a6d', '#9b4ad9', '#4ad9b8']);

      const pie = d3.pie<{ name: string; value: number }>()
        .value(d => d.value)
        .sort(null);

      const arc = d3.arc<d3.PieArcDatum<{ name: string; value: number }>>()
        .innerRadius(radius * 0.5)
        .outerRadius(radius);

      const g = svg
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${width / 2}, ${height / 2})`);

      const arcs = g.selectAll('.arc')
        .data(pie(data))
        .enter()
        .append('g')
        .attr('class', 'arc');

      arcs.append('path')
        .attr('d', arc)
        .attr('fill', d => color(d.data.name))
        .attr('stroke', '#1e1e1e')
        .attr('stroke-width', 2)
        .style('opacity', 0.9)
        .on('mouseover', function() {
          d3.select(this).style('opacity', 1).attr('stroke-width', 3);
        })
        .on('mouseout', function() {
          d3.select(this).style('opacity', 0.9).attr('stroke-width', 2);
        });

      // Center text showing total
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.2em')
        .attr('fill', '#e0e0e0')
        .attr('font-size', '24px')
        .attr('font-weight', '600')
        .text(workspaceStats.storageUsed);

      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1.2em')
        .attr('fill', '#888')
        .attr('font-size', '12px')
        .text('Total Storage');
    }
  }, [activeDetailView, workspaceStats]);

  // Navigation tabs for detail views
  const detailTabs: { key: DetailView; label: string; icon: React.ReactNode }[] = [
    { key: 'notes', label: 'Notes', icon: <FileText size={16} /> },
    { key: 'folders', label: 'Folders', icon: <Folder size={16} /> },
    { key: 'links', label: 'Links', icon: <Link2 size={16} /> },
    { key: 'storage', label: 'Storage', icon: <HardDrive size={16} /> },
  ];

  // Render the tab navigation header
  const renderDetailHeader = () => {
    const handleBack = () => setActiveDetailView(null);

    return (
      <div className="detail-header">
        <button className="detail-back-btn" onClick={handleBack}>
          <ChevronLeft size={20} />
          Back
        </button>
        <div className="detail-tabs">
          {detailTabs.map(tab => (
            <button
              key={tab.key}
              className={`detail-tab ${activeDetailView === tab.key ? 'active' : ''}`}
              onClick={() => setActiveDetailView(tab.key)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Render detail view content based on activeDetailView
  const renderDetailContent = () => {
    if (!workspaceStats) return null;

    switch (activeDetailView) {
      case 'notes':
        return (
          <>
            <div className="detail-summary">
              <div className="summary-stat">
                <span className="summary-value">{workspaceStats.totalNotes}</span>
                <span className="summary-label">Total notes</span>
              </div>
              <div className="summary-stat">
                <span className="summary-value">{Object.keys(workspaceStats.notesByFolder).length}</span>
                <span className="summary-label">Folders with notes</span>
              </div>
              <div className="summary-stat">
                <span className="summary-value">
                  {workspaceStats.totalNotes > 0
                    ? (workspaceStats.totalNotes / Math.max(Object.keys(workspaceStats.notesByFolder).length, 1)).toFixed(1)
                    : 0}
                </span>
                <span className="summary-label">Avg per folder</span>
              </div>
            </div>
            <h4 className="detail-section-title">Notes by folder</h4>
            <div className="folder-distribution">
              {Object.entries(workspaceStats.notesByFolder)
                .sort((a, b) => b[1].length - a[1].length)
                .map(([folder, notes]) => (
                  <div key={folder} className="folder-item">
                    <div className="folder-header">
                      <Folder size={16} className="folder-icon" />
                      <span className="folder-name">{folder}</span>
                      <span className="folder-count">{notes.length} notes</span>
                    </div>
                    <div className="folder-bar">
                      <div
                        className="folder-bar-fill"
                        style={{
                          width: `${(notes.length / workspaceStats.totalNotes) * 100}%`
                        }}
                      />
                    </div>
                    <div className="folder-notes">
                      {notes.slice(0, 5).map(note => (
                        <div
                          key={note.path}
                          className="folder-note-item"
                          onClick={() => handleNoteClick(note.path, note.name)}
                        >
                          <FileText size={12} />
                          <span>{note.name}</span>
                          <span className="note-size">{formatBytes(note.size)}</span>
                        </div>
                      ))}
                      {notes.length > 5 && (
                        <div className="folder-note-more">+{notes.length - 5} more</div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </>
        );

      case 'folders':
        return (
          <>
            <div className="detail-summary">
              <div className="summary-stat">
                <span className="summary-value">{workspaceStats.totalFolders}</span>
                <span className="summary-label">Total folders</span>
              </div>
              <div className="summary-stat">
                <span className="summary-value">
                  {workspaceStats.allFolders.filter(f => f.noteCount > 0).length}
                </span>
                <span className="summary-label">With notes</span>
              </div>
              <div className="summary-stat">
                <span className="summary-value">
                  {workspaceStats.allFolders.filter(f => f.noteCount === 0).length}
                </span>
                <span className="summary-label">Empty</span>
              </div>
            </div>
            <h4 className="detail-section-title">All folders</h4>
            <div className="folders-list">
              {workspaceStats.allFolders
                .sort((a, b) => b.noteCount - a.noteCount)
                .map((folder, idx) => (
                  <div key={idx} className="folder-list-item">
                    <Folder size={18} className="folder-icon" />
                    <span className="folder-name">{folder.name}</span>
                    <span className={`folder-badge ${folder.noteCount === 0 ? 'empty' : ''}`}>
                      {folder.noteCount} {folder.noteCount === 1 ? 'note' : 'notes'}
                    </span>
                  </div>
                ))}
            </div>
          </>
        );

      case 'links':
        return (
          <>
            <div className="detail-summary">
              <div className="summary-stat">
                <span className="summary-value">{workspaceStats.totalLinks}</span>
                <span className="summary-label">Total links</span>
              </div>
              <div className="summary-stat">
                <span className="summary-value">{workspaceStats.brokenLinks.length}</span>
                <span className="summary-label">Broken</span>
              </div>
              <div className="summary-stat">
                <span className="summary-value">
                  {workspaceStats.totalNotes > 0
                    ? (workspaceStats.totalLinks / workspaceStats.totalNotes).toFixed(1)
                    : 0}
                </span>
                <span className="summary-label">Avg per note</span>
              </div>
            </div>
            <h4 className="detail-section-title">All connections ({workspaceStats.allLinks.length})</h4>
            <div className="links-list">
              {workspaceStats.allLinks.slice(0, 50).map((link, idx) => (
                <div key={idx} className="link-item">
                  <span
                    className="link-from clickable"
                    onClick={() => handleNoteClick(link.fromPath, link.from)}
                  >
                    {link.from}
                  </span>
                  <ArrowRight size={14} className="link-arrow" />
                  <span
                    className="link-to clickable"
                    onClick={() => link.toPath && handleNoteClick(link.toPath, link.to)}
                  >
                    {link.to}
                  </span>
                </div>
              ))}
              {workspaceStats.allLinks.length > 50 && (
                <div className="links-more">
                  +{workspaceStats.allLinks.length - 50} more connections
                </div>
              )}
            </div>
          </>
        );

      case 'storage':
        // Group files by folder for pie chart legend
        const folderSizes: Record<string, number> = {};
        workspaceStats.allFiles.forEach(file => {
          const folder = file.folder || 'Root';
          folderSizes[folder] = (folderSizes[folder] || 0) + file.size;
        });
        const sortedFolders = Object.entries(folderSizes)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8);

        const colors = ['#64c8ca', '#c44fc4', '#4a90d9', '#d9a04a', '#7dd94a', '#d94a6d', '#9b4ad9', '#4ad9b8'];

        return (
          <>
            <div className="detail-summary">
              <div className="summary-stat">
                <span className="summary-value">{workspaceStats.storageUsed}</span>
                <span className="summary-label">Total storage</span>
              </div>
              <div className="summary-stat">
                <span className="summary-value">{workspaceStats.allFiles.length}</span>
                <span className="summary-label">Files</span>
              </div>
              <div className="summary-stat">
                <span className="summary-value">
                  {workspaceStats.allFiles.length > 0
                    ? formatBytes(workspaceStats.storageBytes / workspaceStats.allFiles.length)
                    : '0 B'}
                </span>
                <span className="summary-label">Avg size</span>
              </div>
            </div>
            <div className="storage-chart-container">
              <svg ref={storagePieRef} className="storage-pie-chart" />
              <div className="storage-legend">
                {sortedFolders.map(([folder, size], idx) => (
                  <div key={folder} className="legend-item">
                    <div
                      className="legend-color"
                      style={{ backgroundColor: colors[idx % colors.length] }}
                    />
                    <span className="legend-name">{folder}</span>
                    <span className="legend-size">{formatBytes(size)}</span>
                  </div>
                ))}
              </div>
            </div>
            <h4 className="detail-section-title">Largest files</h4>
            <div className="files-list">
              {workspaceStats.allFiles
                .sort((a, b) => b.size - a.size)
                .slice(0, 10)
                .map((file, idx) => (
                  <div
                    key={idx}
                    className="file-item"
                    onClick={() => handleNoteClick(file.path, file.name)}
                  >
                    <FileText size={16} className="file-icon" />
                    <span className="file-name">{file.name}</span>
                    <span className="file-folder">{file.folder}</span>
                    <span className="file-size">{formatBytes(file.size)}</span>
                  </div>
                ))}
            </div>
          </>
        );

      default:
        return null;
    }
  };

  // Render the complete detail view with header and content
  const renderDetailView = () => {
    if (!activeDetailView || !workspaceStats) return null;

    return (
      <div className="detail-view">
        {renderDetailHeader()}
        <div className="detail-content">
          {renderDetailContent()}
        </div>
      </div>
    );
  };

  const dashboardContent = (
    <>
      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-title-section">
          <Network size={24} className="dashboard-icon" />
          <div>
            <h2>Dashboard</h2>
            <span className="dashboard-subtitle">{workspaceName}</span>
          </div>
        </div>
        <div className="dashboard-header-actions">
          <button className="dashboard-action-btn" onClick={handleRefresh} title="Refresh Stats">
            <RefreshCw size={18} className={isLoadingStats ? 'spinning' : ''} />
          </button>
          {!isTabMode && onClose && (
            <button className="close-button" onClick={onClose} aria-label="Close">
              <X size={24} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="dashboard-content">
          {/* Stats Overview */}
          <section className="dashboard-section">
            <h3>
              <TrendingUp size={18} />
              Workspace Overview
            </h3>
            <div className="stats-grid-dashboard">
              <button
                className="stat-card-dashboard clickable"
                onClick={() => setActiveDetailView('notes')}
                disabled={isLoadingStats}
              >
                <FileText size={24} className="stat-icon" />
                <div className="stat-value">{isLoadingStats ? '...' : workspaceStats?.totalNotes || 0}</div>
                <div className="stat-label">Notes</div>
                <ArrowRight size={14} className="stat-arrow" />
              </button>
              <button
                className="stat-card-dashboard clickable"
                onClick={() => setActiveDetailView('folders')}
                disabled={isLoadingStats}
              >
                <Folder size={24} className="stat-icon" />
                <div className="stat-value">{isLoadingStats ? '...' : workspaceStats?.totalFolders || 0}</div>
                <div className="stat-label">Folders</div>
                <ArrowRight size={14} className="stat-arrow" />
              </button>
              <button
                className="stat-card-dashboard clickable"
                onClick={() => setActiveDetailView('links')}
                disabled={isLoadingStats}
              >
                <Link2 size={24} className="stat-icon" />
                <div className="stat-value">{isLoadingStats ? '...' : workspaceStats?.totalLinks || 0}</div>
                <div className="stat-label">Links</div>
                <ArrowRight size={14} className="stat-arrow" />
              </button>
              <button
                className="stat-card-dashboard clickable"
                onClick={() => setActiveDetailView('storage')}
                disabled={isLoadingStats}
              >
                <HardDrive size={24} className="stat-icon" />
                <div className="stat-value">{isLoadingStats ? '...' : workspaceStats?.storageUsed || '0 B'}</div>
                <div className="stat-label">Storage</div>
                <ArrowRight size={14} className="stat-arrow" />
              </button>
            </div>
          </section>

          {/* Quick Discovery */}
          <section className="dashboard-section">
            <h3>
              <Lightbulb size={18} />
              Quick Discovery
            </h3>
            <div className="discovery-card">
              <button className="discovery-btn" onClick={handleRandomNote}>
                <Shuffle size={18} />
                Discover Random Note
              </button>
              {randomNote && (
                <div
                  className="random-note-result"
                  onClick={() => handleNoteClick(randomNote.path, randomNote.name)}
                >
                  <FileText size={16} />
                  <span>{randomNote.name}</span>
                </div>
              )}
            </div>
          </section>

          {/* Knowledge Hub */}
          {!isLoadingStats && workspaceStats && workspaceStats.mostLinkedNotes.length > 0 && (
            <section className="dashboard-section">
              <h3>
                <Network size={18} />
                Knowledge Hubs
                <span className="section-badge">Most Connected</span>
              </h3>
              <div className="insight-list-dashboard">
                {workspaceStats.mostLinkedNotes.map((note, i) => (
                  <div
                    key={i}
                    className="insight-item-dashboard clickable"
                    onClick={() => handleNoteClick(note.path, note.name)}
                  >
                    <div className="insight-rank">{i + 1}</div>
                    <span className="insight-item-name">{note.name}</span>
                    <span className="insight-item-badge">{note.linkCount} incoming</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Orphan Notes */}
          {!isLoadingStats && workspaceStats && workspaceStats.orphanNotes.length > 0 && (
            <section className="dashboard-section">
              <h3 className="warning">
                <FileX size={18} />
                Orphan notes
                <span className="section-badge warning">No connections</span>
              </h3>
              <p className="section-description">
                These notes have no incoming or outgoing links. Consider connecting them to your knowledge network.
              </p>
              <div className="insight-list-dashboard">
                {workspaceStats.orphanNotes.map((note, i) => (
                  <div
                    key={i}
                    className="insight-item-dashboard clickable orphan"
                    onClick={() => handleNoteClick(note.path, note.name)}
                  >
                    <FileX size={16} className="orphan-icon" />
                    <span className="insight-item-name">{note.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Broken Links */}
          {!isLoadingStats && workspaceStats && workspaceStats.brokenLinks.length > 0 && (
            <section className="dashboard-section">
              <h3 className="error">
                <AlertCircle size={18} />
                Broken links
                <span className="section-badge error">{workspaceStats.brokenLinks.length} found</span>
              </h3>
              <p className="section-description">
                These links point to notes that don't exist. Create them or fix the references.
              </p>
              <div className="insight-list-dashboard">
                {workspaceStats.brokenLinks.map((link, i) => (
                  <div key={i} className="insight-item-dashboard broken-link">
                    <span className="from-note">{link.from.replace(/\.md$/i, '')}</span>
                    <span className="link-arrow">→</span>
                    <span className="to-note">[[{link.link}]]</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty State */}
          {!isLoadingStats && workspaceStats &&
           workspaceStats.mostLinkedNotes.length === 0 &&
           workspaceStats.orphanNotes.length === 0 &&
           workspaceStats.brokenLinks.length === 0 && (
            <section className="dashboard-section">
              <div className="empty-state">
                <Lightbulb size={48} className="empty-icon" />
                <h4>Start Building Your Knowledge Network</h4>
                <p>Create notes and connect them with [[wiki-links]] to see insights here.</p>
              </div>
            </section>
          )}
        </div>
    </>
  );

  // In tab mode, render directly without overlay
  if (isTabMode) {
    return (
      <div className="dashboard-panel dashboard-tab-mode">
        {activeDetailView ? renderDetailView() : dashboardContent}
      </div>
    );
  }

  // In popup mode, render with overlay
  return (
    <div className="dashboard-overlay" onClick={onClose}>
      <div className="dashboard-panel" onClick={(e) => e.stopPropagation()}>
        {activeDetailView ? renderDetailView() : dashboardContent}
      </div>
    </div>
  );
};

export default DashboardPanel;
