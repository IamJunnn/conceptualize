/**
 * TeamChatPanel - Discord-style contact-based chat
 * Shows team members list, click to chat directly
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { TeamMember } from '../../../services/teamService';
import {
  getOrCreateDMChannel,
  sendMessage,
  editMessage,
  deleteMessage,
  addReaction,
  removeReaction,
  createGroupChannel,
  subscribeToGroupConversations,
  subscribeToDMConversations,
  addMembersToGroup,
  votePoll,
  markChannelAsReadWithNotifications,
  subscribeToUnreadCounts,
  loadReadStatesFromFirestore,
  clearReadStateCache,
  pinMessage,
  unpinMessage,
  subscribeToPinnedMessageIds,
} from '../../../services/teamChatService';
import { uploadChatAttachment } from '../../../services/firebaseStorageService';
import { Channel, MessageAttachment, generateDMChannelId, Poll, PollOption, SharedFile, SharedRecording, SharedTodo, SharedWhiteboard } from '../../../services/teamChatTypes';
import {
  canAccessChat,
  checkChatUploadAllowed,
} from '../../../services/billingService';
import {
  startPresenceTracking,
  stopPresenceTracking,
  subscribeToTeamPresence,
} from '../../../services/presenceService';
import { Pin, Plus, UserPlus, Search, Upload, FileText, MessagesSquare, Lock, Sparkles, User, Users, Clock, CheckSquare, Video } from 'lucide-react';
import ChatThread from './ChatThread';
import ChatInput from './ChatInput';
import ChatFileUploadModal from './ChatFileUploadModal';
import CreatePollModal from './CreatePollModal';
import CreateGroupModal from './CreateGroupModal';
import ConfirmModal from '../../UI/ConfirmModal';
import PinnedMessagesModal from './PinnedMessagesModal';
import ForwardMessageModal from './ForwardMessageModal';
import CallButton from './CallButton';
import CallOverlay from './CallOverlay';
import CompactCallWidget from './CompactCallWidget';
import CallConflictModal from './CallConflictModal';
import PermissionModal, { hasStoredPermission } from './PermissionModal';
import MessageSearchDropdown from './MessageSearchDropdown';
import InsertContentModal, { InsertMode, InsertResult, FileTreeItem } from './InsertContentModal';
import { ChatMessage } from '../../../services/teamChatTypes';
import { TeamTodo } from '../../../services/teamTodoTypes';
import { Recording } from '../../../services/recordingTypes';
import { WhiteboardMeta } from '../../../services/whiteboardTypes';
import { MentionableUser } from './MentionSuggestions';
import { CallType, CallState } from '../../../services/callTypes';
import {
  startCall,
  answerCall,
  declineCall,
  endCall,
  subscribeToIncomingCalls,
  subscribeToCallState,
  getCallState,
} from '../../../services/callService';
import { getLocalStorage, setLocalStorage, removeLocalStorage } from '../../../hooks/useLocalStorage';
import './TeamChatPanel.css';

// Decode encoded email key back to real email
// e.g., "user_AT_gmail_DOT_com" -> "user@gmail.com"
const decodeEmailKey = (encodedEmail: string): string => {
  return encodedEmail
    .replace(/_AT_/g, '@')
    .replace(/_DOT_/g, '.')
    .toLowerCase();
};

interface TeamChatPanelProps {
  teamId: string;
  members: { [email: string]: TeamMember };
  currentUserEmail: string;
  isOwner: boolean;
  onUpgradeClick: () => void;
  subscriptionStatus?: string;
  hasPromoAccess?: boolean;
  onUnreadCountChange?: (count: number) => void;
  onOpenSharedFile?: (sharedFile: SharedFile) => void;
  onOpenSharedRecording?: (sharedRecording: SharedRecording) => void;
  // Shared todo handlers
  onOpenSharedTodo?: (sharedTodo: SharedTodo) => void;
  onToggleSharedTodo?: (sharedTodo: SharedTodo) => void;
  onJoinMeetingFromChat?: (sharedTodo: SharedTodo) => void;
  // Shared whiteboard handler
  onOpenSharedWhiteboard?: (sharedWhiteboard: SharedWhiteboard) => void;
  // Data for insert content modal
  fileTree?: FileTreeItem[];
  teamTodos?: TeamTodo[];
  recordings?: Recording[];
  whiteboards?: WhiteboardMeta[];
  currentUserName?: string;
  // Call state communication with parent for floating widget
  onCallStateChange?: (callState: CallState, channelId: string | null, channelName: string | null) => void;
  // Whether the parent is showing the floating widget (user navigated away)
  isShowingFloatingWidget?: boolean;
  // Report active channel to parent for floating widget logic
  onActiveChannelChange?: (channelId: string | null) => void;
  // Navigate to a specific channel (when expanding from floating widget)
  navigateToChannelId?: string | null;
  onNavigationComplete?: () => void;
}

export default function TeamChatPanel({
  teamId,
  members,
  currentUserEmail,
  isOwner,
  onUpgradeClick,
  subscriptionStatus,
  hasPromoAccess,
  onUnreadCountChange,
  onOpenSharedFile,
  onOpenSharedRecording,
  onOpenSharedTodo,
  onToggleSharedTodo,
  onJoinMeetingFromChat,
  onOpenSharedWhiteboard,
  fileTree = [],
  teamTodos = [],
  recordings = [],
  whiteboards = [],
  currentUserName,
  onCallStateChange,
  isShowingFloatingWidget: _isShowingFloatingWidget,
  onActiveChannelChange,
  navigateToChannelId,
  onNavigationComplete,
}: TeamChatPanelProps) {
  void _isShowingFloatingWidget; // Reserved for conditional UI based on floating widget visibility
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [selectedMemberEmail, setSelectedMemberEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [restoringChat, setRestoringChat] = useState(false);
  const hasRestoredRef = useRef(false);

  // Upload error state
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Modal states
  const [showFileUploadModal, setShowFileUploadModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showPinnedModal, setShowPinnedModal] = useState(false);
  const [showPinConfirm, setShowPinConfirm] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [groupModalMode, setGroupModalMode] = useState<'create' | 'add'>('create');
  const [messageToPin, setMessageToPin] = useState<ChatMessage | null>(null);
  const [messageToForward, setMessageToForward] = useState<ChatMessage | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([]); // Shared pinned message IDs from Firestore
  const [searchQuery, setSearchQuery] = useState('');

  // Insert content modal state
  const [showInsertModal, setShowInsertModal] = useState(false);
  const [insertMode, setInsertMode] = useState<InsertMode>('note-file');

  // Search dropdown state
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [scrollToMessageId, setScrollToMessageId] = useState<string | null>(null);

  // Panel-wide drag and drop state
  const [panelDragOver, setPanelDragOver] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const dragCounterRef = useRef(0);

  // Group chat state
  const [groupChats, setGroupChats] = useState<Channel[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // DM conversations (with lastMessageAt, lastMessagePreview)
  const [dmConversations, setDmConversations] = useState<Channel[]>([]);

  // Unread message counts per channel
  const [unreadCounts, setUnreadCounts] = useState<{ [channelId: string]: number }>({});

  // Online presence tracking
  const [onlineMembers, setOnlineMembers] = useState<Map<string, boolean>>(new Map());

  // Call state
  const [callState, setCallState] = useState<CallState>(getCallState());
  const [isCallExpanded, setIsCallExpanded] = useState(false);
  const [showCallConflict, setShowCallConflict] = useState(false);
  const [callChannelId, setCallChannelId] = useState<string | null>(
    getCallState().activeCall?.channelId || null
  ); // Track which channel the call is in

  // Permission modal state
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [pendingCallType, setPendingCallType] = useState<CallType | null>(null);

  // LocalStorage key for persisting selected chat
  const getSelectedChatKey = () => `team_chat_selected_${teamId}`;

  // Subscribe to pinned message IDs from Firestore (shared across all channel participants)
  useEffect(() => {
    if (!activeChannelId || !teamId) {
      setPinnedMessageIds([]);
      return;
    }

    const unsubscribe = subscribeToPinnedMessageIds(teamId, activeChannelId, (ids) => {
      setPinnedMessageIds(ids);
    });

    return () => unsubscribe();
  }, [activeChannelId, teamId]);

  // Compute pinned messages from chat messages and pinned IDs
  const pinnedMessages = chatMessages.filter(m => pinnedMessageIds.includes(m.id));

  // Subscribe to unread counts for all DM channels
  useEffect(() => {
    if (!hasAccess || !teamId || !currentUserEmail || Object.keys(members).length === 0) {
      return;
    }

    // Generate all possible DM channel IDs
    const otherMembers = Object.keys(members).filter(email => email !== currentUserEmail);
    const channelIds = otherMembers.map(email => generateDMChannelId(currentUserEmail, email));

    // Also include group chat IDs
    const groupChannelIds = groupChats.map(g => g.id);
    const allChannelIds = [...channelIds, ...groupChannelIds];

    if (allChannelIds.length === 0) {
      return;
    }

    const unsubscribe = subscribeToUnreadCounts(
      teamId,
      currentUserEmail,
      allChannelIds,
      (counts) => {
        setUnreadCounts(counts);
        // Calculate total unread count and notify parent
        const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
        if (onUnreadCountChange) {
          onUnreadCountChange(total);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [hasAccess, teamId, currentUserEmail, members, groupChats, onUnreadCountChange]);

  // Load read states from Firestore on mount (for cross-device sync)
  useEffect(() => {
    if (teamId && currentUserEmail) {
      loadReadStatesFromFirestore(teamId, currentUserEmail).catch(e => {
        console.error('Failed to load read states:', e);
      });
    }

    // Clear cache when unmounting or switching teams
    return () => {
      clearReadStateCache();
    };
  }, [teamId, currentUserEmail]);

  // Mark channel as read when it becomes active (with optimistic UI)
  useEffect(() => {
    if (activeChannelId && teamId && currentUserEmail) {
      // This updates immediately (optimistic) then syncs to Firestore
      markChannelAsReadWithNotifications(teamId, activeChannelId, currentUserEmail);
    }
  }, [activeChannelId, teamId, currentUserEmail]);

  // Subscribe to call state changes
  useEffect(() => {
    const unsubscribe = subscribeToCallState((state) => {
      setCallState(state);
      // Reset expanded state when call ends
      if (!state.activeCall) {
        setIsCallExpanded(false);
        setCallChannelId(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Auto-expand call overlay when there's an active call on the current channel
  // This handles the case where user accepts a call while already viewing that channel
  useEffect(() => {
    if (callState.activeCall && callState.activeCall.channelId === activeChannelId) {
      setCallChannelId(activeChannelId);
      setIsCallExpanded(true);
    }
  }, [callState.activeCall, activeChannelId]);

  // Notify parent of call state changes
  useEffect(() => {
    if (onCallStateChange) {
      // Determine channel name for the call
      let channelName: string | null = null;
      if (callChannelId && callState.activeCall) {
        // Check if it's a group chat
        const group = groupChats.find(g => g.id === callChannelId);
        if (group) {
          channelName = group.name;
        } else {
          // It's a DM - find the other participant
          const otherEmail = Object.keys(members).find(
            email => email !== currentUserEmail && generateDMChannelId(currentUserEmail, email) === callChannelId
          );
          if (otherEmail) {
            channelName = members[otherEmail]?.displayName || otherEmail;
          }
        }
      }
      onCallStateChange(callState, callChannelId, channelName);
    }
  }, [callState, callChannelId, onCallStateChange, groupChats, members, currentUserEmail]);

  // Notify parent of active channel changes (for floating widget logic)
  useEffect(() => {
    if (onActiveChannelChange) {
      onActiveChannelChange(activeChannelId);
    }
  }, [activeChannelId, onActiveChannelChange]);

  // Navigate to specific channel when requested (from floating widget expand for regular chat calls)
  useEffect(() => {
    if (navigateToChannelId && navigateToChannelId !== activeChannelId) {
      // Skip navigation for meeting channels (they use standalone overlay, not chat)
      if (navigateToChannelId.startsWith('meeting_')) {
        if (onNavigationComplete) {
          onNavigationComplete();
        }
        return;
      }

      // Navigate to the requested channel
      setActiveChannelId(navigateToChannelId);

      // Determine if this is a DM or group channel and set appropriate selection
      const targetGroup = groupChats.find(g => g.id === navigateToChannelId);
      if (targetGroup) {
        // It's a group channel
        setSelectedGroupId(navigateToChannelId);
        setSelectedMemberEmail(null);
      } else {
        // Check if it matches a DM channel pattern
        const otherMemberEmail = Object.keys(members).find(
          email => email !== currentUserEmail && generateDMChannelId(currentUserEmail, email) === navigateToChannelId
        );
        if (otherMemberEmail) {
          setSelectedMemberEmail(otherMemberEmail);
          setSelectedGroupId(null);
        }
      }

      // Sync callChannelId from active call if navigating to a call's channel
      // This ensures CompactCallWidget shows properly
      const currentCallState = getCallState();
      if (currentCallState.activeCall && currentCallState.activeCall.channelId === navigateToChannelId) {
        setCallChannelId(navigateToChannelId);
      }

      // Expand the call overlay since we're returning to the call's channel
      setIsCallExpanded(true);
      // Notify parent that navigation is complete
      if (onNavigationComplete) {
        onNavigationComplete();
      }
    }
  }, [navigateToChannelId, activeChannelId, onNavigationComplete, groupChats, members, currentUserEmail]);

  // Subscribe to incoming calls
  useEffect(() => {
    if (!hasAccess || !teamId || !currentUserEmail) return;

    // Use lowercase email for consistent Firestore queries
    const unsubscribe = subscribeToIncomingCalls(
      teamId,
      currentUserEmail.toLowerCase(),
      (_call) => {
        // Call state is automatically updated by the subscription
      }
    );

    return () => {
      unsubscribe();
    };
  }, [hasAccess, teamId, currentUserEmail]);

  // Subscribe to group conversations
  useEffect(() => {
    if (!hasAccess || !teamId || !currentUserEmail) {
      return;
    }

    const unsubscribe = subscribeToGroupConversations(
      teamId,
      currentUserEmail,
      (conversations) => {
        setGroupChats(conversations);
      },
      (error) => {
        console.error('Error subscribing to group conversations:', error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [hasAccess, teamId, currentUserEmail]);

  // Subscribe to DM conversations (to get lastMessageAt, lastMessagePreview)
  useEffect(() => {
    if (!hasAccess || !teamId || !currentUserEmail) {
      return;
    }

    const unsubscribe = subscribeToDMConversations(
      teamId,
      currentUserEmail,
      (conversations) => {
        setDmConversations(conversations);
      },
      (error) => {
        console.error('Error subscribing to DM conversations:', error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [hasAccess, teamId, currentUserEmail]);

  // Presence tracking - start tracking current user and subscribe to team presence
  useEffect(() => {
    if (!hasAccess || !teamId || !currentUserEmail) {
      return;
    }

    // Start tracking current user's presence
    startPresenceTracking(teamId, currentUserEmail);

    // Subscribe to all team members' presence
    const unsubscribe = subscribeToTeamPresence(teamId, (presenceMap) => {
      setOnlineMembers(presenceMap);
    });

    return () => {
      stopPresenceTracking();
      unsubscribe();
    };
  }, [hasAccess, teamId, currentUserEmail]);

  // Reset restore ref when teamId changes
  useEffect(() => {
    hasRestoredRef.current = false;
  }, [teamId]);

  // Save selected chat to localStorage when it changes
  useEffect(() => {
    if (activeChannelId) {
      if (selectedGroupId) {
        // Save group chat
        const data = {
          memberEmail: '',
          channelId: activeChannelId,
          groupId: selectedGroupId,
        };
        console.log('[ChatPersist] Saving group chat:', data);
        setLocalStorage(getSelectedChatKey(), data);
      } else if (selectedMemberEmail) {
        // Save DM chat
        const data = {
          memberEmail: selectedMemberEmail,
          channelId: activeChannelId,
        };
        console.log('[ChatPersist] Saving DM chat:', data);
        setLocalStorage(getSelectedChatKey(), data);
      }
    }
  }, [selectedMemberEmail, selectedGroupId, activeChannelId, teamId]);

  // Restore selected chat on mount (only once after access is confirmed)
  useEffect(() => {
    const restoreChat = async () => {
      console.log('[ChatPersist] Restore check:', {
        hasRestored: hasRestoredRef.current,
        hasAccess,
        loading,
        membersCount: Object.keys(members).length
      });

      // Only restore once per mount
      if (hasRestoredRef.current) return;
      if (!hasAccess || loading || Object.keys(members).length === 0) return;

      hasRestoredRef.current = true;

      const savedChat = getLocalStorage<{ memberEmail: string; channelId: string; groupId?: string } | null>(getSelectedChatKey(), null);
      console.log('[ChatPersist] Saved chat from localStorage:', savedChat);

      if (savedChat) {
        try {
          const { memberEmail, groupId } = savedChat;

          // Restore group chat if saved
          if (groupId) {
            const group = groupChats.find(g => g.id === groupId);
            if (group) {
              console.log('[ChatPersist] Restoring group chat:', groupId);
              setRestoringChat(true);
              setSelectedGroupId(groupId);
              setActiveChannelId(groupId);
              setSelectedMemberEmail(null);
              setRestoringChat(false);
              return;
            }
          }

          // Restore DM chat - use case-insensitive member lookup with decoded email keys
          // Members object has encoded keys (e.g., "user_AT_gmail_DOT_com")
          // The saved memberEmail is decoded (e.g., "user@gmail.com")
          if (memberEmail) {
            const memberKey = Object.keys(members).find(
              encodedEmail => decodeEmailKey(encodedEmail) === memberEmail.toLowerCase()
            );
            console.log('[ChatPersist] Looking for member:', memberEmail, '-> found:', memberKey);

            // Only restore if the member is still in the team (compare decoded emails)
            const decodedMemberKey = memberKey ? decodeEmailKey(memberKey) : '';
            if (memberKey && decodedMemberKey !== currentUserEmail.toLowerCase()) {
              console.log('[ChatPersist] Restoring DM chat with:', decodedMemberKey);
              setRestoringChat(true);
              // Use decoded email for consistency with handleSelectMember
              setSelectedMemberEmail(decodedMemberKey);
              setSelectedGroupId(null);
              // Re-fetch or verify the channel exists (use decoded email)
              const verifiedChannelId = await getOrCreateDMChannel(teamId, currentUserEmail, decodedMemberKey);
              setActiveChannelId(verifiedChannelId);
              setRestoringChat(false);
              console.log('[ChatPersist] DM chat restored, channelId:', verifiedChannelId);
            }
          }
        } catch (err) {
          console.error('[ChatPersist] Error restoring chat:', err);
          removeLocalStorage(getSelectedChatKey());
          setRestoringChat(false);
        }
      }
    };

    restoreChat();
  }, [hasAccess, loading, teamId, members, currentUserEmail, groupChats]);

  // Check if team has access to chat
  useEffect(() => {
    const checkAccess = async () => {
      try {
        // Grant access if subscription is active OR has promo access
        if (subscriptionStatus === 'active' || hasPromoAccess) {
          setHasAccess(true);
          setLoading(false);
          return;
        }

        const access = await canAccessChat(teamId);
        setHasAccess(access);
        setLoading(false);
      } catch (err) {
        console.error('Error checking chat access:', err);
        setHasAccess(false);
        setLoading(false);
      }
    };

    checkAccess();
  }, [teamId, subscriptionStatus, hasPromoAccess]);

  // Subscribe to group conversations
  useEffect(() => {
    if (!hasAccess || !teamId || !currentUserEmail) return;

    const unsubscribe = subscribeToGroupConversations(
      teamId,
      currentUserEmail,
      (groups) => {
        setGroupChats(groups);
      },
      (err) => {
        console.error('Error subscribing to groups:', err);
      }
    );

    return () => unsubscribe();
  }, [hasAccess, teamId, currentUserEmail]);

  // Tauri native file drop handling (for files dragged from OS file explorer)
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupTauriDragDrop = async () => {
      try {
        const appWindow = getCurrentWindow();
        unlisten = await appWindow.onDragDropEvent((event) => {
          console.log('[TAURI DRAG] Event:', event.payload.type, event.payload);

          // Check if position is over a specific element
          const checkIsOverElement = (position: { x: number; y: number } | undefined, selector: string): boolean => {
            if (!position) return false;
            const element = document.querySelector(selector);
            if (!element) return false;
            const rect = element.getBoundingClientRect();
            return (
              position.x >= rect.left &&
              position.x <= rect.right &&
              position.y >= rect.top &&
              position.y <= rect.bottom
            );
          };

          if (event.payload.type === 'enter' || event.payload.type === 'over') {
            const position = event.payload.position;
            // Check if over the message thread area (not header or input)
            const isOverChatThread = checkIsOverElement(position, '.chat-thread-wrapper');
            const isOverSidebar = checkIsOverElement(position, '.sidebar-content');
            const isOverUploadModal = checkIsOverElement(position, '.chat-file-upload-overlay');

            // Handle chat overlay - directly set based on position (no stale closure issue)
            setPanelDragOver(isOverChatThread && !isOverUploadModal);

            // Emit custom event for file upload modal drag indicator
            window.dispatchEvent(new CustomEvent('file-upload-modal-drag', {
              detail: { isDragging: isOverUploadModal, position }
            }));

            // Emit custom event for sidebar drag indicator
            window.dispatchEvent(new CustomEvent('sidebar-external-drag', {
              detail: { isDragging: isOverSidebar, position }
            }));
          } else if (event.payload.type === 'leave') {
            // User left the window - hide all overlays
            setPanelDragOver(false);
            dragCounterRef.current = 0;
            // Also notify sidebar to hide its indicator
            window.dispatchEvent(new CustomEvent('sidebar-external-drag', { detail: { isDragging: false } }));
            // Also notify upload modal to hide its indicator
            window.dispatchEvent(new CustomEvent('file-upload-modal-drag', { detail: { isDragging: false } }));
          } else if (event.payload.type === 'drop') {
            // Files were dropped
            console.log('[TAURI DRAG] Drop - files:', event.payload.paths, 'position:', event.payload.position);
            setPanelDragOver(false);
            // Hide sidebar indicator on drop
            window.dispatchEvent(new CustomEvent('sidebar-external-drag', { detail: { isDragging: false } }));
            // Hide upload modal indicator on drop
            window.dispatchEvent(new CustomEvent('file-upload-modal-drag', { detail: { isDragging: false } }));

            const dropPosition = event.payload.position;
            const filePaths = event.payload.paths;

            // Check if drop is over the file upload modal - if so, dispatch to modal handler
            if (dropPosition) {
              const uploadModalElement = document.querySelector('.chat-file-upload-overlay');
              if (uploadModalElement) {
                const modalRect = uploadModalElement.getBoundingClientRect();
                const isOverModal = (
                  dropPosition.x >= modalRect.left &&
                  dropPosition.x <= modalRect.right &&
                  dropPosition.y >= modalRect.top &&
                  dropPosition.y <= modalRect.bottom
                );
                if (isOverModal && filePaths && filePaths.length > 0) {
                  console.log('[TAURI DRAG] Drop is over file upload modal, dispatching to modal handler');
                  window.dispatchEvent(new CustomEvent('file-upload-modal-drop', {
                    detail: { paths: filePaths, position: dropPosition }
                  }));
                  return;
                }
              }
            }

            // Check if drop is over the sidebar - if so, dispatch to sidebar handler
            if (dropPosition) {
              const sidebarElement = document.querySelector('.sidebar-content');
              if (sidebarElement) {
                const sidebarRect = sidebarElement.getBoundingClientRect();
                const isOverSidebar = (
                  dropPosition.x >= sidebarRect.left &&
                  dropPosition.x <= sidebarRect.right &&
                  dropPosition.y >= sidebarRect.top &&
                  dropPosition.y <= sidebarRect.bottom
                );
                if (isOverSidebar) {
                  console.log('[TAURI DRAG] Drop is over sidebar, dispatching to sidebar handler');
                  window.dispatchEvent(new CustomEvent('sidebar-external-drop', {
                    detail: { paths: filePaths, position: dropPosition }
                  }));
                  return;
                }
              }
            }

            // Check if drop position is over the chat-thread-wrapper element
            if (dropPosition) {
              const chatThreadElement = document.querySelector('.chat-thread-wrapper');
              if (chatThreadElement) {
                const rect = chatThreadElement.getBoundingClientRect();
                const isOverChatThread = (
                  dropPosition.x >= rect.left &&
                  dropPosition.x <= rect.right &&
                  dropPosition.y >= rect.top &&
                  dropPosition.y <= rect.bottom
                );
                if (!isOverChatThread) {
                  console.log('[TAURI DRAG] Drop position is outside chat thread, ignoring');
                  return;
                }
              }
            }

            if (!activeChannelId) {
              console.log('[TAURI DRAG] No active channel, ignoring drop');
              return;
            }

            // Convert file paths to File objects with actual content
            if (filePaths && filePaths.length > 0) {
              // Read actual file content using Tauri's fs API
              const readFiles = async () => {
                const files: File[] = [];
                for (const path of filePaths) {
                  try {
                    const fileName = path.split(/[/\\]/).pop() || 'file';
                    // Get MIME type from extension
                    const ext = fileName.split('.').pop()?.toLowerCase() || '';
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
                    const mimeType = mimeTypes[ext] || 'application/octet-stream';

                    // Read file as binary using Tauri command
                    const bytes = await invoke<number[]>('read_binary_file', { filePath: path });
                    const uint8Array = new Uint8Array(bytes);
                    const file = new File([uint8Array], fileName, { type: mimeType });
                    console.log('[TAURI DRAG] Read file:', fileName, 'size:', file.size, 'bytes');
                    files.push(file);
                  } catch (err) {
                    console.error('[TAURI DRAG] Failed to read file:', path, err);
                  }
                }
                if (files.length > 0) {
                  setDroppedFiles(files);
                }
              };
              readFiles();
            }
          }
          // Note: 'leave' and 'cancel' are handled above
        });
        console.log('[TAURI DRAG] Event listener registered');
      } catch (err) {
        console.error('[TAURI DRAG] Failed to setup drag/drop:', err);
      }
    };

    setupTauriDragDrop();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [activeChannelId]);

  // Panel-wide drag handlers (for full-screen drop zone indicator)
  const handlePanelDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    console.log('[DRAG] Enter - counter:', dragCounterRef.current, 'types:', Array.from(e.dataTransfer.types));
    // Show overlay on any drag enter - browsers restrict type access during drag for security
    // We'll validate that it's actually files on drop
    if (dragCounterRef.current === 1) {
      console.log('[DRAG] Setting panelDragOver to TRUE');
      setPanelDragOver(true);
    }
  }, []);

  const handlePanelDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    console.log('[DRAG] Leave - counter:', dragCounterRef.current);
    if (dragCounterRef.current === 0) {
      console.log('[DRAG] Setting panelDragOver to FALSE');
      setPanelDragOver(false);
    }
  }, []);

  const handlePanelDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Keep showing the overlay while dragging
    if (!panelDragOver && dragCounterRef.current > 0) {
      console.log('[DRAG] DragOver backup - setting panelDragOver to TRUE');
      setPanelDragOver(true);
    }
  }, [panelDragOver]);

  const handlePanelDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[DRAG] Drop - files:', e.dataTransfer.files.length, 'activeChannel:', activeChannelId);
    setPanelDragOver(false);
    dragCounterRef.current = 0;

    // Only process files if there's an active chat
    if (!activeChannelId) {
      console.log('[DRAG] No active channel, ignoring drop');
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    console.log('[DRAG] Processing files:', files.map(f => f.name));
    if (files.length > 0) {
      setDroppedFiles(files);
    }
  }, [activeChannelId]);

  // Clear dropped files after they've been processed by ChatInput
  const handleDroppedFilesProcessed = useCallback(() => {
    setDroppedFiles([]);
  }, []);

  // Get list of other team members with DM conversation data, sorted by last message
  // Filter out current user
  const currentEmailLower = currentUserEmail.toLowerCase();

  const otherMembers = Object.entries(members)
    .filter(([memberEmailKey]) => {
      // Decode the encoded email key for comparison
      const decodedEmail = decodeEmailKey(memberEmailKey);
      // Exclude current user
      return decodedEmail !== currentEmailLower;
    })
    .map(([memberEmail, member]) => {
      // Decode the email key for display and presence lookup
      const decodedEmail = decodeEmailKey(memberEmail);
      // Find the DM conversation for this member
      const dmChannelId = generateDMChannelId(currentUserEmail, decodedEmail);
      const dmConversation = dmConversations.find(c => c.id === dmChannelId);
      const unreadCount = unreadCounts[dmChannelId] || 0;

      return {
        ...member,
        email: decodedEmail,
        lastMessageAt: dmConversation?.lastMessageAt,
        lastMessagePreview: dmConversation?.lastMessagePreview,
        unreadCount,
      };
    })
    .sort((a, b) => {
      // Sort by last message time (most recent first)
      // Members with messages come before members without messages
      if (a.lastMessageAt && b.lastMessageAt) {
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      }
      if (a.lastMessageAt) return -1;
      if (b.lastMessageAt) return 1;
      // Fallback: alphabetical by name
      const nameA = a.displayName || a.email;
      const nameB = b.displayName || b.email;
      return nameA.localeCompare(nameB);
    });

  // Sort group chats by last message time
  const sortedGroupChats = [...groupChats]
    .map(group => ({
      ...group,
      unreadCount: unreadCounts[group.id] || 0,
    }))
    .sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt) {
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      }
      if (a.lastMessageAt) return -1;
      if (b.lastMessageAt) return 1;
      return a.name.localeCompare(b.name);
    });

  // Handle clicking on a team member (DM)
  const handleSelectMember = async (memberEmail: string) => {
    if (loadingChat) return;

    // Clear group selection when selecting a DM
    setSelectedGroupId(null);
    setSelectedMemberEmail(memberEmail);
    setLoadingChat(true);

    try {
      // Get or create DM channel with this member
      const channelId = await getOrCreateDMChannel(teamId, currentUserEmail, memberEmail);
      setActiveChannelId(channelId);
    } catch (err) {
      console.error('Error opening chat:', err);
    } finally {
      setLoadingChat(false);
    }
  };

  // Handle clicking on a group chat
  const handleSelectGroup = (group: Channel) => {
    if (loadingChat) return;

    // Clear DM selection when selecting a group
    setSelectedMemberEmail(null);
    setSelectedGroupId(group.id);
    setActiveChannelId(group.id);
  };

  // Handle creating a new group
  const handleCreateGroup = async (selectedEmails: string[], groupName: string) => {
    try {
      const currentUser = members[currentUserEmail.toLowerCase()];
      const currentUserDisplayName = currentUser?.displayName || currentUserEmail.split('@')[0];

      const channelId = await createGroupChannel(
        teamId,
        groupName,
        selectedEmails,
        currentUserEmail,
        currentUserDisplayName
      );
      // Automatically select the new group
      setSelectedMemberEmail(null);
      setSelectedGroupId(channelId);
      setActiveChannelId(channelId);
    } catch (err) {
      console.error('Error creating group:', err);
      alert('Failed to create group chat');
    }
  };

  // Handle adding members to existing group
  const handleAddMembers = async (newMemberEmails: string[]) => {
    if (!selectedGroup || !activeChannelId) return;
    try {
      const currentUser = members[currentUserEmail.toLowerCase()];
      const currentUserDisplayName = currentUser?.displayName || currentUserEmail.split('@')[0];

      await addMembersToGroup(
        teamId,
        activeChannelId,
        newMemberEmails,
        currentUserEmail,
        currentUserDisplayName
      );
    } catch (err) {
      console.error('Error adding members:', err);
      alert('Failed to add members to group');
    }
  };

  // Get display name for a member
  const getDisplayName = (email: string) => {
    const member = members[email.toLowerCase()];
    return member?.displayName || email.split('@')[0];
  };

  // Get initials for avatar (e.g., "JunSeop Son" → "JS")
  const getInitials = (email: string) => {
    const name = getDisplayName(email);
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Handle file upload from modal
  const handleFileUpload = async (file: File, caption?: string) => {
    if (!activeChannelId) return;

    const currentUser = members[currentUserEmail.toLowerCase()];
    setUploadError(null);

    try {
      // Check if upload is allowed
      const uploadCheck = await checkChatUploadAllowed(teamId, [file]);
      if (!uploadCheck.canUpload) {
        setUploadError(uploadCheck.reason || 'Upload not allowed');
        throw new Error(uploadCheck.reason || 'Upload not allowed');
      }

      // Upload file to Firebase Storage
      console.log('[Chat] Uploading file from modal:', file.name);
      const uploaded = await uploadChatAttachment(
        teamId,
        activeChannelId,
        file,
        currentUserEmail
      );

      // Create attachment object
      const attachment: MessageAttachment = {
        id: uploaded.id,
        name: uploaded.name,
        size: uploaded.size,
        type: uploaded.type,
        url: uploaded.url,
        uploadedAt: new Date(),
        uploadedBy: uploaded.uploadedBy,
      };

      console.log('[Chat] File uploaded:', file.name, '→', uploaded.url);

      // Send message with attachment
      await sendMessage(
        teamId,
        activeChannelId,
        { content: caption || '' },
        currentUserEmail,
        currentUser?.displayName || currentUserEmail.split('@')[0],
        currentUser?.customAvatar || currentUser?.photoURL,
        [attachment]
      );
    } catch (error) {
      console.error('[Chat] Failed to upload file:', file.name, error);
      throw error; // Re-throw so the modal can show error
    }
  };

  // Handle starting a call - show permission modal first (or skip if already granted)
  const handleStartCall = (type: CallType) => {
    if (!activeChannelId) return;

    const participants = selectedGroup
      ? selectedGroup.participants || []
      : selectedMemberEmail
        ? [currentUserEmail, selectedMemberEmail]
        : [];

    if (participants.length < 2) {
      console.error('Not enough participants for a call');
      return;
    }

    // Check if permission was previously granted
    if (hasStoredPermission(type)) {
      // Skip modal and start call directly
      setPendingCallType(type);
      // Use setTimeout to ensure state is set before executeStartCall runs
      setTimeout(() => {
        executeStartCallDirect(type);
      }, 0);
    } else {
      // Show permission modal first
      setPendingCallType(type);
      setShowPermissionModal(true);
    }
  };

  // Execute the call after permission is granted (from modal)
  const executeStartCall = async () => {
    if (!activeChannelId || !pendingCallType) return;

    setShowPermissionModal(false);
    const callType = pendingCallType;
    setPendingCallType(null);

    await executeStartCallDirect(callType);
  };

  // Execute call directly with given type (used when permission is already stored)
  const executeStartCallDirect = async (callType: CallType) => {
    if (!activeChannelId) return;

    const currentUser = members[currentUserEmail.toLowerCase()];
    // Normalize emails to lowercase for consistent Firestore queries
    const participants = selectedGroup
      ? (selectedGroup.participants || []).map(p => p.toLowerCase())
      : selectedMemberEmail
        ? [currentUserEmail.toLowerCase(), selectedMemberEmail.toLowerCase()]
        : [];

    setPendingCallType(null);

    try {
      await startCall(
        teamId,
        activeChannelId,
        participants,
        callType,
        currentUserEmail.toLowerCase(),
        currentUser?.displayName || currentUserEmail.split('@')[0],
        currentUser?.photoURL,
        currentUser?.customAvatar
      );
      // Track which channel the call is in
      setCallChannelId(activeChannelId);
    } catch (error) {
      console.error('Failed to start call:', error);
      alert('Failed to start call. Please check your connection and try again.');
    }
  };

  // Cancel the call if permission is denied
  const handlePermissionDenied = () => {
    setShowPermissionModal(false);
    setPendingCallType(null);
  };

  // Handle accepting incoming call when already in a call (hang up current, answer new)
  const handleAcceptConflictCall = async () => {
    if (!callState.incomingCall) return;
    setShowCallConflict(false);

    const currentUser = members[currentUserEmail.toLowerCase()];
    try {
      // End current call first
      await endCall();
      // Small delay to ensure cleanup
      await new Promise(resolve => setTimeout(resolve, 200));
      // Answer the incoming call
      await answerCall(
        callState.incomingCall,
        currentUserEmail,
        currentUser?.displayName || currentUserEmail
      );
      // Track the new call's channel
      setCallChannelId(callState.incomingCall.channelId);
    } catch (error) {
      console.error('Failed to switch calls:', error);
    }
  };

  // Handle declining incoming call when already in a call (stay on current)
  const handleDeclineConflictCall = async () => {
    if (!callState.incomingCall) return;
    setShowCallConflict(false);

    try {
      await declineCall(callState.incomingCall, currentUserEmail);
    } catch (error) {
      console.error('Failed to decline call:', error);
    }
  };

  // Handle poll creation
  const handleCreatePoll = async (question: string, options: string[], allowMultiple: boolean) => {
    if (!activeChannelId) return;

    const currentUser = members[currentUserEmail.toLowerCase()];

    // Create poll data structure
    const pollId = `poll_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const pollOptions: PollOption[] = options.map((opt, idx) => ({
      id: `opt_${idx}_${Date.now()}`,
      text: opt,
      votes: [],
    }));

    const pollData: Poll = {
      id: pollId,
      question,
      options: pollOptions,
      allowMultiple,
      createdBy: currentUserEmail,
      totalVotes: 0,
    };

    // Send message with poll data
    // Use empty content since poll will be rendered by PollDisplay
    await sendMessage(
      teamId,
      activeChannelId,
      { content: '' },
      currentUserEmail,
      currentUser?.displayName || currentUserEmail.split('@')[0],
      currentUser?.customAvatar || currentUser?.photoURL,
      undefined, // no attachments
      pollData   // poll data
    );

    console.log('Poll created:', question, options, allowMultiple);
  };

  // Handle poll voting
  const handleVotePoll = async (messageId: string, optionId: string) => {
    if (!activeChannelId) return;

    await votePoll(
      teamId,
      activeChannelId,
      messageId,
      optionId,
      currentUserEmail
    );
  };

  // Handle pin message request (show confirmation)
  const handlePinRequest = (message: ChatMessage) => {
    // Check if already pinned
    if (pinnedMessageIds.includes(message.id)) {
      // Already pinned, just open the pinned modal
      setShowPinnedModal(true);
      return;
    }
    setMessageToPin(message);
    setShowPinConfirm(true);
  };

  // Confirm pin message (saves to Firestore, shared with all participants)
  const handleConfirmPin = async () => {
    if (messageToPin && activeChannelId) {
      try {
        await pinMessage(teamId, activeChannelId, messageToPin.id);
        setMessageToPin(null);
        setShowPinConfirm(false);
        // Optionally open the pinned modal to show success
        setShowPinnedModal(true);
      } catch (error) {
        console.error('Failed to pin message:', error);
        alert('Failed to pin message. Please try again.');
      }
    }
  };

  // Unpin message (removes from Firestore)
  const handleUnpinMessage = async (messageId: string) => {
    if (!activeChannelId) return;
    try {
      await unpinMessage(teamId, activeChannelId, messageId);
    } catch (error) {
      console.error('Failed to unpin message:', error);
      alert('Failed to unpin message. Please try again.');
    }
  };

  // Build list of all available channels for sharing
  const getAllChannels = useCallback((): Channel[] => {
    const allChannels: Channel[] = [];

    // Add group channels
    allChannels.push(...groupChats);

    // Create DM channel entries for each team member
    Object.keys(members).forEach(memberEmail => {
      if (memberEmail !== currentUserEmail) {
        const dmChannelId = generateDMChannelId(currentUserEmail, memberEmail);
        const member = members[memberEmail];
        allChannels.push({
          id: dmChannelId,
          teamId: teamId,
          name: member?.displayName || memberEmail.split('@')[0],
          type: 'dm',
          createdBy: currentUserEmail,
          createdAt: new Date(),
          updatedAt: new Date(),
          messageCount: 0,
          participants: [currentUserEmail, memberEmail],
        });
      }
    });

    return allChannels;
  }, [groupChats, members, currentUserEmail, teamId]);

  // Handle sharing an image to another channel
  const handleShareToChat = async (
    imageUrl: string,
    imageName: string,
    targetChannelId: string,
    message?: string
  ) => {
    try {
      const currentUser = members[currentUserEmail.toLowerCase()];

      // Construct the message content
      const content = message
        ? `${message}\n\n📷 Shared: ${imageName}`
        : `📷 Shared: ${imageName}`;

      // Create the attachment from the shared image
      const attachment: MessageAttachment = {
        id: `shared_${Date.now()}`,
        name: imageName,
        size: 0, // Unknown for shared images
        type: 'image/jpeg', // Assume image type
        url: imageUrl,
        uploadedAt: new Date(),
        uploadedBy: currentUserEmail,
      };

      // Send the message with the shared image
      await sendMessage(
        teamId,
        targetChannelId,
        { content },
        currentUserEmail,
        currentUser?.displayName || currentUserEmail.split('@')[0],
        currentUser?.customAvatar || currentUser?.photoURL,
        [attachment]
      );

      console.log(`Image shared to channel: ${targetChannelId}`);
    } catch (error) {
      console.error('Failed to share image:', error);
      throw error;
    }
  };

  // Handle forward message request (show modal)
  const handleForwardRequest = (message: ChatMessage) => {
    setMessageToForward(message);
    setShowForwardModal(true);
  };

  // Handle reply to a message
  const handleReply = (message: ChatMessage) => {
    setReplyingTo(message);
    // Focus the input after setting reply
    setTimeout(() => {
      const textarea = document.querySelector('.chat-input-wrapper textarea') as HTMLTextAreaElement;
      textarea?.focus();
    }, 100);
  };

  // Cancel reply
  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  // Insert content handlers
  const handleInsertNote = () => {
    setInsertMode('note-file');
    setShowInsertModal(true);
  };

  const handleInsertTask = () => {
    setInsertMode('task');
    setShowInsertModal(true);
  };

  const handleInsertMeeting = () => {
    setInsertMode('meeting');
    setShowInsertModal(true);
  };

  const handleInsertRecording = () => {
    setInsertMode('recording');
    setShowInsertModal(true);
  };

  const handleInsertWhiteboard = () => {
    setInsertMode('whiteboard');
    setShowInsertModal(true);
  };

  // Handle content insertion from modal
  const handleInsertContent = async (result: InsertResult) => {
    if (!activeChannelId) return;

    const currentUser = members[currentUserEmail.toLowerCase()];

    try {
      if (result.mode === 'note-file' && result.selectedFile) {
        // Send shared file
        await sendMessage(
          teamId,
          activeChannelId,
          { content: '', replyTo: undefined },
          currentUserEmail,
          currentUser?.displayName || currentUserEmail.split('@')[0],
          currentUser?.customAvatar || currentUser?.photoURL,
          undefined, // attachments
          undefined, // poll
          {
            path: result.selectedFile.path,
            name: result.selectedFile.name,
            type: result.selectedFile.type,
          }
        );
      } else if ((result.mode === 'task' || result.mode === 'meeting') && result.selectedTodo) {
        // Send shared todo
        const todo = result.selectedTodo;
        await sendMessage(
          teamId,
          activeChannelId,
          { content: '', replyTo: undefined },
          currentUserEmail,
          currentUser?.displayName || currentUserEmail.split('@')[0],
          currentUser?.customAvatar || currentUser?.photoURL,
          undefined, // attachments
          undefined, // poll
          undefined, // sharedFile
          undefined, // sharedRecording
          undefined, // forwardedFrom
          {
            todoId: todo.id,
            teamId: teamId,
            text: todo.text,
            type: todo.type,
            priority: todo.priority,
            completed: todo.completed,
            startDate: todo.startDate,
            endDate: todo.endDate,
            assignees: todo.assignees || [],
            meetingDetails: todo.meetingDetails,
            createdBy: todo.createdBy || currentUserEmail,
          }
        );
      } else if (result.mode === 'recording' && result.selectedRecording) {
        // Send shared recording
        const rec = result.selectedRecording;
        await sendMessage(
          teamId,
          activeChannelId,
          { content: '', replyTo: undefined },
          currentUserEmail,
          currentUser?.displayName || currentUserEmail.split('@')[0],
          currentUser?.customAvatar || currentUser?.photoURL,
          undefined, // attachments
          undefined, // poll
          undefined, // sharedFile
          {
            recordingId: rec.id,
            title: rec.channelName,
            type: rec.type,
            duration: rec.duration,
            fileUrl: rec.fileUrl || '',
            createdAt: rec.startedAt ? new Date(rec.startedAt) : new Date(),
          }
        );
      } else if (result.mode === 'whiteboard' && result.selectedWhiteboard) {
        // Send shared whiteboard
        const wb = result.selectedWhiteboard;
        await sendMessage(
          teamId,
          activeChannelId,
          { content: '', replyTo: undefined },
          currentUserEmail,
          currentUser?.displayName || currentUserEmail.split('@')[0],
          currentUser?.customAvatar || currentUser?.photoURL,
          undefined, // attachments
          undefined, // poll
          undefined, // sharedFile
          undefined, // sharedRecording
          undefined, // forwardedFrom
          undefined, // sharedTodo
          {
            whiteboardId: wb.id,
            name: wb.name,
            createdByName: wb.createdByName || currentUserName || 'Unknown',
            createdByEmail: currentUserEmail,
          }
        );
      }
    } catch (error) {
      console.error('Failed to send shared content:', error);
      throw error;
    }
  };

  // Handle forwarding a message to another channel
  const handleForwardMessage = async (
    targetChannelId: string,
    originalMessage: ChatMessage,
    additionalMessage?: string
  ) => {
    try {
      const currentUser = members[currentUserEmail.toLowerCase()];

      // Construct the forwarded message content (just the original content, not the prefix)
      let content = originalMessage.content;
      if (additionalMessage) {
        content = `${additionalMessage}\n\n${content}`;
      }

      // Forward attachments if any
      const forwardedAttachments = originalMessage.attachments?.map(att => ({
        ...att,
        id: `fwd_${att.id}_${Date.now()}`,
      }));

      // Create forwarded from info
      const forwardedFrom = {
        originalSenderName: originalMessage.senderName,
        originalSenderEmail: originalMessage.senderEmail,
      };

      // Send the forwarded message with forwardedFrom metadata
      await sendMessage(
        teamId,
        targetChannelId,
        { content },
        currentUserEmail,
        currentUser?.displayName || currentUserEmail.split('@')[0],
        currentUser?.customAvatar || currentUser?.photoURL,
        forwardedAttachments,
        undefined, // poll
        originalMessage.sharedFile, // forward shared file if any
        originalMessage.sharedRecording, // forward shared recording if any
        forwardedFrom
      );

      console.log(`Message forwarded to channel: ${targetChannelId}`);
    } catch (error) {
      console.error('Failed to forward message:', error);
      throw error;
    }
  };

  // Unpin a message (calls Firestore - shared with all participants)
  const handleUnpin = (messageId: string) => {
    handleUnpinMessage(messageId);
  };

  // Show paywall if no access
  if (hasAccess === false) {
    return (
      <div className="team-chat-panel">
        <div className="chat-paywall">
          <div className="paywall-content">
            <div className="paywall-icon">
              <Lock size={32} className="icon-large" />
            </div>
            <h2>Team Messages is a Pro Feature</h2>
            <p>
              Upgrade to unlock team messaging with direct messages, file sharing, and more.
            </p>

            <div className="paywall-features">
              <div className="paywall-feature">
                <Users size={20} className="feature-icon" />
                <span>Direct messages</span>
              </div>
              <div className="paywall-feature">
                <MessagesSquare size={20} className="feature-icon" />
                <span>Real-time messaging</span>
              </div>
              <div className="paywall-feature">
                <Upload size={20} className="feature-icon" />
                <span>File sharing (500MB per message)</span>
              </div>
              <div className="paywall-feature">
                <Clock size={20} className="feature-icon" />
                <span>Message history</span>
              </div>
            </div>

            {isOwner ? (
              <>
                <button className="upgrade-btn-primary" onClick={onUpgradeClick}>
                  <Sparkles size={18} className="btn-icon" />
                  Upgrade to Pro - $3/user/month
                </button>

                <p className="paywall-note">
                  Includes 100GB cloud sync per team, 500MB per-message file sharing, and unlimited message history
                </p>
              </>
            ) : (
              <p className="paywall-note" style={{ marginTop: '24px' }}>
                Ask your team owner to upgrade to unlock team chat
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show loading state
  if (loading || hasAccess === null) {
    return (
      <div className="team-chat-panel">
        <div className="chat-loading">
          <div className="loading-spinner" />
          <span>Loading chat...</span>
        </div>
      </div>
    );
  }

  // Find selected member with case-insensitive email lookup
  const selectedMember = selectedMemberEmail ? (
    members[selectedMemberEmail] ||
    // Fallback: case-insensitive search
    Object.entries(members).find(([email]) =>
      email.toLowerCase() === selectedMemberEmail.toLowerCase()
    )?.[1] || null
  ) : null;
  // Find group in groupChats
  const selectedGroup = selectedGroupId ? groupChats.find(g => g.id === selectedGroupId) || null : null;

  // Determine if we have an active chat (either DM or group)
  // For DMs, we can show chat even without full member data (just need the channel)
  const hasActiveChat = activeChannelId && (selectedMember || selectedGroup || selectedMemberEmail);

  // Compute mentionable users based on channel type
  const mentionableUsers: MentionableUser[] = (() => {
    if (selectedGroup) {
      // Group chat: All participants except current user
      return (selectedGroup.participants || [])
        .filter(email => email !== currentUserEmail)
        .map(email => ({
          email,
          displayName: members[email]?.displayName,
          photoURL: members[email]?.photoURL,
          customAvatar: members[email]?.customAvatar,
          role: members[email]?.role,
        }));
    } else if (selectedMemberEmail) {
      // DM: Only the other person
      const member = members[selectedMemberEmail];
      return [{
        email: selectedMemberEmail,
        displayName: member?.displayName,
        photoURL: member?.photoURL,
        customAvatar: member?.customAvatar,
        role: member?.role,
      }];
    }
    return [];
  })();

  return (
    <div className="team-chat-panel">
      {/* Sidebar - Team Members List */}
      <div className="chat-sidebar">
        <div className="sidebar-section">
          <div className="section-header">
            <span className="section-title">Team members</span>
            <button
              className="create-group-btn"
              onClick={() => {
                setGroupModalMode('create');
                setShowCreateGroupModal(true);
              }}
              title="Create group chat"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="members-list">
            {/* Current user at the top */}
            {(() => {
              // Get current user's member data - try multiple lookup strategies
              const currentEmailLower = currentUserEmail.toLowerCase();
              let currentUserData = members[currentUserEmail] || members[currentEmailLower];

              // If direct lookup fails, search through all members
              if (!currentUserData) {
                const foundEntry = Object.entries(members).find(([email]) =>
                  email.toLowerCase() === currentEmailLower
                );
                if (foundEntry) {
                  currentUserData = foundEntry[1];
                }
              }

              if (!currentUserData) return null;
              return (
                <div className="member-item current-user-item">
                  <div className="member-avatar">
                    {(currentUserData.customAvatar || currentUserData.photoURL) ? (
                      <img src={currentUserData.customAvatar || currentUserData.photoURL} alt={currentUserData.displayName || currentUserEmail} className="avatar-image" />
                    ) : (
                      getInitials(currentUserEmail)
                    )}
                    <span className="presence-indicator online" />
                  </div>
                  <div className="member-info">
                    <div className="member-name-row">
                      <span className="member-name">{currentUserData.displayName || currentUserEmail.split('@')[0]}</span>
                      <span className="you-badge">you</span>
                    </div>
                  </div>
                </div>
              );
            })()}
            {otherMembers.length === 0 ? (
              <div className="empty-members">
                <p>No other team members yet</p>
              </div>
            ) : (
              otherMembers.map(member => (
                <button
                  key={member.email}
                  className={`member-item ${selectedMemberEmail === member.email ? 'active' : ''} ${member.unreadCount > 0 ? 'has-unread' : ''}`}
                  onClick={() => handleSelectMember(member.email)}
                  disabled={loadingChat}
                >
                  <div className="member-avatar">
                    {(member.customAvatar || member.photoURL) ? (
                      <img src={member.customAvatar || member.photoURL} alt={getDisplayName(member.email)} className="avatar-image" />
                    ) : (
                      getInitials(member.email)
                    )}
                    <span className={`presence-indicator ${onlineMembers.get(member.email) ? 'online' : 'offline'}`} />
                  </div>
                  <div className="member-info">
                    <div className="member-name-row">
                      <span className="member-name">{getDisplayName(member.email)}</span>
                      {member.unreadCount > 0 && (
                        <span className="unread-badge">{member.unreadCount > 99 ? '99+' : member.unreadCount}</span>
                      )}
                    </div>
                    <span className="member-preview">
                      {member.lastMessagePreview?.startsWith('📄 Shared:') ? (
                        <>
                          <FileText size={12} className={`preview-file-icon ${member.lastMessagePreview.endsWith('.md') ? 'note' : 'other'}`} />
                          {member.lastMessagePreview.replace('📄 ', '')}
                        </>
                      ) : member.lastMessagePreview?.startsWith('✅ Task:') || member.lastMessagePreview?.startsWith('[Task]:') ? (
                        <>
                          <CheckSquare size={12} className="preview-task-icon" />
                          {member.lastMessagePreview.replace('✅ ', '').replace('[Task]: ', 'Task: ')}
                        </>
                      ) : member.lastMessagePreview?.startsWith('📅 Meeting:') || member.lastMessagePreview?.startsWith('[Meeting]:') ? (
                        <>
                          <Video size={12} className="preview-meeting-icon" />
                          {member.lastMessagePreview.replace('📅 ', '').replace('[Meeting]: ', 'Meeting: ')}
                        </>
                      ) : (
                        member.lastMessagePreview || (member.role ? `${member.role.charAt(0).toUpperCase()}${member.role.slice(1)}` : 'Member')
                      )}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Group Chats Section */}
        {sortedGroupChats.length > 0 && (
          <div className="sidebar-section">
            <div className="section-header">
              <span className="section-title">Group chats</span>
            </div>
            <div className="members-list">
              {sortedGroupChats.map(group => (
                <button
                  key={group.id}
                  className={`member-item group-item ${selectedGroupId === group.id ? 'active' : ''} ${group.unreadCount > 0 ? 'has-unread' : ''}`}
                  onClick={() => handleSelectGroup(group)}
                  disabled={loadingChat}
                >
                  <div className="member-avatar group-avatar">
                    <Users size={18} className="group-icon" />
                  </div>
                  <div className="member-info">
                    <div className="member-name-row">
                      <span className="member-name">{group.name}</span>
                      {group.unreadCount > 0 && (
                        <span className="unread-badge">{group.unreadCount > 99 ? '99+' : group.unreadCount}</span>
                      )}
                    </div>
                    <span className="member-preview">
                      {group.lastMessagePreview?.startsWith('📄 Shared:') ? (
                        <>
                          <FileText size={12} className={`preview-file-icon ${group.lastMessagePreview.endsWith('.md') ? 'note' : 'other'}`} />
                          {group.lastMessagePreview.replace('📄 ', '')}
                        </>
                      ) : group.lastMessagePreview?.startsWith('✅ Task:') || group.lastMessagePreview?.startsWith('[Task]:') ? (
                        <>
                          <CheckSquare size={12} className="preview-task-icon" />
                          {group.lastMessagePreview.replace('✅ ', '').replace('[Task]: ', 'Task: ')}
                        </>
                      ) : group.lastMessagePreview?.startsWith('📅 Meeting:') || group.lastMessagePreview?.startsWith('[Meeting]:') ? (
                        <>
                          <Video size={12} className="preview-meeting-icon" />
                          {group.lastMessagePreview.replace('📅 ', '').replace('[Meeting]: ', 'Meeting: ')}
                        </>
                      ) : (
                        group.lastMessagePreview || `${Math.max(0, (group.participants?.length || 1) - 1)} others`
                      )}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="chat-main">
        {loadingChat || restoringChat ? (
          <div className="chat-loading">
            <div className="loading-spinner" />
            <span>{restoringChat ? 'Restoring chat...' : 'Opening chat...'}</span>
          </div>
        ) : hasActiveChat ? (
          <>
            {/* Chat Header with user/group name and action buttons */}
            <div className="chat-header">
              <div className="header-left">
                {selectedGroup ? (
                  <>
                    <div className="dm-avatar-small group-avatar-small">
                      <Users size={16} className="group-icon-small" />
                    </div>
                    <div className="header-title-info">
                      <h2 className="channel-title">{selectedGroup.name}</h2>
                      <span className="channel-subtitle">{Math.max(0, (selectedGroup.participants?.length || 1) - 1)} others</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="dm-avatar-small">
                      {(selectedMember?.customAvatar || selectedMember?.photoURL) ? (
                        <img src={selectedMember.customAvatar || selectedMember.photoURL} alt={getDisplayName(selectedMemberEmail!)} className="avatar-image" />
                      ) : (
                        getInitials(selectedMemberEmail!)
                      )}
                    </div>
                    <h2 className="channel-title">
                      {getDisplayName(selectedMemberEmail!)}
                    </h2>
                  </>
                )}
              </div>
              <div className="header-actions">
                {/* Call buttons */}
                <CallButton
                  onStartCall={handleStartCall}
                  disabled={!hasActiveChat}
                  isInCall={!!callState.activeCall}
                />
                <button
                  className="header-action-btn"
                  title="Pinned messages"
                  onClick={() => setShowPinnedModal(true)}
                >
                  <Pin size={18} />
                  {pinnedMessages.length > 0 && (
                    <span className="pin-badge">{pinnedMessages.length}</span>
                  )}
                </button>
                {selectedGroup && (
                  <button
                    className="header-action-btn"
                    title="Add members"
                    onClick={() => {
                      setGroupModalMode('add');
                      setShowCreateGroupModal(true);
                    }}
                  >
                    <UserPlus size={18} />
                  </button>
                )}
                <div className="header-search">
                  <input
                    type="text"
                    placeholder="Search messages..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSearchDropdown(e.target.value.length >= 2);
                    }}
                    onFocus={() => {
                      if (searchQuery.length >= 2) {
                        setShowSearchDropdown(true);
                      }
                    }}
                    className="header-search-input"
                  />
                  <Search size={16} className="header-search-icon" />

                  {/* Search Dropdown */}
                  <MessageSearchDropdown
                    isOpen={showSearchDropdown}
                    searchQuery={searchQuery}
                    messages={chatMessages}
                    channelName={selectedGroup ? selectedGroup.name : (selectedMemberEmail ? getDisplayName(selectedMemberEmail) : '')}
                    onClose={() => setShowSearchDropdown(false)}
                    onJumpToMessage={(messageId) => {
                      setScrollToMessageId(messageId);
                      setShowSearchDropdown(false);
                    }}
                    onClearSearch={() => {
                      setSearchQuery('');
                      setShowSearchDropdown(false);
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Compact Call Widget - shows below header when in a call AND viewing the call's channel */}
            {callState.activeCall && !isCallExpanded && activeChannelId === callChannelId && (
              <CompactCallWidget
                call={callState.activeCall}
                isMuted={callState.isMuted}
                isVideoOff={callState.isVideoOff}
                isScreenSharing={callState.isScreenSharing}
                onExpand={() => setIsCallExpanded(true)}
                userEmail={currentUserEmail}
                userName={members[currentUserEmail]?.displayName || currentUserEmail}
                channelName={
                  selectedGroup ? selectedGroup.name :
                  selectedMemberEmail ? (members[selectedMemberEmail]?.displayName || selectedMemberEmail) :
                  'Unknown Channel'
                }
              />
            )}

            {/* Messages Area with drop overlay */}
            <div
              className="chat-thread-wrapper"
              onDragEnter={handlePanelDragEnter}
              onDragLeave={handlePanelDragLeave}
              onDragOver={handlePanelDragOver}
              onDrop={handlePanelDrop}
            >
              {/* Drop overlay - only covers message area */}
              <div className={`panel-drop-overlay ${panelDragOver ? 'visible' : ''}`}>
                <div className="panel-drop-content">
                  <Upload size={48} />
                  <span className="drop-title">
                    {hasActiveChat ? 'Drop files to upload' : 'Select a chat first'}
                  </span>
                  <span className="drop-subtitle">
                    {hasActiveChat ? 'Files will be attached to your message' : 'Choose a team member to start chatting'}
                  </span>
                </div>
              </div>
              <ChatThread
                teamId={teamId}
                channelId={activeChannelId}
                channelName={selectedGroup ? selectedGroup.name : getDisplayName(selectedMemberEmail!)}
                currentUserEmail={currentUserEmail}
                currentUserDisplayName={members[currentUserEmail]?.displayName || currentUserEmail.split('@')[0]}
                pinnedMessageIds={pinnedMessageIds}
                onEditMessage={async (messageId, content) => {
                  await editMessage(teamId, activeChannelId, messageId, content);
                }}
                onDeleteMessage={async (messageId) => {
                  await deleteMessage(teamId, activeChannelId, messageId);
                  // Also remove from pinned messages if it was pinned
                  handleUnpin(messageId);
                }}
                onAddReaction={async (messageId, emoji) => {
                  await addReaction(teamId, activeChannelId, messageId, emoji, currentUserEmail);
                }}
                onRemoveReaction={async (messageId, emoji) => {
                  await removeReaction(teamId, activeChannelId, messageId, emoji, currentUserEmail);
                }}
                onPinMessage={(message) => handlePinRequest(message)}
                onForwardMessage={(message) => handleForwardRequest(message)}
                onReply={(message) => handleReply(message)}
                validMentions={Object.values(members).map(m => m.displayName || m.email.split('@')[0])}
                channels={getAllChannels()}
                onShareToChat={handleShareToChat}
                onVotePoll={handleVotePoll}
                onOpenSharedFile={onOpenSharedFile}
                onOpenSharedRecording={onOpenSharedRecording}
                onOpenSharedTodo={onOpenSharedTodo}
                onToggleSharedTodo={onToggleSharedTodo}
                onJoinMeeting={onJoinMeetingFromChat}
                onOpenSharedWhiteboard={onOpenSharedWhiteboard}
                teamMembers={members}
                onMessagesChange={setChatMessages}
                scrollToMessageId={scrollToMessageId}
                onScrollComplete={() => setScrollToMessageId(null)}
              />
            </div>

            {/* Upload Error Message */}
            {uploadError && (
              <div className="upload-error-banner">
                <span>{uploadError}</span>
                <button onClick={() => setUploadError(null)}>×</button>
              </div>
            )}

            {/* Message Input */}
            <ChatInput
              channelName={selectedGroup ? selectedGroup.name : getDisplayName(selectedMemberEmail!)}
              channelId={activeChannelId}
              externalFiles={droppedFiles}
              onExternalFilesProcessed={handleDroppedFilesProcessed}
              replyingTo={replyingTo}
              onCancelReply={handleCancelReply}
              onSendMessage={async (content, attachmentFiles) => {
                const currentUser = members[currentUserEmail.toLowerCase()];
                setUploadError(null); // Clear any previous errors

                // Upload attachments to Firebase Storage if present
                let uploadedAttachments: MessageAttachment[] = [];

                if (attachmentFiles && attachmentFiles.length > 0) {
                  // Check if upload is allowed (per-message limit: 15MB per file, 500MB total)
                  const uploadCheck = await checkChatUploadAllowed(teamId, attachmentFiles);
                  if (!uploadCheck.canUpload) {
                    setUploadError(uploadCheck.reason || 'Upload not allowed');
                    return; // Don't proceed with upload
                  }

                  console.log('[Chat] Uploading', attachmentFiles.length, 'attachments...');
                  for (const file of attachmentFiles) {
                    try {
                      const uploaded = await uploadChatAttachment(
                        teamId,
                        activeChannelId,
                        file,
                        currentUserEmail
                      );
                      uploadedAttachments.push({
                        id: uploaded.id,
                        name: uploaded.name,
                        size: uploaded.size,
                        type: uploaded.type,
                        url: uploaded.url,
                        uploadedAt: new Date(),
                        uploadedBy: uploaded.uploadedBy,
                      } as MessageAttachment);
                      console.log('[Chat] Uploaded:', file.name, '→', uploaded.url);
                    } catch (err) {
                      console.error('[Chat] Failed to upload:', file.name, err);
                    }
                  }
                }

                // Send message with attachments (or just text if no attachments)
                const messageContent = content || (uploadedAttachments.length > 0 ? '' : '');
                if (messageContent || uploadedAttachments.length > 0) {
                  await sendMessage(
                    teamId,
                    activeChannelId,
                    { content: messageContent, replyTo: replyingTo?.id },
                    currentUserEmail,
                    currentUser?.displayName || currentUserEmail.split('@')[0],
                    currentUser?.customAvatar || currentUser?.photoURL,
                    uploadedAttachments.length > 0 ? uploadedAttachments : undefined
                  );
                  // Clear reply state after sending
                  setReplyingTo(null);
                }
              }}
              onFileUpload={() => setShowFileUploadModal(true)}
              onCreatePoll={() => setShowPollModal(true)}
              onInsertNote={fileTree.length > 0 ? handleInsertNote : undefined}
              onInsertTask={teamTodos.some(t => t.type !== 'meeting') ? handleInsertTask : undefined}
              onInsertMeeting={teamTodos.some(t => t.type === 'meeting') ? handleInsertMeeting : undefined}
              onInsertRecording={recordings.length > 0 ? handleInsertRecording : undefined}
              onInsertWhiteboard={whiteboards.length > 0 ? handleInsertWhiteboard : undefined}
              mentionableUsers={mentionableUsers}
            />
          </>
        ) : (
          <div className="no-channel-selected">
            <User size={48} className="empty-icon-large" />
            <h3>Select a Chat</h3>
            <p>Choose a team member or group to start chatting</p>
          </div>
        )}
      </div>

      {/* File Upload Modal */}
      <ChatFileUploadModal
        isOpen={showFileUploadModal}
        onClose={() => setShowFileUploadModal(false)}
        onUpload={handleFileUpload}
        maxFileSizeMB={500}
      />

      {/* Create Poll Modal */}
      <CreatePollModal
        isOpen={showPollModal}
        onClose={() => setShowPollModal(false)}
        onCreatePoll={handleCreatePoll}
      />

      {/* Insert Content Modal */}
      <InsertContentModal
        isOpen={showInsertModal}
        onClose={() => setShowInsertModal(false)}
        mode={insertMode}
        fileTree={fileTree}
        tasks={teamTodos}
        recordings={recordings}
        whiteboards={whiteboards}
        currentUserName={currentUserName}
        onInsert={handleInsertContent}
      />

      {/* Pin Confirmation Modal */}
      <ConfirmModal
        isOpen={showPinConfirm}
        title="Pin Message"
        message="Do you want to pin this message to your chat? Pinned messages can be viewed by clicking the pin icon in the header."
        confirmText="Pin"
        cancelText="Cancel"
        variant="confirm"
        onConfirm={handleConfirmPin}
        onCancel={() => {
          setShowPinConfirm(false);
          setMessageToPin(null);
        }}
      />

      {/* Pinned Messages Modal */}
      <PinnedMessagesModal
        isOpen={showPinnedModal}
        onClose={() => setShowPinnedModal(false)}
        pinnedMessages={pinnedMessages}
        onUnpin={handleUnpin}
      />

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={showCreateGroupModal}
        onClose={() => setShowCreateGroupModal(false)}
        members={members}
        currentUserEmail={currentUserEmail}
        onCreateGroup={handleCreateGroup}
        mode={groupModalMode}
        existingParticipants={selectedGroup?.participants || []}
        onAddMembers={handleAddMembers}
      />

      {/* Forward Message Modal */}
      {messageToForward && (
        <ForwardMessageModal
          isOpen={showForwardModal}
          onClose={() => {
            setShowForwardModal(false);
            setMessageToForward(null);
          }}
          message={messageToForward}
          channels={getAllChannels()}
          currentChannelId={activeChannelId || ''}
          currentUserEmail={currentUserEmail}
          members={members}
          onForward={handleForwardMessage}
        />
      )}

      {/* Incoming Call Modal is now handled globally in TeamMainUI */}

      {/* Permission Modal - shown before starting a call */}
      <PermissionModal
        isOpen={showPermissionModal}
        callType={pendingCallType === 'video' ? 'video' : 'voice'}
        onAllow={executeStartCall}
        onDeny={handlePermissionDenied}
      />

      {/* Call Conflict Modal - when receiving call while already in one */}
      {showCallConflict && callState.incomingCall && callState.activeCall && (
        <CallConflictModal
          currentCall={callState.activeCall}
          currentCallName={(() => {
            // Determine current call's channel name
            const group = groupChats.find(g => g.id === callChannelId);
            if (group) return group.name;
            const otherEmail = Object.keys(members).find(
              email => email !== currentUserEmail && generateDMChannelId(currentUserEmail, email) === callChannelId
            );
            return otherEmail ? (members[otherEmail]?.displayName || otherEmail) : 'Current Call';
          })()}
          incomingCall={callState.incomingCall}
          incomingCallName={(() => {
            // Determine incoming call's channel name
            const group = groupChats.find(g => g.id === callState.incomingCall!.channelId);
            if (group) return group.name;
            const otherEmail = Object.keys(members).find(
              email => email !== currentUserEmail && generateDMChannelId(currentUserEmail, email) === callState.incomingCall!.channelId
            );
            return otherEmail ? (members[otherEmail]?.displayName || otherEmail) : 'Incoming Call';
          })()}
          incomingCallerName={callState.incomingCall.initiatorName}
          onAccept={handleAcceptConflictCall}
          onDecline={handleDeclineConflictCall}
        />
      )}

      {/* Active Call Overlay (Full Screen) - only when expanded */}
      {callState.activeCall && isCallExpanded && (
        <CallOverlay
          call={callState.activeCall}
          participants={callState.participants}
          isMuted={callState.isMuted}
          isVideoOff={callState.isVideoOff}
          isScreenSharing={callState.isScreenSharing}
          onMinimize={() => setIsCallExpanded(false)}
          currentUserEmail={currentUserEmail}
          currentUserName={members[currentUserEmail]?.displayName || currentUserEmail.split('@')[0]}
          channelName={(() => {
            // Determine channel name for the active call
            const group = groupChats.find(g => g.id === callChannelId);
            if (group) return group.name;
            const otherEmail = Object.keys(members).find(
              email => email !== currentUserEmail && generateDMChannelId(currentUserEmail, email) === callChannelId
            );
            return otherEmail ? (members[otherEmail]?.displayName || otherEmail) : 'Call';
          })()}
          members={members}
        />
      )}
    </div>
  );
}
