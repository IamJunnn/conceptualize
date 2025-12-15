import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { formatBytes } from '../../services/billingTypes';
import { getLocalStorage, setLocalStorage, removeLocalStorage } from '../../hooks/useLocalStorage';
import {
  FileText,
  Folder,
  HardDrive,
  Link2,
  Users,
  UserPlus,
  TrendingUp,
  ChevronLeft,
  ArrowRight,
  Crown,
  Shield,
  User as UserIcon,
  Clock,
  MoreVertical,
  Send,
  X,
  Trash2,
  Edit2,
  Star,
  Image,
  Upload,
  CheckSquare,
  MessagesSquare,
  Calendar,
  Video,
} from 'lucide-react';
import { extractWikiLinks } from '../../utils/graphUtils';
import {
  Team,
  TeamMember,
  TeamInvitation,
  getTeamPendingInvites,
  cancelInvitation,
  resendInvitation,
  removeTeamMember,
  updateMemberRole,
  updateMemberProfile
} from '../../services/teamService';
import ConfirmModal, { ModalVariant } from '../UI/ConfirmModal';
import { TeamDriveStorage } from '../../services/teamDriveStorage';
import { StorageUsage } from '../../services/billingTypes';
import {
  startPresenceTracking,
  stopPresenceTracking,
  subscribeToTeamPresence,
  subscribeToTeamPresenceDetailed,
  getOnlineCount,
  UserPresence
} from '../../services/presenceService';
import {
  getTeamBackground,
  uploadTeamBackground,
  deleteTeamBackground,
} from '../../services/backgroundService';
import { subscribeToTodos } from '../../services/teamTodoService';
import { TeamTodo } from '../../services/teamTodoTypes';
import { subscribeToMessages, getChannels, getOrCreateDMChannel, subscribeToUnreadCounts } from '../../services/teamChatService';
import { ChatMessage } from '../../services/teamChatTypes';
import { getTeamWhiteboards } from '../../services/whiteboardService';
import { WhiteboardMeta } from '../../services/whiteboardTypes';
import { PenTool } from 'lucide-react';
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
  currentUserRole?: 'owner' | 'admin' | 'leader' | 'member';
  currentUserEmail?: string;
  onOpenChat?: (channelId?: string) => void;
  onOpenRecordings?: () => void;
  onOpenTimeline?: (filter?: 'all' | 'tasks' | 'meetings', meetingId?: string) => void;
  onOpenTodos?: (filter?: 'all' | 'my-tasks' | 'unassigned', taskId?: string) => void;
}

const TeamDashboardPanel: React.FC<TeamDashboardPanelProps> = ({
  onClose,
  team,
  storageBackend,
  storageUsage,
  onSelectFile,
  onInviteMember,
  onManageTeam,
  isTabMode = false,
  currentUserRole = 'member',
  currentUserEmail,
  onOpenChat,
  onOpenRecordings: _onOpenRecordings,
  onOpenTimeline,
  onOpenTodos,
}) => {
  // Check if user has admin/owner privileges
  const isAdminOrOwner = currentUserRole === 'admin' || currentUserRole === 'owner';
  const [workspaceStats, setWorkspaceStats] = useState<TeamWorkspaceStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  // Persist activeDetailView to localStorage
  const [activeDetailView, setActiveDetailView] = useState<DetailView>(() => {
    return getLocalStorage<DetailView>(`teamDashboard_${team.id}_activeView`, null);
  });
  const [pendingInvitations, setPendingInvitations] = useState<TeamInvitation[]>([]);
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);
  const [activeInviteMenu, setActiveInviteMenu] = useState<{ id: string; position: 'above' | 'below' } | null>(null);
  const [activeMemberMenu, setActiveMemberMenu] = useState<{ id: string; position: 'above' | 'below' } | null>(null);
  const [onlineMembers, setOnlineMembers] = useState<Map<string, boolean>>(new Map());
  const [memberPresence, setMemberPresence] = useState<Map<string, UserPresence>>(new Map());
  const [roleModal, setRoleModal] = useState<{
    isOpen: boolean;
    member: (TeamMember & { email: string }) | null;
  }>({ isOpen: false, member: null });
  const [nameModal, setNameModal] = useState<{
    isOpen: boolean;
    member: (TeamMember & { email: string }) | null;
    newName: string;
  }>({ isOpen: false, member: null, newName: '' });
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    variant: ModalVariant;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    variant: 'confirm',
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [teamBackground, setTeamBackground] = useState<string | null>(null);
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  const [myTasks, setMyTasks] = useState<TeamTodo[]>([]);
  const [myMeetings, setMyMeetings] = useState<TeamTodo[]>([]);
  const [recentMessages, setRecentMessages] = useState<ChatMessage[]>([]);
  const [totalUnreadCount, setTotalUnreadCount] = useState<number>(0);
  const [recentlyEdited, setRecentlyEdited] = useState<{ name: string; path: string; editedAt: Date; editedBy?: string; type: 'note' | 'whiteboard' }[]>([]);
  const storagePieRef = useRef<SVGSVGElement>(null);
  const backgroundFileInputRef = useRef<HTMLInputElement>(null);

  // Save activeDetailView to localStorage when it changes
  useEffect(() => {
    if (activeDetailView) {
      setLocalStorage(`teamDashboard_${team.id}_activeView`, activeDetailView);
    } else {
      removeLocalStorage(`teamDashboard_${team.id}_activeView`);
    }
  }, [activeDetailView, team.id]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (activeInviteMenu) setActiveInviteMenu(null);
      if (activeMemberMenu) setActiveMemberMenu(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeInviteMenu, activeMemberMenu]);

  // Presence tracking
  useEffect(() => {
    if (!team.id || !currentUserEmail) return;

    // Start tracking current user's presence
    startPresenceTracking(team.id, currentUserEmail);

    // Subscribe to team presence updates (simple boolean map for online status)
    const unsubscribe = subscribeToTeamPresence(team.id, (presenceMap) => {
      setOnlineMembers(presenceMap);
    });

    // Subscribe to detailed presence updates (includes lastSeen time)
    const unsubscribeDetailed = subscribeToTeamPresenceDetailed(team.id, (detailedMap) => {
      setMemberPresence(detailedMap);
    });

    return () => {
      stopPresenceTracking();
      unsubscribe();
      unsubscribeDetailed();
    };
  }, [team.id, currentUserEmail]);

  // Load team background
  useEffect(() => {
    if (team.id && isAdminOrOwner) {
      getTeamBackground(team.id).then(setTeamBackground);
    }
  }, [team.id, isAdminOrOwner]);

  // Subscribe to my tasks and my meetings (assigned to current user)
  useEffect(() => {
    if (!team.id || !currentUserEmail) return;

    const unsubscribe = subscribeToTodos(team.id, (todos) => {
      // Filter for tasks assigned to current user (type !== 'meeting')
      const myAssignedTasks = todos
        .filter(todo =>
          todo.assignees?.some(email => email.toLowerCase() === currentUserEmail.toLowerCase()) &&
          !todo.completed &&
          todo.type !== 'meeting'
        )
        .sort((a, b) => {
          // Sort by end date, then by priority
          if (a.endDate && b.endDate) {
            return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
          }
          if (a.endDate) return -1;
          if (b.endDate) return 1;
          return (a.priority || 4) - (b.priority || 4);
        })
        .slice(0, 5);
      setMyTasks(myAssignedTasks);

      // Filter for meetings assigned to current user
      const now = new Date();
      const myAssignedMeetings = todos
        .filter(todo =>
          todo.assignees?.some(email => email.toLowerCase() === currentUserEmail.toLowerCase()) &&
          !todo.completed &&
          todo.type === 'meeting'
        )
        .filter(todo => {
          // Only show upcoming meetings (not past ones)
          if (todo.endDate) {
            return new Date(todo.endDate) >= now;
          }
          return true; // Show meetings without end date
        })
        .sort((a, b) => {
          // Sort by start/end date
          const dateA = a.startDate ? new Date(a.startDate).getTime() : (a.endDate ? new Date(a.endDate).getTime() : Infinity);
          const dateB = b.startDate ? new Date(b.startDate).getTime() : (b.endDate ? new Date(b.endDate).getTime() : Infinity);
          return dateA - dateB;
        })
        .slice(0, 5);
      setMyMeetings(myAssignedMeetings);
    });

    return () => unsubscribe();
  }, [team.id, currentUserEmail]);

  // Subscribe to recent messages from general channel
  useEffect(() => {
    if (!team.id) return;

    let unsubscribeMessages: (() => void) | null = null;

    // Get general channel and subscribe to its messages
    getChannels(team.id).then(channels => {
      const generalChannel = channels.find(c => c.name === 'general' || c.type === 'text');
      if (generalChannel) {
        unsubscribeMessages = subscribeToMessages(
          team.id,
          generalChannel.id,
          (messages: ChatMessage[]) => {
            // Get the 5 most recent messages
            const recent = messages
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .slice(0, 5);
            setRecentMessages(recent);
          }
        );
      }
    }).catch(err => {
      console.error('[TeamDashboard] Error loading channels:', err);
    });

    return () => {
      if (unsubscribeMessages) unsubscribeMessages();
    };
  }, [team.id]);

  // Subscribe to unread counts across all channels
  useEffect(() => {
    if (!team.id || !currentUserEmail) return;

    let unsubscribeUnread: (() => void) | null = null;

    getChannels(team.id).then(channels => {
      const channelIds = channels.map(c => c.id);
      if (channelIds.length > 0) {
        unsubscribeUnread = subscribeToUnreadCounts(
          team.id,
          currentUserEmail,
          channelIds,
          (counts) => {
            // Sum up all unread counts
            const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
            setTotalUnreadCount(total);
          }
        );
      }
    }).catch(err => {
      console.error('[TeamDashboard] Error subscribing to unread counts:', err);
    });

    return () => {
      if (unsubscribeUnread) unsubscribeUnread();
    };
  }, [team.id, currentUserEmail]);

  // Load recently edited notes and whiteboards
  useEffect(() => {
    const loadRecentlyEdited = async () => {
      try {
        // Load notes from storage
        const files = await storageBackend.listFiles();
        const noteItems = files
          .filter((f: any) => f.name?.toLowerCase().endsWith('.md'))
          .map((f: any) => ({
            name: f.name.replace(/\.md$/i, ''),
            path: f.fullPath || f.name,
            editedAt: new Date(f.modifiedTime || f.updatedAt || f.createdAt || new Date()),
            editedBy: f.lastEditedBy,
            type: 'note' as const
          }));

        // Load whiteboards
        const whiteboards = await getTeamWhiteboards(team.id);
        const whiteboardItems = whiteboards.map((wb: WhiteboardMeta) => ({
          name: wb.name,
          path: `whiteboard:${wb.id}`,
          editedAt: new Date(wb.updatedAt),
          editedBy: wb.createdByName,
          type: 'whiteboard' as const
        }));

        // Combine and sort by editedAt
        const allItems = [...noteItems, ...whiteboardItems]
          .sort((a, b) => b.editedAt.getTime() - a.editedAt.getTime())
          .slice(0, 5);

        setRecentlyEdited(allItems);
      } catch (err) {
        console.error('[TeamDashboard] Error loading recently edited:', err);
      }
    };

    loadRecentlyEdited();
  }, [storageBackend, team.id]);

  // Handle background upload
  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUserEmail) return;

    // Validate file type
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      setBackgroundError('Only PNG and JPG files are allowed');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setBackgroundError('File size must be less than 10MB');
      return;
    }

    setBackgroundError(null);
    setIsUploadingBackground(true);

    try {
      const url = await uploadTeamBackground(team.id, file, currentUserEmail);
      setTeamBackground(url);
      setConfirmModal({
        isOpen: true,
        variant: 'success',
        title: 'Background Uploaded',
        message: 'Team video call background has been set successfully.',
        onConfirm: () => setConfirmModal(m => ({ ...m, isOpen: false })),
      });
    } catch (error: any) {
      setBackgroundError(error.message || 'Failed to upload background');
    } finally {
      setIsUploadingBackground(false);
      if (backgroundFileInputRef.current) {
        backgroundFileInputRef.current.value = '';
      }
    }
  };

  // Handle background delete
  const handleDeleteBackground = () => {
    setConfirmModal({
      isOpen: true,
      variant: 'warning',
      title: 'Delete Team Background',
      message: 'Are you sure you want to remove the team video call background?',
      onConfirm: async () => {
        setConfirmModal(m => ({ ...m, isOpen: false }));
        try {
          await deleteTeamBackground(team.id);
          setTeamBackground(null);
          setConfirmModal({
            isOpen: true,
            variant: 'success',
            title: 'Background Removed',
            message: 'Team video call background has been removed.',
            onConfirm: () => setConfirmModal(m => ({ ...m, isOpen: false })),
          });
        } catch (error: any) {
          setConfirmModal({
            isOpen: true,
            variant: 'danger',
            title: 'Error',
            message: `Failed to delete background: ${error.message}`,
            onConfirm: () => setConfirmModal(m => ({ ...m, isOpen: false })),
          });
        }
      },
    });
  };

  // Format date to relative time
  const formatRelativeTime = (date: Date | null | undefined): string => {
    if (!date || isNaN(date.getTime())) return '';
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

  // Format due date for upcoming todos (e.g., "Tomorrow", "Fri", "Dec 15")
  const formatDueDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return dayNames[date.getDay()];
    }
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[date.getMonth()]} ${date.getDate()}`;
  };

  // Handle opening DM chat with a member
  const handleOpenDM = async (memberEmail: string) => {
    if (!currentUserEmail || !onOpenChat) return;
    try {
      const channelId = await getOrCreateDMChannel(team.id, currentUserEmail, memberEmail);
      onOpenChat(channelId);
    } catch (error) {
      console.error('Error opening DM:', error);
    }
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

  // Decode encoded email key back to real email
  // e.g., "user_AT_gmail_DOT_com" -> "user@gmail.com"
  const decodeEmailKey = (encodedEmail: string): string => {
    return encodedEmail
      .replace(/_AT_/g, '@')
      .replace(/_DOT_/g, '.')
      .toLowerCase();
  };

  // Get members array from team
  const getTeamMembers = (): (TeamMember & { email: string })[] => {
    return Object.entries(team.members).map(([emailKey, member]) => ({
      ...member,
      email: decodeEmailKey(emailKey)
    }));
  };

  // Helper for case-insensitive online status lookup
  const isMemberOnline = (memberEmail: string): boolean => {
    const emailLower = memberEmail.toLowerCase();
    // Try direct lookup first
    if (onlineMembers.get(memberEmail)) return true;
    if (onlineMembers.get(emailLower)) return true;
    // Fall back to iterating through map for case-insensitive match
    for (const [email, isOnline] of onlineMembers) {
      if (email.toLowerCase() === emailLower && isOnline) return true;
    }
    return false;
  };

  // Calculate workspace stats from team storage
  const calculateWorkspaceStats = async (): Promise<TeamWorkspaceStats> => {
    try {
      // Get all files from team storage
      const files = await storageBackend.listFiles();
      const mdFiles = files.filter((f: any) =>
        f.name?.toLowerCase().endsWith('.md') &&
        !f.contentType?.includes('folder')
      );

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
    setIsLoadingStats(true);

    // Load stats and pending invitations in parallel
    const [stats, invites] = await Promise.all([
      calculateWorkspaceStats(),
      isAdminOrOwner ? getTeamPendingInvites(team.id).catch(() => []) : Promise.resolve([])
    ]);

    setWorkspaceStats(stats);
    setPendingInvitations(invites);
    setIsLoadingStats(false);
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

  // Handle resend invitation
  const handleResendInvitation = async (invite: TeamInvitation) => {
    try {
      setResendingInviteId(invite.id);
      await resendInvitation(
        invite.teamId,
        invite.teamName,
        invite.memberEmail,
        invite.inviteCode || '',
        invite.role || 'member'
      );
      setConfirmModal({
        isOpen: true,
        variant: 'success',
        title: 'Invitation Sent',
        message: `Invitation resent to ${invite.memberEmail}`,
        onConfirm: () => setConfirmModal(m => ({ ...m, isOpen: false })),
      });
    } catch (error: any) {
      setConfirmModal({
        isOpen: true,
        variant: 'danger',
        title: 'Error',
        message: `Failed to resend invitation: ${error.message}`,
        onConfirm: () => setConfirmModal(m => ({ ...m, isOpen: false })),
      });
    } finally {
      setResendingInviteId(null);
    }
  };

  // Handle cancel invitation
  const handleCancelInvitation = (invite: TeamInvitation) => {
    setActiveInviteMenu(null);
    setConfirmModal({
      isOpen: true,
      variant: 'warning',
      title: 'Cancel Invitation',
      message: `Are you sure you want to cancel the invitation to ${invite.memberEmail}?`,
      onConfirm: async () => {
        setConfirmModal(m => ({ ...m, isOpen: false }));
        try {
          await cancelInvitation(invite.id);
          // Refresh pending invitations
          const invites = await getTeamPendingInvites(team.id);
          setPendingInvitations(invites);
          setConfirmModal({
            isOpen: true,
            variant: 'success',
            title: 'Invitation Cancelled',
            message: `The invitation to ${invite.memberEmail} has been cancelled.`,
            onConfirm: () => setConfirmModal(m => ({ ...m, isOpen: false })),
          });
        } catch (error: any) {
          setConfirmModal({
            isOpen: true,
            variant: 'danger',
            title: 'Error',
            message: `Failed to cancel invitation: ${error.message}`,
            onConfirm: () => setConfirmModal(m => ({ ...m, isOpen: false })),
          });
        }
      },
    });
  };

  // Handle remove team member
  const handleRemoveMember = (member: TeamMember & { email: string }) => {
    setActiveMemberMenu(null);
    setConfirmModal({
      isOpen: true,
      variant: 'danger',
      title: 'Remove Member',
      message: `Are you sure you want to remove ${member.displayName || member.email} from the team?`,
      onConfirm: async () => {
        setConfirmModal(m => ({ ...m, isOpen: false }));
        try {
          await removeTeamMember(team.id, member.email);
          setConfirmModal({
            isOpen: true,
            variant: 'success',
            title: 'Member Removed',
            message: `${member.displayName || member.email} has been removed from the team.`,
            onConfirm: () => setConfirmModal(m => ({ ...m, isOpen: false })),
          });
          // Note: Parent component should refresh team data
          if (onManageTeam) {
            // Trigger refresh by briefly opening manage team
          }
        } catch (error: any) {
          setConfirmModal({
            isOpen: true,
            variant: 'danger',
            title: 'Error',
            message: `Failed to remove member: ${error.message}`,
            onConfirm: () => setConfirmModal(m => ({ ...m, isOpen: false })),
          });
        }
      },
    });
  };

  // Handle change member role
  const handleChangeRole = async (member: TeamMember & { email: string }, newRole: 'admin' | 'leader' | 'member') => {
    try {
      await updateMemberRole(team.id, member.email, newRole);
      setRoleModal({ isOpen: false, member: null });
      setConfirmModal({
        isOpen: true,
        variant: 'success',
        title: 'Role Updated',
        message: `${member.displayName || member.email}'s role has been changed to ${newRole}.`,
        onConfirm: () => setConfirmModal(m => ({ ...m, isOpen: false })),
      });
    } catch (error: any) {
      setConfirmModal({
        isOpen: true,
        variant: 'danger',
        title: 'Error',
        message: `Failed to update role: ${error.message}`,
        onConfirm: () => setConfirmModal(m => ({ ...m, isOpen: false })),
      });
    }
  };

  // Handle change member name
  const handleChangeName = async () => {
    if (!nameModal.member || !nameModal.newName.trim()) return;
    try {
      await updateMemberProfile(team.id, nameModal.member.email, nameModal.newName.trim());
      setNameModal({ isOpen: false, member: null, newName: '' });
      setConfirmModal({
        isOpen: true,
        variant: 'success',
        title: 'Name Updated',
        message: `Display name has been changed to "${nameModal.newName.trim()}".`,
        onConfirm: () => setConfirmModal(m => ({ ...m, isOpen: false })),
      });
    } catch (error: any) {
      setConfirmModal({
        isOpen: true,
        variant: 'danger',
        title: 'Error',
        message: `Failed to update name: ${error.message}`,
        onConfirm: () => setConfirmModal(m => ({ ...m, isOpen: false })),
      });
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

  // Navigation tabs for detail views - Storage and Members only visible to admin/owner
  const detailTabs: { key: DetailView; label: string; icon: React.ReactNode }[] = [
    { key: 'notes', label: 'Notes', icon: <FileText size={16} /> },
    { key: 'folders', label: 'Folders', icon: <Folder size={16} /> },
    { key: 'links', label: 'Links', icon: <Link2 size={16} /> },
    ...(isAdminOrOwner ? [
      { key: 'storage' as DetailView, label: 'Storage', icon: <HardDrive size={16} /> },
      { key: 'members' as DetailView, label: 'Members', icon: <Users size={16} /> },
    ] : []),
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
                  {storageUsage ? `${storageUsage.percentUsed.toFixed(0)}%` : '—'}
                </span>
                <span className="summary-label">Quota used</span>
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
            {/* Team Brand Background Section */}
            <div className="brand-background-section">
              <h4 className="detail-section-title">
                <Image size={16} />
                Video call brand background
              </h4>
              <p className="section-description">
                Set a team background for video calls. All team members can use this background.
              </p>
              {teamBackground ? (
                <div className="brand-background-preview">
                  <img src={teamBackground} alt="Team background" />
                  <div className="brand-background-actions">
                    <button
                      className="change-bg-btn"
                      onClick={() => backgroundFileInputRef.current?.click()}
                      disabled={isUploadingBackground}
                    >
                      <Upload size={14} />
                      {isUploadingBackground ? 'Uploading...' : 'Change'}
                    </button>
                    <button
                      className="delete-bg-btn"
                      onClick={handleDeleteBackground}
                      disabled={isUploadingBackground}
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="brand-background-upload">
                  <button
                    className="upload-bg-btn"
                    onClick={() => backgroundFileInputRef.current?.click()}
                    disabled={isUploadingBackground}
                  >
                    {isUploadingBackground ? (
                      <>
                        <div className="upload-spinner" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload size={20} />
                        Upload brand background
                      </>
                    )}
                  </button>
                  <span className="upload-hint">PNG or JPG, max 10MB</span>
                </div>
              )}
              {backgroundError && (
                <div className="background-error">{backgroundError}</div>
              )}
              <input
                ref={backgroundFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleBackgroundUpload}
                style={{ display: 'none' }}
              />
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

      case 'members':
        const members = getTeamMembers();
        const roleOrder = ['owner', 'admin', 'leader', 'member'];
        const sortedMembers = members.sort((a, b) =>
          roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role)
        );

        return (
          <div className="members-content-wrapper">
            <div className="detail-summary">
              <div className="summary-stat">
                <span className="summary-value">{members.length}</span>
                <span className="summary-label">Total Members</span>
              </div>
              <div className="summary-stat">
                <span className="summary-value">{pendingInvitations.length}</span>
                <span className="summary-label">Pending</span>
              </div>
              <div className="summary-stat online-stat">
                <span className="summary-value online-value">{getOnlineCount(onlineMembers)}</span>
                <span className="summary-label">Online</span>
              </div>
            </div>
            <div className="members-actions">
              {onInviteMember && (
                <button className="invite-btn purple" onClick={onInviteMember}>
                  <UserPlus size={16} />
                  Invite Member
                </button>
              )}
            </div>

            {/* Scrollable sections wrapper */}
            <div className="members-sections-scroll">
              {/* Pending Members Section */}
              {pendingInvitations.length > 0 && (
                <div className="pending-members-section">
                  <h4 className="detail-section-title">Pending Members ({pendingInvitations.length})</h4>
                  <div className="members-list pending-members-list">
                    {pendingInvitations.map((invite, idx) => (
                      <div key={idx} className="member-item pending">
                        <div className="member-avatar pending-avatar">
                          <Clock size={18} />
                        </div>
                        <div className="member-info">
                          <div className="member-name">
                            {invite.memberEmail.split('@')[0]}
                            <span className="pending-badge">Pending</span>
                          </div>
                          <div className="member-email">{invite.memberEmail}</div>
                        </div>
                        <div className="member-meta">
                          <span className={`member-role ${invite.role || 'member'}`}>{invite.role || 'member'}</span>
                          <span className="member-joined">
                            <Clock size={12} />
                            {formatRelativeTime(invite.invitedAt instanceof Date ? invite.invitedAt : new Date(invite.invitedAt))}
                          </span>
                        </div>
                        <div className="pending-actions">
                          <button
                            className="pending-menu-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (activeInviteMenu?.id === invite.id) {
                                setActiveInviteMenu(null);
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const spaceBelow = window.innerHeight - rect.bottom;
                                const position = spaceBelow < 120 ? 'above' : 'below';
                                setActiveInviteMenu({ id: invite.id, position });
                              }
                            }}
                            title="More actions"
                          >
                            <MoreVertical size={16} />
                          </button>
                          {activeInviteMenu?.id === invite.id && (
                            <div className={`pending-menu-dropdown ${activeInviteMenu.position}`}>
                              <button
                                className="pending-menu-item"
                                onClick={() => {
                                  setActiveInviteMenu(null);
                                  handleResendInvitation(invite);
                                }}
                                disabled={resendingInviteId === invite.id}
                              >
                                <Send size={14} />
                                Resend Invitation
                              </button>
                              <button
                                className="pending-menu-item danger"
                                onClick={() => handleCancelInvitation(invite)}
                              >
                                <X size={14} />
                                Cancel Invitation
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Team Members Section */}
              <div className="team-members-section">
                <h4 className="detail-section-title">Team Members ({members.length})</h4>
                <div className="members-list">
                  {sortedMembers.map((member, idx) => (
                    <div key={idx} className="member-item">
                      <div className="member-avatar">
                        {(member.customAvatar || member.photoURL) ? (
                          <img src={member.customAvatar || member.photoURL} alt={member.displayName || member.email} className="avatar-image" />
                        ) : (
                          member.displayName?.[0]?.toUpperCase() || member.email[0].toUpperCase()
                        )}
                        {isMemberOnline(member.email) && (
                          <span className="online-indicator" title="Online" />
                        )}
                      </div>
                      <div className="member-info">
                        <div className="member-name">
                          {member.displayName || member.email.split('@')[0]}
                          {getRoleIcon(member.role)}
                          {member.email.toLowerCase() === currentUserEmail?.toLowerCase() && (
                            <span className="you-badge">you</span>
                          )}
                        </div>
                        <div className="member-email">{member.email}</div>
                      </div>
                      <div className="member-meta">
                        <span className={`member-role ${member.role || 'member'}`}>{member.role || 'member'}</span>
                        {(() => {
                          // Try to find presence with case-insensitive email lookup
                          const emailLower = member.email.toLowerCase();
                          let presence: UserPresence | undefined;
                          memberPresence.forEach((p, key) => {
                            if (key.toLowerCase() === emailLower) {
                              presence = p;
                            }
                          });

                          if (presence?.isOnline) {
                            return (
                              <span className="member-joined online-now">
                                <span className="online-dot" />
                                Online
                              </span>
                            );
                          } else if (presence?.lastSeen) {
                            return (
                              <span className="member-joined">
                                <Clock size={12} />
                                {formatRelativeTime(presence.lastSeen)}
                              </span>
                            );
                          } else if (member.joinedAt) {
                            return (
                              <span className="member-joined">
                                <Clock size={12} />
                                {formatRelativeTime(member.joinedAt instanceof Date ? member.joinedAt : new Date(member.joinedAt))}
                              </span>
                            );
                          }
                          // No presence data and no joinedAt - show offline
                          return (
                            <span className="member-joined offline">
                              Offline
                            </span>
                          );
                        })()}
                      </div>
                      {/* Actions menu - only for admin/owner and not for owners */}
                      {isAdminOrOwner && member.role !== 'owner' && (
                        <div className="member-actions">
                          <button
                            className="member-menu-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (activeMemberMenu?.id === member.email) {
                                setActiveMemberMenu(null);
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const spaceBelow = window.innerHeight - rect.bottom;
                                const position = spaceBelow < 150 ? 'above' : 'below';
                                setActiveMemberMenu({ id: member.email, position });
                              }
                            }}
                            title="More actions"
                          >
                            <MoreVertical size={16} />
                          </button>
                          {activeMemberMenu?.id === member.email && (
                            <div className={`member-menu-dropdown ${activeMemberMenu.position}`}>
                              <button
                                className="member-menu-item"
                                onClick={() => {
                                  setActiveMemberMenu(null);
                                  setRoleModal({ isOpen: true, member });
                                }}
                              >
                                <Shield size={14} />
                                Change Role
                              </button>
                              <button
                                className="member-menu-item"
                                onClick={() => {
                                  setActiveMemberMenu(null);
                                  setNameModal({
                                    isOpen: true,
                                    member,
                                    newName: member.displayName || ''
                                  });
                                }}
                              >
                                <Edit2 size={14} />
                                Change Name
                              </button>
                              <button
                                className="member-menu-item danger"
                                onClick={() => handleRemoveMember(member)}
                              >
                                <Trash2 size={14} />
                                Remove from Team
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
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
        <div className={`detail-content ${activeDetailView === 'members' ? 'members-view' : ''}`}>
          {renderDetailContent()}
        </div>
      </div>
    );
  };

  const members = getTeamMembers();

  const dashboardContent = (
    <>
      {/* Header */}
      <div className="dashboard-header minimal">
        <div className="dashboard-title-section">
          <div>
            <h2>Team Dashboard</h2>
            <p className="workspace-path">{team.name}</p>
          </div>
        </div>
        <div className="dashboard-actions">
          {!isTabMode && onClose && (
            <button className="dashboard-close-btn" onClick={onClose}>
              &times;
            </button>
          )}
        </div>
      </div>

      <div className="dashboard-content">
        {/* Workspace Overview */}
        <section className="dashboard-section">
          <h3>
            <TrendingUp size={18} />
            Workspace overview
          </h3>
          <div className={`stats-grid-dashboard ${!isAdminOrOwner ? 'stats-grid-3' : ''}`}>
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
            {isAdminOrOwner && (
              <>
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
              </>
            )}
          </div>
        </section>

        {/* Online Now Members */}
        <section className="dashboard-section">
          <h3>
            <Users size={18} />
            Online now
          </h3>
          <div className="online-members-section">
            {getOnlineCount(onlineMembers) > 0 ? (
              <div className="online-members-grid">
                {getTeamMembers()
                  .filter(member => isMemberOnline(member.email))
                  .slice(0, 8)
                  .map((member) => {
                    const isCurrentUser = member.email.toLowerCase() === currentUserEmail?.toLowerCase();
                    return (
                      <div
                        key={member.email}
                        className={`online-member-card ${!isCurrentUser && onOpenChat ? 'clickable' : ''}`}
                        onClick={() => !isCurrentUser && handleOpenDM(member.email)}
                        title={isCurrentUser ? 'You' : `Message ${member.displayName || member.email.split('@')[0]}`}
                      >
                        <div className="online-member-avatar">
                          {(member.customAvatar || member.photoURL) ? (
                            <img src={member.customAvatar || member.photoURL} alt={member.displayName || member.email} />
                          ) : (
                            member.displayName?.[0]?.toUpperCase() || member.email[0].toUpperCase()
                          )}
                          <span className="online-dot" />
                        </div>
                        <span className="online-member-name">
                          {member.displayName || member.email.split('@')[0]}
                          {isCurrentUser && <span className="you-badge">you</span>}
                        </span>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="empty-online">
                <Users size={24} />
                <p>No one else is online</p>
              </div>
            )}
          </div>
        </section>

        {/* Upcoming - My Tasks + My Meetings */}
        <section className="dashboard-section">
          <h3>
            <Calendar size={18} />
            Upcoming
          </h3>
          <div className="activity-grid">
            {/* My Tasks */}
            <div className="activity-card">
              <div className="activity-header">
                <CheckSquare size={18} />
                <span>My tasks</span>
                {myTasks.length > 0 && (
                  <span className="activity-count">{myTasks.length}</span>
                )}
              </div>
              <div className="activity-content">
                {myTasks.length > 0 ? (
                  <div className="tasks-list">
                    {myTasks.map((task) => (
                      <div
                        key={task.id}
                        className={`task-item ${onOpenTodos ? 'clickable' : ''}`}
                        onClick={() => onOpenTodos?.('my-tasks', task.id)}
                        title="View in To-dos"
                      >
                        <div className={`task-priority priority-${task.priority}`} />
                        <span className="task-title">{task.text}</span>
                        {task.endDate && (
                          <span className={`task-due ${new Date(task.endDate) < new Date() ? 'overdue' : ''}`}>
                            {formatDueDate(task.endDate)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-activity">
                    <CheckSquare size={24} />
                    <p>No tasks assigned to you</p>
                  </div>
                )}
              </div>
            </div>

            {/* My Meetings */}
            <div className="activity-card">
              <div className="activity-header">
                <Video size={18} />
                <span>My meetings</span>
                {myMeetings.length > 0 && (
                  <span className="activity-count">{myMeetings.length}</span>
                )}
              </div>
              <div className="activity-content">
                {myMeetings.length > 0 ? (
                  <div className="meetings-list">
                    {myMeetings.map((meeting) => (
                      <div
                        key={meeting.id}
                        className={`meeting-item ${onOpenTimeline ? 'clickable' : ''}`}
                        onClick={() => onOpenTimeline?.('meetings', meeting.id)}
                        title="View meeting details"
                      >
                        <div
                          className="meeting-color-bar"
                          style={{ backgroundColor: meeting.meetingDetails?.color || '#64c8ca' }}
                        />
                        <span className="meeting-title">{meeting.text}</span>
                        <span className="meeting-time">
                          {meeting.meetingDetails?.startTime && (
                            <>{meeting.meetingDetails.startTime}</>
                          )}
                          {meeting.startDate && (
                            <span className="meeting-date">{formatDueDate(meeting.startDate)}</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-activity">
                    <Video size={24} />
                    <p>No meetings scheduled</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Recent - Messages + Recently Edited */}
        <section className="dashboard-section">
          <h3>
            <Clock size={18} />
            Recent
          </h3>
          <div className="activity-grid">
            {/* Recent Messages */}
            <div className="activity-card">
              <div className="activity-header">
                <MessagesSquare size={18} />
                <span>Recent messages</span>
                {totalUnreadCount > 0 && (
                  <span className="unread-badge">{totalUnreadCount > 99 ? '99+' : totalUnreadCount}</span>
                )}
              </div>
              <div className="activity-content">
                {recentMessages.length > 0 ? (
                  <div className="messages-list">
                    {recentMessages.map((msg) => (
                      <div key={msg.id} className="message-item">
                        <div className="message-avatar">
                          {msg.senderName?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="message-content">
                          <span className="message-sender">{msg.senderName}</span>
                          <span className="message-text">
                            {msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content}
                          </span>
                        </div>
                        <span className="message-time">
                          {formatRelativeTime(new Date(msg.createdAt))}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-activity">
                    <MessagesSquare size={24} />
                    <p>No recent messages</p>
                  </div>
                )}
              </div>
            </div>

            {/* Recently Edited */}
            <div className="activity-card">
              <div className="activity-header">
                <FileText size={18} />
                <span>Recently edited</span>
              </div>
              <div className="activity-content">
                {recentlyEdited.length > 0 ? (
                  <div className="recently-edited-list">
                    {recentlyEdited.map((item, idx) => {
                      const isWhiteboard = item.type === 'whiteboard';
                      const handleClick = () => {
                        if (isWhiteboard) {
                          // Extract whiteboard ID from path (format: "whiteboard:{id}")
                          const wbId = item.path.replace('whiteboard:', '');
                          if (onSelectFile) {
                            onSelectFile(`special://whiteboard/${wbId}`, item.name);
                          }
                        } else {
                          handleNoteClick(item.path, item.name);
                        }
                      };
                      // For whiteboards, editedBy is already a display name; for notes, it's an email
                      const displayName = item.editedBy
                        ? (isWhiteboard ? item.editedBy : item.editedBy.split('@')[0])
                        : undefined;

                      return (
                        <div
                          key={idx}
                          className={`recently-edited-item ${isWhiteboard ? 'whiteboard-item' : ''}`}
                          onClick={handleClick}
                        >
                          {isWhiteboard ? <PenTool size={14} /> : <FileText size={14} />}
                          <span className="note-name">{item.name}</span>
                          <span className="note-meta">
                            {displayName && (
                              <span className="edited-by">by {displayName}</span>
                            )}
                            <span className="note-time">{formatRelativeTime(new Date(item.editedAt))}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-activity">
                    <FileText size={24} />
                    <p>No recently edited items</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );

  // Role change modal
  const roleModalContent = roleModal.isOpen && roleModal.member && (
    <div className="modal-overlay" onClick={() => setRoleModal({ isOpen: false, member: null })}>
      <div className="role-change-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Change Role</h3>
        <p>Select a new role for <strong>{roleModal.member.displayName || roleModal.member.email}</strong></p>
        <div className="role-options">
          <button
            className={`role-option ${roleModal.member.role === 'admin' ? 'active' : ''}`}
            onClick={() => handleChangeRole(roleModal.member!, 'admin')}
            disabled={roleModal.member.role === 'admin'}
          >
            <Shield size={20} />
            <div>
              <div className="role-title">Admin</div>
              <div className="role-desc">Full team management</div>
            </div>
          </button>
          <button
            className={`role-option ${roleModal.member.role === 'leader' ? 'active' : ''}`}
            onClick={() => handleChangeRole(roleModal.member!, 'leader')}
            disabled={roleModal.member.role === 'leader'}
          >
            <Star size={20} />
            <div>
              <div className="role-title">Leader</div>
              <div className="role-desc">Manage members</div>
            </div>
          </button>
          <button
            className={`role-option ${roleModal.member.role === 'member' ? 'active' : ''}`}
            onClick={() => handleChangeRole(roleModal.member!, 'member')}
            disabled={roleModal.member.role === 'member'}
          >
            <UserIcon size={20} />
            <div>
              <div className="role-title">Member</div>
              <div className="role-desc">View and edit notes</div>
            </div>
          </button>
        </div>
        <div className="modal-actions">
          <button className="cancel-btn" onClick={() => setRoleModal({ isOpen: false, member: null })}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  // Name change modal
  const nameModalContent = nameModal.isOpen && nameModal.member && (
    <div className="modal-overlay">
      <div className="name-change-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Change Display Name</h3>
        <p>Enter a new display name for <strong>{nameModal.member.email}</strong></p>
        <input
          type="text"
          className="name-input"
          value={nameModal.newName}
          onChange={(e) => setNameModal(m => ({ ...m, newName: e.target.value }))}
          placeholder="Display name"
          autoFocus
        />
        <div className="modal-actions">
          <button className="cancel-btn" onClick={() => setNameModal({ isOpen: false, member: null, newName: '' })}>
            Cancel
          </button>
          <button
            className="save-btn"
            onClick={handleChangeName}
            disabled={!nameModal.newName.trim()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );

  if (isTabMode) {
    return (
      <>
        <div className="dashboard-panel dashboard-tab-mode team-dashboard">
          {activeDetailView ? renderDetailView() : dashboardContent}
        </div>
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          variant={confirmModal.variant}
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(m => ({ ...m, isOpen: false }))}
        />
        {roleModalContent}
        {nameModalContent}
      </>
    );
  }

  return (
    <>
      <div className="dashboard-overlay" onClick={onClose}>
        <div className="dashboard-panel team-dashboard" onClick={(e) => e.stopPropagation()}>
          {activeDetailView ? renderDetailView() : dashboardContent}
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        variant={confirmModal.variant}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(m => ({ ...m, isOpen: false }))}
      />
      {roleModalContent}
      {nameModalContent}
    </>
  );
};

export default TeamDashboardPanel;
