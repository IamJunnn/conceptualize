import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import {
  FileText,
  Folder,
  HardDrive,
  Link2,
  Users,
  UserPlus,
  TrendingUp,
  Network,
  Lightbulb,
  RefreshCw,
  Shuffle,
  ChevronLeft,
  ArrowRight,
  Crown,
  Shield,
  User as UserIcon,
  Clock,
  Mail
} from 'lucide-react';
import { extractWikiLinks } from '../../utils/graphUtils';
import { Team, TeamMember } from '../../services/teamService';
import { TeamDriveStorage } from '../../services/teamDriveStorage';
import { StorageUsage } from '../../services/billingTypes';
import './DashboardPanel.css';
import './TeamDashboardPanel.css';

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

interface TeamWorkspaceStats {
  totalNotes: number;
  totalFolders: number;
  totalLinks: number;
  storageUsed: string;
  storageBytes: number;
  mostLinkedNotes: { name: string; path: string; linkCount: number }[];
  orphanNotes: { name: string; path: string }[];
  brokenLinks: { from: string; to: string; link: string }[];
  allFiles: FileInfo[];
  allFolders: FolderInfo[];
  allLinks: LinkInfo[];
  notesByFolder: Record<string, FileInfo[]>;
}

type DetailView = 'notes' | 'folders' | 'links' | 'storage' | 'members' | null;

interface TeamDashboardPanelProps {
  onClose?: () => void;
  team: Team;
  storageBackend: TeamDriveStorage;
  storageUsage?: StorageUsage | null;
  onSelectFile?: (path: string, name: string) => void;
  onInviteMember?: () => void;
  onManageTeam?: () => void;
  isTabMode?: boolean;
}

const TeamDashboardPanel: React.FC<TeamDashboardPanelProps> = ({
  onClose,
  team,
  storageBackend,
  storageUsage,
  onSelectFile,
  onInviteMember,
  onManageTeam,
  isTabMode = false
}) => {
  const [workspaceStats, setWorkspaceStats] = useState<TeamWorkspaceStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [randomNote, setRandomNote] = useState<{ name: string; path: string } | null>(null);
  const [allNotes, setAllNotes] = useState<{ name: string; path: string }[]>([]);
  const [activeDetailView, setActiveDetailView] = useState<DetailView>(null);
  const storagePieRef = useRef<SVGSVGElement>(null);

  // Format bytes to human readable
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Format date to relative time
  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} years ago`;
  };

  // Get role icon
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown size={14} className="role-icon owner" />;
      case 'admin': return <Shield size={14} className="role-icon admin" />;
      case 'leader': return <Shield size={14} className="role-icon leader" />;
      default: return <UserIcon size={14} className="role-icon member" />;
    }
  };

  // Get members array from team
  const getTeamMembers = (): (TeamMember & { email: string })[] => {
    return Object.entries(team.members).map(([email, member]) => ({
      ...member,
      email: email.toLowerCase()
    }));
  };

  // Calculate workspace stats from team storage
  const calculateWorkspaceStats = async (): Promise<TeamWorkspaceStats> => {
    try {
      console.log('[TeamDashboard] Calculating workspace stats...');

      // Get all files from team storage
      const files = await storageBackend.listFiles();
      const mdFiles = files.filter((f: any) =>
        f.name?.toLowerCase().endsWith('.md') &&
        !f.contentType?.includes('folder')
      );

      // Store all notes for random selection
      setAllNotes(mdFiles.map((f: any) => ({
        name: f.name.replace(/\.md$/i, ''),
        path: f.fullPath || f.name
      })));

      // Get file tree for folder count
      const fileTree = await storageBackend.getFileTree();

      // Count folders and collect folder info
      const allFoldersInfo: FolderInfo[] = [];
      const countFolders = (nodes: any[], parentPath: string = ''): number => {
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

      // Build set of all note names
      mdFiles.forEach((file: any) => {
        if (file.name) {
          const noteName = file.name.replace(/\.md$/i, '').toLowerCase();
          allNoteNames.add(noteName);
        }
      });

      // Analyze each markdown file
      for (const file of mdFiles) {
        if (!file.name) continue;

        // Normalize path separators for cross-platform compatibility
        const filePath = (file.fullPath || file.name).replace(/\\/g, '/');
        const fileSize = file.size || 0;
        totalBytes += fileSize;

        // Extract folder name from path
        const pathParts = filePath.split(/[/\\]/);
        const folderName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Root';

        // Build file info
        const fileInfo: FileInfo = {
          name: file.name.replace(/\.md$/i, ''),
          path: filePath,
          size: fileSize,
          folder: folderName
        };
        allFilesInfo.push(fileInfo);

        // Group by folder
        if (!notesByFolder[folderName]) {
          notesByFolder[folderName] = [];
        }
        notesByFolder[folderName].push(fileInfo);

        // Try to get content for link analysis
        try {
          const content = await storageBackend.getFile(filePath);
          if (content) {
            const wikiLinks = extractWikiLinks(content);

            for (const linkText of wikiLinks) {
              const linkedNote = linkText.toLowerCase().split('|')[0].trim();
              notesWithLinks.add(file.name.replace(/\.md$/i, '').toLowerCase());

              linkCounts[linkedNote] = (linkCounts[linkedNote] || 0) + 1;

              if (allNoteNames.has(linkedNote)) {
                totalLinks++;
                const targetFile = mdFiles.find((f: any) =>
                  f.name.replace(/\.md$/i, '').toLowerCase() === linkedNote
                );
                allLinksInfo.push({
                  from: file.name.replace(/\.md$/i, ''),
                  fromPath: filePath,
                  to: targetFile?.name.replace(/\.md$/i, '') || linkedNote,
                  toPath: targetFile?.fullPath || targetFile?.name || ''
                });
              } else {
                brokenLinks.push({
                  from: file.name,
                  to: linkedNote,
                  link: linkText
                });
              }
            }
          }
        } catch (e) {
          // Skip files that can't be read
        }
      }

      // Find most linked notes
      const mostLinkedNotes = Object.entries(linkCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => {
          const file = mdFiles.find((f: any) =>
            f.name.replace(/\.md$/i, '').toLowerCase() === name.toLowerCase()
          );
          return {
            name,
            path: file?.fullPath || file?.name || name,
            linkCount: count
          };
        });

      // Find orphan notes
      const orphanNotes = mdFiles
        .filter((f: any) => {
          const noteName = f.name.replace(/\.md$/i, '').toLowerCase();
          return !linkCounts[noteName] && !notesWithLinks.has(noteName);
        })
        .slice(0, 5)
        .map((f: any) => ({
          name: f.name.replace(/\.md$/i, ''),
          path: f.fullPath || f.name
        }));

      return {
        totalNotes: mdFiles.length,
        totalFolders,
        totalLinks,
        storageUsed: storageUsage?.usedFormatted || formatBytes(totalBytes),
        storageBytes: storageUsage?.usedBytes || totalBytes,
        mostLinkedNotes,
        orphanNotes,
        brokenLinks: brokenLinks.slice(0, 5),
        allFiles: allFilesInfo,
        allFolders: allFoldersInfo,
        allLinks: allLinksInfo,
        notesByFolder
      };
    } catch (error) {
      console.error('[TeamDashboard] Error calculating workspace stats:', error);
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
    console.log('[TeamDashboard] loadStats called for team:', team.name);
    setIsLoadingStats(true);
    const stats = await calculateWorkspaceStats();
    setWorkspaceStats(stats);
    setIsLoadingStats(false);
    console.log('[TeamDashboard] Stats loaded:', stats);
  };

  useEffect(() => {
    loadStats();
  }, [team.id]);

  const handleNoteClick = (path: string, name: string) => {
    if (onSelectFile) {
      onSelectFile(path, name);
      if (onClose && !isTabMode) {
        onClose();
      }
    }
  };

  const handleRandomNote = () => {
    if (allNotes.length > 0) {
      const randomIndex = Math.floor(Math.random() * allNotes.length);
      setRandomNote(allNotes[randomIndex]);
    }
  };

  // D3 pie chart for storage visualization
  useEffect(() => {
    if (activeDetailView === 'storage' && storagePieRef.current && workspaceStats) {
      const svg = d3.select(storagePieRef.current);
      svg.selectAll('*').remove();

      const width = 300;
      const height = 300;
      const radius = Math.min(width, height) / 2 - 20;

      const folderSizes: Record<string, number> = {};
      workspaceStats.allFiles.forEach(file => {
        const folder = file.folder || 'Root';
        folderSizes[folder] = (folderSizes[folder] || 0) + file.size;
      });

      const data = Object.entries(folderSizes)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);

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
    { key: 'members', label: 'Members', icon: <Users size={16} /> },
  ];

  const renderDetailHeader = () => {
    return (
      <div className="detail-header">
        <button className="detail-back-btn" onClick={() => setActiveDetailView(null)}>
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

  const renderDetailContent = () => {
    if (!workspaceStats) return null;

    switch (activeDetailView) {
      case 'notes':
        return (
          <>
            <div className="detail-summary">
              <div className="summary-stat">
                <span className="summary-value">{workspaceStats.totalNotes}</span>
                <span className="summary-label">Total Notes</span>
              </div>
              <div className="summary-stat">
                <span className="summary-value">{Object.keys(workspaceStats.notesByFolder).length}</span>
                <span className="summary-label">Folders with Notes</span>
              </div>
              <div className="summary-stat">
                <span className="summary-value">
                  {workspaceStats.totalNotes > 0
                    ? (workspaceStats.totalNotes / Math.max(Object.keys(workspaceStats.notesByFolder).length, 1)).toFixed(1)
                    : 0}
                </span>
                <span className="summary-label">Avg per Folder</span>
              </div>
            </div>
            <h4 className="detail-section-title">Notes by Folder</h4>
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
                <span className="summary-label">Total Folders</span>
              </div>
              <div className="summary-stat">
                <span className="summary-value">
                  {workspaceStats.allFolders.filter(f => f.noteCount > 0).length}
                </span>
                <span className="summary-label">With Notes</span>
              </div>
              <div className="summary-stat">
                <span className="summary-value">
                  {workspaceStats.allFolders.filter(f => f.noteCount === 0).length}
                </span>
                <span className="summary-label">Empty</span>
              </div>
            </div>
            <h4 className="detail-section-title">All Folders</h4>
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
                <span className="summary-label">Total Links</span>
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
                <span className="summary-label">Avg per Note</span>
              </div>
            </div>
            <h4 className="detail-section-title">All Connections ({workspaceStats.allLinks.length})</h4>
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
                <span className="summary-label">Total Storage</span>
              </div>
              <div className="summary-stat">
                <span className="summary-value">{workspaceStats.allFiles.length}</span>
                <span className="summary-label">Files</span>
              </div>
              <div className="summary-stat">
                <span className="summary-value">
                  {storageUsage ? `${storageUsage.percentUsed.toFixed(0)}%` : '—'}
                </span>
                <span className="summary-label">Quota Used</span>
              </div>
            </div>
            {storageUsage && (
              <div className="storage-quota-bar">
                <div className="storage-quota-label">
                  <span>{storageUsage.usedFormatted} of {storageUsage.limitFormatted}</span>
                  <span className={`storage-status ${storageUsage.status}`}>
                    {storageUsage.status === 'ok' ? 'Healthy' :
                     storageUsage.status === 'warning' ? 'Near Limit' : 'Exceeded'}
                  </span>
                </div>
                <div className="storage-quota-track">
                  <div
                    className={`storage-quota-fill ${storageUsage.status}`}
                    style={{ width: `${Math.min(storageUsage.percentUsed, 100)}%` }}
                  />
                </div>
              </div>
            )}
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
            <h4 className="detail-section-title">Largest Files</h4>
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

      case 'members':
        const members = getTeamMembers();
        const roleOrder = ['owner', 'admin', 'leader', 'member'];
        const sortedMembers = members.sort((a, b) =>
          roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role)
        );

        const roleCount = members.reduce((acc, m) => {
          acc[m.role] = (acc[m.role] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        return (
          <>
            <div className="detail-summary">
              <div className="summary-stat">
                <span className="summary-value">{members.length}</span>
                <span className="summary-label">Total Members</span>
              </div>
              <div className="summary-stat">
                <span className="summary-value">{roleCount['admin'] || 0}</span>
                <span className="summary-label">Admins</span>
              </div>
              <div className="summary-stat">
                <span className="summary-value">{roleCount['member'] || 0}</span>
                <span className="summary-label">Members</span>
              </div>
            </div>
            <div className="members-actions">
              {onInviteMember && (
                <button className="invite-btn" onClick={onInviteMember}>
                  <UserPlus size={16} />
                  Invite Member
                </button>
              )}
              {onManageTeam && (
                <button className="manage-btn" onClick={onManageTeam}>
                  <Users size={16} />
                  Manage Team
                </button>
              )}
            </div>
            <h4 className="detail-section-title">Team Members</h4>
            <div className="members-list">
              {sortedMembers.map((member, idx) => (
                <div key={idx} className="member-item">
                  <div className="member-avatar">
                    {member.displayName?.[0]?.toUpperCase() || member.email[0].toUpperCase()}
                  </div>
                  <div className="member-info">
                    <div className="member-name">
                      {member.displayName || member.email.split('@')[0]}
                      {getRoleIcon(member.role)}
                    </div>
                    <div className="member-email">{member.email}</div>
                  </div>
                  <div className="member-meta">
                    <span className={`member-role ${member.role}`}>{member.role}</span>
                    <span className="member-joined">
                      <Clock size={12} />
                      {formatRelativeTime(member.joinedAt instanceof Date ? member.joinedAt : new Date(member.joinedAt))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        );

      default:
        return null;
    }
  };

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

  const members = getTeamMembers();

  const dashboardContent = (
    <>
      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-title-section">
          <Users size={24} className="dashboard-icon team-icon" />
          <div>
            <h2>Team Dashboard</h2>
            <p className="workspace-path">{team.name}</p>
          </div>
        </div>
        <div className="dashboard-actions">
          <button className="dashboard-action-btn" onClick={loadStats} title="Refresh Stats">
            <RefreshCw size={18} />
          </button>
          {!isTabMode && onClose && (
            <button className="dashboard-close-btn" onClick={onClose}>
              &times;
            </button>
          )}
        </div>
      </div>

      <div className="dashboard-content">
        {/* Team Info Banner */}
        <div className="team-info-banner">
          <div className="team-info-stat">
            <Users size={18} />
            <span>{members.length} {members.length === 1 ? 'member' : 'members'}</span>
          </div>
          <div className="team-info-stat">
            <Clock size={18} />
            <span>Created {formatRelativeTime(team.createdAt instanceof Date ? team.createdAt : new Date(team.createdAt))}</span>
          </div>
          {storageUsage && (
            <div className={`team-info-stat storage-${storageUsage.status}`}>
              <HardDrive size={18} />
              <span>{storageUsage.usedFormatted} / {storageUsage.limitFormatted}</span>
            </div>
          )}
        </div>

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
            <button
              className="stat-card-dashboard clickable team-stat"
              onClick={() => setActiveDetailView('members')}
            >
              <Users size={24} className="stat-icon" />
              <div className="stat-value">{members.length}</div>
              <div className="stat-label">Members</div>
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
          <div className="discovery-grid">
            {/* Random Note */}
            <div className="discovery-card">
              <div className="discovery-header">
                <Shuffle size={18} />
                <span>Random Note</span>
              </div>
              <div className="discovery-content">
                {randomNote ? (
                  <div
                    className="random-note-result"
                    onClick={() => handleNoteClick(randomNote.path, randomNote.name)}
                  >
                    <FileText size={16} />
                    <span>{randomNote.name}</span>
                  </div>
                ) : (
                  <p className="discovery-hint">Click to discover a random note</p>
                )}
                <button
                  className="discovery-btn"
                  onClick={handleRandomNote}
                  disabled={allNotes.length === 0}
                >
                  <Shuffle size={14} />
                  {randomNote ? 'Try Another' : 'Pick Random'}
                </button>
              </div>
            </div>

            {/* Most Connected */}
            <div className="discovery-card">
              <div className="discovery-header">
                <Network size={18} />
                <span>Most Connected</span>
              </div>
              <div className="discovery-content">
                {workspaceStats?.mostLinkedNotes && workspaceStats.mostLinkedNotes.length > 0 ? (
                  <div className="linked-notes-list">
                    {workspaceStats.mostLinkedNotes.slice(0, 3).map((note, idx) => (
                      <div
                        key={idx}
                        className="linked-note-item"
                        onClick={() => handleNoteClick(note.path, note.name)}
                      >
                        <FileText size={14} />
                        <span className="linked-note-name">{note.name}</span>
                        <span className="linked-note-count">{note.linkCount} links</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <p>No linked notes yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );

  if (isTabMode) {
    return (
      <div className="dashboard-panel dashboard-tab-mode team-dashboard">
        {activeDetailView ? renderDetailView() : dashboardContent}
      </div>
    );
  }

  return (
    <div className="dashboard-overlay" onClick={onClose}>
      <div className="dashboard-panel team-dashboard" onClick={(e) => e.stopPropagation()}>
        {activeDetailView ? renderDetailView() : dashboardContent}
      </div>
    </div>
  );
};

export default TeamDashboardPanel;
