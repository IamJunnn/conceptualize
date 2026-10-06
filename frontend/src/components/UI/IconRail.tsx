import React from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  Settings,
  Bell,
  MonitorPlay,
  PenTool,
  TableProperties,
  PanelLeftOpen,
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
  onCRMClick?: () => void; // CRM - available in both modes
  onChatClick?: () => void; // Optional - only shown in team mode
  onWhiteboardClick?: () => void; // Optional - only shown in team mode
  onRecordingsClick?: () => void; // Optional - only shown in team mode
  onNotificationsClick?: () => void;
  onSettingsClick: () => void;
  activeItem?: 'dashboard' | 'graph' | 'todos' | 'timeline' | 'crm' | 'chat' | 'whiteboard' | 'recordings' | 'notifications' | 'settings' | null;
  notificationCount?: number; // Badge count for unread notifications
  unreadMessageCount?: number; // Badge count for unread chat messages
  newRecordingsCount?: number; // Badge count for new recordings
  hasUpdate?: boolean; // Show update indicator on settings
  isSidebarCollapsed?: boolean; // Whether sidebar is collapsed
  onSidebarToggle?: () => void; // Toggle sidebar collapsed state
}

const IconRail: React.FC<IconRailProps> = ({
  onDashboardClick,
  onGraphClick,
  onTodosClick,
  onTimelineClick,
  onCRMClick,
  onChatClick,
  onWhiteboardClick,
  onRecordingsClick,
  onNotificationsClick,
  onSettingsClick,
  activeItem,
  notificationCount = 0,
  unreadMessageCount = 0,
  newRecordingsCount = 0,
  hasUpdate = false,
  isSidebarCollapsed = false,
  onSidebarToggle
}) => {
  return (
    <div className="icon-rail">
      <div className="icon-rail-top">
        {/* Sidebar Toggle - only show when collapsed */}
        {onSidebarToggle && isSidebarCollapsed && (
          <button
            className="icon-rail-btn sidebar-toggle icon-only"
            onClick={onSidebarToggle}
            title="Open sidebar"
          >
            <PanelLeftOpen size={22} />
          </button>
        )}
        {/* 1. Dashboard */}
        <button
          className={`icon-rail-btn with-label ${activeItem === 'dashboard' ? 'active' : ''}`}
          onClick={onDashboardClick}
        >
          <LayoutDashboard size={22} />
          <span className="icon-rail-label">Dashboard</span>
        </button>
        {/* 2. Graph */}
        <button
          className={`icon-rail-btn with-label ${activeItem === 'graph' ? 'active' : ''}`}
          onClick={onGraphClick}
        >
          <GraphIcon size={22} />
          <span className="icon-rail-label">Graph</span>
        </button>
        {/* 3. Whiteboard (team mode only) */}
        {onWhiteboardClick && (
          <button
            className={`icon-rail-btn with-label ${activeItem === 'whiteboard' ? 'active' : ''}`}
            onClick={onWhiteboardClick}
          >
            <PenTool size={22} />
            <span className="icon-rail-label">Whiteboard</span>
          </button>
        )}
        {/* 4. Todos */}
        <button
          className={`icon-rail-btn with-label ${activeItem === 'todos' ? 'active' : ''}`}
          onClick={onTodosClick}
        >
          <CheckSquare size={22} />
          <span className="icon-rail-label">Todos</span>
        </button>
        {/* 5. Timeline */}
        <button
          className={`icon-rail-btn with-label ${activeItem === 'timeline' ? 'active' : ''}`}
          onClick={onTimelineClick}
        >
          <Calendar size={22} />
          <span className="icon-rail-label">Timeline</span>
        </button>
        {/* 6. CRM */}
        {onCRMClick && (
          <button
            className={`icon-rail-btn with-label ${activeItem === 'crm' ? 'active' : ''}`}
            onClick={onCRMClick}
          >
            <TableProperties size={22} />
            <span className="icon-rail-label">CRM</span>
          </button>
        )}
        {/* 7. Messages (team mode only) */}
        {onChatClick && (
          <button
            className={`icon-rail-btn with-label ${activeItem === 'chat' ? 'active' : ''}`}
            onClick={onChatClick}
          >
            <div className="icon-wrapper">
              <ChatBubbleLeftRightIcon style={{ width: '22px', height: '22px' }} />
              {unreadMessageCount > 0 && (
                <span className="notification-badge">
                  {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                </span>
              )}
            </div>
            <span className="icon-rail-label">Chat</span>
          </button>
        )}
        {/* 8. Recordings (team mode only) */}
        {onRecordingsClick && (
          <button
            className={`icon-rail-btn with-label ${activeItem === 'recordings' ? 'active' : ''}`}
            onClick={onRecordingsClick}
          >
            <div className="icon-wrapper">
              <MonitorPlay size={22} />
              {newRecordingsCount > 0 && (
                <span className="notification-badge">
                  {newRecordingsCount > 99 ? '99+' : newRecordingsCount}
                </span>
              )}
            </div>
            <span className="icon-rail-label">Recordings</span>
          </button>
        )}
      </div>
      <div className="icon-rail-bottom">
        {onNotificationsClick && (
          <button
            className={`icon-rail-btn icon-only ${activeItem === 'notifications' ? 'active' : ''}`}
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
          className={`icon-rail-btn icon-only ${activeItem === 'settings' ? 'active' : ''}`}
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
