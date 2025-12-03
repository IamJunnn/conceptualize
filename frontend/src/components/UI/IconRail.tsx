import React from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  MessageCircle,
  Settings
} from 'lucide-react';
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
  onChatClick: () => void;
  onSettingsClick: () => void;
  activeItem?: 'dashboard' | 'graph' | 'todos' | 'timeline' | 'chat' | 'settings' | null;
}

const IconRail: React.FC<IconRailProps> = ({
  onDashboardClick,
  onGraphClick,
  onTodosClick,
  onTimelineClick,
  onChatClick,
  onSettingsClick,
  activeItem
}) => {
  return (
    <div className="icon-rail">
      <div className="icon-rail-top">
        <button
          className={`icon-rail-btn ${activeItem === 'dashboard' ? 'active' : ''}`}
          onClick={onDashboardClick}
          title="Dashboard"
        >
          <LayoutDashboard size={22} />
        </button>
        <button
          className={`icon-rail-btn ${activeItem === 'graph' ? 'active' : ''}`}
          onClick={onGraphClick}
          title="Graph"
        >
          <GraphIcon size={22} />
        </button>
        <button
          className={`icon-rail-btn ${activeItem === 'todos' ? 'active' : ''}`}
          onClick={onTodosClick}
          title="Todos"
        >
          <CheckSquare size={22} />
        </button>
        <button
          className={`icon-rail-btn ${activeItem === 'timeline' ? 'active' : ''}`}
          onClick={onTimelineClick}
          title="Timeline"
        >
          <Calendar size={22} />
        </button>
        <button
          className={`icon-rail-btn ${activeItem === 'chat' ? 'active' : ''}`}
          onClick={onChatClick}
          title="Chat"
        >
          <MessageCircle size={22} />
        </button>
      </div>
      <div className="icon-rail-bottom">
        <button
          className={`icon-rail-btn ${activeItem === 'settings' ? 'active' : ''}`}
          onClick={onSettingsClick}
          title="Settings"
        >
          <Settings size={22} />
        </button>
      </div>
    </div>
  );
};

export default IconRail;
