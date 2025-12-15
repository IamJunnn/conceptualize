import React from 'react';
import { Bell, MessageCircle, AtSign, CheckSquare, X, Trash2, Users, UserPlus, CreditCard } from 'lucide-react';
import './NotificationsPanel.css';

export interface Notification {
  id: string;
  type: 'mention' | 'reply' | 'todo_reminder' | 'message' | 'group_invite' | 'todo_assigned' | 'member_joined' | 'billing_updated';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  // Optional link to navigate to
  link?: {
    type: 'chat' | 'todo';
    id: string;
  };
}

interface NotificationsPanelProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onNotificationClick?: (notification: Notification) => void;
}

const NotificationsPanel: React.FC<NotificationsPanelProps> = ({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onClearAll,
  onNotificationClick
}) => {
  const unreadCount = notifications.filter(n => !n.read).length;

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'mention':
        return <AtSign size={18} />;
      case 'reply':
      case 'message':
        return <MessageCircle size={18} />;
      case 'todo_reminder':
      case 'todo_assigned':
        return <CheckSquare size={18} />;
      case 'group_invite':
        return <Users size={18} />;
      case 'member_joined':
        return <UserPlus size={18} />;
      case 'billing_updated':
        return <CreditCard size={18} />;
      default:
        return <Bell size={18} />;
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      onMarkAsRead(notification.id);
    }
    if (onNotificationClick) {
      onNotificationClick(notification);
    }
  };

  return (
    <div className="notifications-panel">
      <div className="notifications-header">
        <div className="notifications-title">
          <Bell size={20} />
          <h2>Notifications</h2>
          {unreadCount > 0 && (
            <span className="unread-badge">{unreadCount}</span>
          )}
        </div>
        <div className="notifications-actions">
          <button
            className="notifications-action-btn"
            onClick={onMarkAllAsRead}
            disabled={unreadCount === 0}
            title="Mark all as read"
          >
            Mark all read
          </button>
          <button
            className="notifications-action-btn danger"
            onClick={onClearAll}
            disabled={notifications.length === 0}
            title="Clear all notifications"
          >
            <Trash2 size={14} />
            Clear all
          </button>
        </div>
      </div>

      <div className="notifications-list">
        {notifications.length === 0 ? (
          <div className="notifications-empty">
            <Bell size={48} strokeWidth={1} />
            <p>No notifications</p>
            <span>You're all caught up!</span>
          </div>
        ) : (
          notifications.map(notification => (
            <div
              key={notification.id}
              className={`notification-item ${!notification.read ? 'unread' : ''}`}
              onClick={() => handleNotificationClick(notification)}
            >
              <div className={`notification-icon ${notification.type}`}>
                {getIcon(notification.type)}
              </div>
              <div className="notification-content">
                <div className="notification-title">{notification.title}</div>
                <div className="notification-message">{notification.message}</div>
                <div className="notification-time">{formatTime(notification.timestamp)}</div>
              </div>
              <button
                className="notification-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(notification.id);
                }}
                title="Delete notification"
              >
                <X size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationsPanel;
