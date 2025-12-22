import React from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  Settings,
  Bell,
  MonitorPlay,
  PenTool,
} from 'lucide-react';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import './IconRail.css';

// Custom Graph icon to match TabBar
const GraphIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <circle cx="12" cy="18" r="2.5" />
    <path d="M8 7.5L10.5 16" />
    <path d="M16 7.5L13.5 16" />
  </svg>
);

interface IconRailProps {
  onDashboardClick: () => void;
  onGraphClick: () => void;
  onTodosClick: () => void;
  onTimelineClick: () => void;
  onChatClick?: () => void; // Optional - only shown in team mode
  onWhiteboardClick?: () => void; // Optional - only shown in team mode
  onRecordingsClick?: () => void; // Optional - only shown in team mode
  onNotificationsClick?: () => void;
  onSettingsClick: () => void;
  activeItem?: 'dashboard' | 'graph' | 'todos' | 'timeline' | 'chat' | 'whiteboard' | 'recordings' | 'notifications' | 'settings' | null;
  notificationCount?: number; // Badge count for unread notifications
  unreadMessageCount?: number; // Badge count for unread chat messages
  newRecordingsCount?: number; // Badge count for new recordings
  hasUpdate?: boolean; // Show update indicator on settings
}

const IconRail: React.FC<IconRailProps> = ({
  onDashboardClick,
  onGraphClick,
  onTodosClick,
  onTimelineClick,
  onChatClick,
  onWhiteboardClick,
  onRecordingsClick,
  onNotificationsClick,
  onSettingsClick,
  activeItem,
  notificationCount = 0,
  unreadMessageCount = 0,
  newRecordingsCount = 0,
  hasUpdate = false
}) => {
  return (
    <div className="icon-rail">
      <div className="icon-rail-top">
        {/* 1. Dashboard */}
        <button
          className={`icon-rail-btn ${activeItem === 'dashboard' ? 'active' : ''}`}
          onClick={onDashboardClick}
          title="Dashboard"
        >
          <LayoutDashboard size={22} />
        </button>
        {/* 2. Graph */}
        <button
          className={`icon-rail-btn ${activeItem === 'graph' ? 'active' : ''}`}
          onClick={onGraphClick}
          title="Graph"
        >
          <GraphIcon size={22} />
        </button>
        {/* 3. Whiteboard (team mode only) */}
        {onWhiteboardClick && (
          <button
            className={`icon-rail-btn ${activeItem === 'whiteboard' ? 'active' : ''}`}
            onClick={onWhiteboardClick}
            title="Whiteboard"
          >
            <PenTool size={22} />
          </button>
        )}
        {/* 4. Todos */}
        <button
          className={`icon-rail-btn ${activeItem === 'todos' ? 'active' : ''}`}
          onClick={onTodosClick}
          title="Todos"
        >
          <CheckSquare size={22} />
        </button>
        {/* 5. Timeline */}
        <button
          className={`icon-rail-btn ${activeItem === 'timeline' ? 'active' : ''}`}
          onClick={onTimelineClick}
          title="Timeline"
        >
          <Calendar size={22} />
        </button>
        {/* 6. Messages (team mode only) */}
        {onChatClick && (
          <button
            className={`icon-rail-btn ${activeItem === 'chat' ? 'active' : ''}`}
            onClick={onChatClick}
            title="Messages"
          >
            <ChatBubbleLeftRightIcon style={{ width: '22px', height: '22px' }} />
            {unreadMessageCount > 0 && (
              <span className="notification-badge">
                {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
              </span>
            )}
          </button>
        )}
        {/* 7. Recordings (team mode only) */}
        {onRecordingsClick && (
          <button
            className={`icon-rail-btn ${activeItem === 'recordings' ? 'active' : ''}`}
            onClick={onRecordingsClick}
            title="Recordings"
          >
            <MonitorPlay size={22} />
            {newRecordingsCount > 0 && (
              <span className="notification-badge">
                {newRecordingsCount > 99 ? '99+' : newRecordingsCount}
              </span>
            )}
          </button>
        )}
      </div>
      <div className="icon-rail-bottom">
        {onNotificationsClick && (
          <button
            className={`icon-rail-btn ${activeItem === 'notifications' ? 'active' : ''}`}
            onClick={onNotificationsClick}
            title="Notifications"
          >
            <Bell size={22} />
            {notificationCount > 0 && (
              <span className="notification-badge">
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            )}
          </button>
        )}
        <button
          className={`icon-rail-btn ${activeItem === 'settings' ? 'active' : ''}`}
          onClick={onSettingsClick}
          title={hasUpdate ? "Settings (Update available)" : "Settings"}
        >
          <Settings size={22} />
          {hasUpdate && <span className="update-dot" />}
        </button>
      </div>
    </div>
  );
};

export default IconRail;
