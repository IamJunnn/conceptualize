/**
 * TeamChatPanel - Discord-style chat interface
 * Main container for channels, DMs, and messages
 */

import { useState, useEffect } from 'react';
import { TeamMember } from '../../../services/teamService';
import { Channel } from '../../../services/teamChatTypes';
import {
  subscribeToChannels,
  subscribeToDMConversations,
  initializeTeamChannels,
  sendMessage,
  editMessage,
  deleteMessage,
  addReaction,
} from '../../../services/teamChatService';
import { canAccessChat } from '../../../services/billingService';
import { ChatBubbleLeftRightIcon, LockClosedIcon, SparklesIcon } from '@heroicons/react/24/outline';
import ChatThread from './ChatThread';
import ChatInput from './ChatInput';
import './TeamChatPanel.css';

interface TeamChatPanelProps {
  teamId: string;
  members: { [email: string]: TeamMember };
  currentUserEmail: string;
  onUpgradeClick: () => void;
}

export default function TeamChatPanel({
  teamId,
  members,
  currentUserEmail,
  onUpgradeClick,
}: TeamChatPanelProps) {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [dmConversations, setDmConversations] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if team has access to chat
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const access = await canAccessChat(teamId);
        setHasAccess(access);
      } catch (err) {
        console.error('Error checking chat access:', err);
        setHasAccess(false);
      }
    };

    checkAccess();
  }, [teamId]);

  // Subscribe to channels if team has access
  useEffect(() => {
    if (hasAccess === false) {
      setLoading(false);
      return;
    }

    if (hasAccess === null) {
      return; // Still checking access
    }

    setLoading(true);
    setError(null);

    // Subscribe to channels
    const unsubscribeChannels = subscribeToChannels(
      teamId,
      (updatedChannels) => {
        setChannels(updatedChannels);

        // Auto-select first channel if none selected
        if (!activeChannelId && updatedChannels.length > 0) {
          setActiveChannelId(updatedChannels[0].id);
        }

        // If no channels exist, initialize default channels
        if (updatedChannels.length === 0) {
          initializeTeamChannels(teamId, currentUserEmail).catch(err => {
            console.error('Error initializing channels:', err);
          });
        }

        setLoading(false);
      },
      (err) => {
        console.error('Channels subscription error:', err);
        setError('Failed to load channels');
        setLoading(false);
      }
    );

    // Subscribe to DM conversations
    const unsubscribeDMs = subscribeToDMConversations(
      teamId,
      currentUserEmail,
      (conversations) => {
        setDmConversations(conversations);
      },
      (err) => {
        console.error('DMs subscription error:', err);
      }
    );

    return () => {
      unsubscribeChannels();
      unsubscribeDMs();
    };
  }, [teamId, currentUserEmail, hasAccess, activeChannelId]);

  // Show paywall if no access
  if (hasAccess === false) {
    return (
      <div className="team-chat-panel">
        <div className="chat-paywall">
          <div className="paywall-content">
            <div className="paywall-icon">
              <LockClosedIcon className="icon-large" />
            </div>
            <h2>Team Chat is a Pro Feature</h2>
            <p>
              Upgrade to unlock Discord-style team chat with channels, direct messages,
              file sharing, and more.
            </p>

            <div className="paywall-features">
              <div className="paywall-feature">
                <ChatBubbleLeftRightIcon className="feature-icon" />
                <span>Unlimited channels & DMs</span>
              </div>
              <div className="paywall-feature">
                <SparklesIcon className="feature-icon" />
                <span>Real-time messaging</span>
              </div>
              <div className="paywall-feature">
                <ChatBubbleLeftRightIcon className="feature-icon" />
                <span>File sharing (8MB per file)</span>
              </div>
              <div className="paywall-feature">
                <SparklesIcon className="feature-icon" />
                <span>@mentions & notifications</span>
              </div>
            </div>

            <button className="upgrade-btn-primary" onClick={onUpgradeClick}>
              <SparklesIcon className="btn-icon" />
              Upgrade to Pro - $3/user/month
            </button>

            <p className="paywall-note">
              Includes 20GB storage, unlimited message history, and priority support
            </p>
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

  // Show error state
  if (error) {
    return (
      <div className="team-chat-panel">
        <div className="chat-error">
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  const activeChannel = channels.find(c => c.id === activeChannelId) ||
                       dmConversations.find(c => c.id === activeChannelId);

  return (
    <div className="team-chat-panel">
      {/* Sidebar */}
      <div className="chat-sidebar">
        {/* Channels Section */}
        <div className="sidebar-section">
          <div className="section-header">
            <span className="section-title">Channels</span>
            <button className="add-channel-btn" title="New Channel">+</button>
          </div>
          <div className="channel-list">
            {channels.map(channel => (
              <button
                key={channel.id}
                className={`channel-item ${activeChannelId === channel.id ? 'active' : ''}`}
                onClick={() => setActiveChannelId(channel.id)}
              >
                <span className="channel-hash">#</span>
                <span className="channel-name">{channel.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Direct Messages Section */}
        <div className="sidebar-section">
          <div className="section-header">
            <span className="section-title">Direct Messages</span>
          </div>
          <div className="dm-list">
            {dmConversations.length === 0 ? (
              <div className="empty-dms">
                <p>No conversations yet</p>
              </div>
            ) : (
              dmConversations.map(dm => {
                const otherUserEmail = dm.participants?.find(email => email !== currentUserEmail);
                const otherUser = otherUserEmail ? members[otherUserEmail] : null;
                const displayName = otherUser?.displayName || otherUserEmail?.split('@')[0] || 'Unknown';

                return (
                  <button
                    key={dm.id}
                    className={`dm-item ${activeChannelId === dm.id ? 'active' : ''}`}
                    onClick={() => setActiveChannelId(dm.id)}
                  >
                    <div className="dm-avatar">{displayName.substring(0, 2).toUpperCase()}</div>
                    <span className="dm-name">{displayName}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="chat-main">
        {activeChannel ? (
          <>
            {/* Chat Header */}
            <div className="chat-header">
              <div className="header-left">
                {activeChannel.type === 'text' ? (
                  <>
                    <span className="channel-hash">#</span>
                    <h2 className="channel-title">{activeChannel.name}</h2>
                  </>
                ) : (
                  <>
                    <div className="dm-avatar-small">
                      {activeChannel.participants?.find(email => email !== currentUserEmail)?.substring(0, 2).toUpperCase()}
                    </div>
                    <h2 className="channel-title">
                      {members[activeChannel.participants?.find(email => email !== currentUserEmail) || '']?.displayName || 'Unknown'}
                    </h2>
                  </>
                )}
              </div>
              {activeChannel.description && (
                <p className="channel-description">{activeChannel.description}</p>
              )}
            </div>

            {/* Messages Area */}
            <ChatThread
              teamId={teamId}
              channelId={activeChannel.id}
              currentUserEmail={currentUserEmail}
              onEditMessage={async (messageId, content) => {
                await editMessage(teamId, activeChannel.id, messageId, content);
              }}
              onDeleteMessage={async (messageId) => {
                await deleteMessage(teamId, activeChannel.id, messageId);
              }}
              onAddReaction={async (messageId, emoji) => {
                await addReaction(teamId, activeChannel.id, messageId, emoji, currentUserEmail);
              }}
            />

            {/* Message Input */}
            <ChatInput
              channelName={
                activeChannel.type === 'text'
                  ? activeChannel.name
                  : members[activeChannel.participants?.find(email => email !== currentUserEmail) || '']?.displayName || 'Unknown'
              }
              onSendMessage={async (content) => {
                const currentUser = members[currentUserEmail];
                await sendMessage(
                  teamId,
                  activeChannel.id,
                  { content },
                  currentUserEmail,
                  currentUser?.displayName || currentUserEmail
                );
              }}
            />
          </>
        ) : (
          <div className="no-channel-selected">
            <ChatBubbleLeftRightIcon className="empty-icon-large" />
            <h3>Welcome to Team Chat</h3>
            <p>Select a channel or start a direct message to begin</p>
          </div>
        )}
      </div>
    </div>
  );
}
