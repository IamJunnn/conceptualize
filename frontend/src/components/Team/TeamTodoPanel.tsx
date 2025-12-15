import { useState, useEffect, useMemo, useRef } from 'react';
import { TeamMember } from '../../services/teamService';
import { TeamTodo, TodoFilter } from '../../services/teamTodoTypes';
import { subscribeToTodos, deleteCompletedTodos } from '../../services/teamTodoService';
import { checkTodoDeadlineNotifications } from '../../services/notificationService';
import { getLocalStorage, setLocalStorage } from '../../hooks/useLocalStorage';
import TeamTodoItem from './TeamTodoItem';
import AddTeamTodoModal from './AddTeamTodoModal';
import MeetingDetailsModal from './MeetingDetailsModal';
import { Plus, ClipboardList, Calendar, Video, Clock, Repeat, Loader } from 'lucide-react';
import { TrashIcon, UserIcon, ClipboardDocumentListIcon, CheckCircleIcon, CalendarDaysIcon, EllipsisVerticalIcon, ArrowUturnRightIcon, PencilIcon } from '@heroicons/react/24/outline';
import { startCall, getCallState } from '../../services/callService';
import './TeamTodoPanel.css';

// Meeting filter types
type MeetingFilter = 'upcoming' | 'past' | 'my-meetings';

// Helper to check if a date is today
function isToday(dateStr: string): boolean {
  const today = new Date();
  const date = new Date(dateStr);
  return date.toDateString() === today.toDateString();
}

// Helper to check if a date is this week
function isThisWeek(dateStr: string): boolean {
  const today = new Date();
  const date = new Date(dateStr);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  return date >= startOfWeek && date < endOfWeek;
}

// Helper to check if a meeting is in the past
function isMeetingPast(meeting: TeamTodo): boolean {
  if (!meeting.endDate && !meeting.startDate) return false;
  const meetingDate = new Date(meeting.endDate || meeting.startDate!);
  if (meeting.meetingDetails?.endTime) {
    const [hours, minutes] = meeting.meetingDetails.endTime.split(':').map(Number);
    meetingDate.setHours(hours, minutes, 0, 0);
  } else {
    meetingDate.setHours(23, 59, 59, 999);
  }
  return meetingDate < new Date();
}

// Helper to check if a meeting is happening now or soon (within 15 minutes)
function isMeetingNowOrSoon(meeting: TeamTodo): 'now' | 'soon' | null {
  if (!meeting.startDate || !meeting.meetingDetails?.startTime) return null;

  const now = new Date();
  const meetingStart = new Date(meeting.startDate);
  const [startHours, startMinutes] = meeting.meetingDetails.startTime.split(':').map(Number);
  meetingStart.setHours(startHours, startMinutes, 0, 0);

  const meetingEnd = new Date(meeting.startDate);
  if (meeting.meetingDetails?.endTime) {
    const [endHours, endMinutes] = meeting.meetingDetails.endTime.split(':').map(Number);
    meetingEnd.setHours(endHours, endMinutes, 0, 0);
  } else {
    meetingEnd.setHours(startHours + 1, startMinutes, 0, 0);
  }

  // Meeting is happening now
  if (now >= meetingStart && now <= meetingEnd) {
    return 'now';
  }

  // Meeting starts within 15 minutes
  const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);
  if (meetingStart > now && meetingStart <= fifteenMinutesFromNow) {
    return 'soon';
  }

  return null;
}

interface TeamTodoPanelProps {
  teamId: string;
  members: { [email: string]: TeamMember };
  currentUserEmail: string;
  onMeetingCallStarted?: () => void; // Called when a meeting call is started to show CallOverlay
  onForwardTodo?: (todo: TeamTodo) => void; // Called when user wants to forward a todo to chat
  initialTab?: 'all' | 'tasks' | 'meetings'; // Initial tab to show
  initialFilter?: TodoFilter; // Initial filter for tasks tab
  highlightTaskId?: string; // Task ID to highlight initially
}

export default function TeamTodoPanel({
  teamId,
  members,
  currentUserEmail,
  onMeetingCallStarted,
  onForwardTodo,
  initialTab,
  initialFilter,
  highlightTaskId,
}: TeamTodoPanelProps) {
  const [todos, setTodos] = useState<TeamTodo[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'tasks' | 'meetings'>(() => {
    if (initialTab) return initialTab;
    return getLocalStorage<'all' | 'tasks' | 'meetings'>(`teamTodoPanel_activeTab_${teamId}`, 'all');
  });
  const [filter, setFilter] = useState<TodoFilter>(() => initialFilter || 'all');
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(highlightTaskId || null);
  const [meetingFilter, setMeetingFilter] = useState<MeetingFilter>('upcoming');
  const [showCompleted, setShowCompleted] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TeamTodo | null>(null);
  const [viewingMeeting, setViewingMeeting] = useState<TeamTodo | null>(null);
  const [meetingMenuId, setMeetingMenuId] = useState<string | null>(null);
  const meetingMenuRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joiningMeetingId, setJoiningMeetingId] = useState<string | null>(null);
  const lastNotificationCheckRef = useRef<number>(0);

  // Save active tab to localStorage when it changes
  useEffect(() => {
    setLocalStorage(`teamTodoPanel_activeTab_${teamId}`, activeTab);
  }, [activeTab, teamId]);

  // Track processed highlight to avoid re-highlighting during same navigation
  const processedHighlightRef = useRef<string | null>(null);

  // Update tab and filter when props change (for navigation from dashboard)
  useEffect(() => {
    // Reset ref when highlightTaskId is cleared (direct navigation)
    if (!highlightTaskId) {
      processedHighlightRef.current = null;
      return;
    }

    // Only process if this is a new highlight request
    if (processedHighlightRef.current !== highlightTaskId) {
      processedHighlightRef.current = highlightTaskId;
      if (initialTab) setActiveTab(initialTab);
      if (initialFilter) setFilter(initialFilter);
      setHighlightedTaskId(highlightTaskId);

      // Clear highlight after 3 seconds
      const timer = setTimeout(() => {
        setHighlightedTaskId(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [initialTab, initialFilter, highlightTaskId]);

  // Scroll to highlighted task
  useEffect(() => {
    if (highlightedTaskId) {
      const element = document.querySelector(`[data-task-id="${highlightedTaskId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightedTaskId, todos]);

  // Close meeting menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (meetingMenuRef.current && !meetingMenuRef.current.contains(e.target as Node)) {
        setMeetingMenuId(null);
      }
    };

    if (meetingMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [meetingMenuId]);

  // Subscribe to real-time updates
  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToTodos(
      teamId,
      (updatedTodos) => {
        setTodos(updatedTodos);
        setLoading(false);

        // Check for deadline notifications (max once per hour)
        const now = Date.now();
        const ONE_HOUR = 60 * 60 * 1000;
        if (now - lastNotificationCheckRef.current > ONE_HOUR) {
          lastNotificationCheckRef.current = now;

          // Only check todos assigned to current user
          const myTodos = updatedTodos
            .filter(t => t.assignees.includes(currentUserEmail))
            .map(t => ({
              id: t.id,
              title: t.text,
              completed: t.completed,
              end_date: t.endDate || null,
            }));

          checkTodoDeadlineNotifications(myTodos);
        }
      },
      (err) => {
        console.error('Subscription error:', err);
        setError('Failed to load tasks. Please refresh.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [teamId, currentUserEmail]);

  // Separate tasks and meetings
  const allTasks = useMemo(() => todos.filter(t => t.type !== 'meeting'), [todos]);
  const allMeetings = useMemo(() => todos.filter(t => t.type === 'meeting'), [todos]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let result = allTasks;

    // Apply filter
    switch (filter) {
      case 'my-tasks':
        result = result.filter(t => t.assignees.includes(currentUserEmail));
        break;
      case 'unassigned':
        result = result.filter(t => t.assignees.length === 0);
        break;
    }

    // Hide completed if toggle is off
    if (!showCompleted) {
      result = result.filter(t => !t.completed);
    }

    // Sort: incomplete first, then by priority, then by due date
    result.sort((a, b) => {
      // Completed items at bottom
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      // Sort by priority (lower number = higher priority)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Sort by due date (earlier dates first, no date at end)
      if (a.endDate && b.endDate) {
        return a.endDate.localeCompare(b.endDate);
      }
      if (a.endDate) return -1;
      if (b.endDate) return 1;
      // Finally by created date (newer first)
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return result;
  }, [allTasks, filter, showCompleted, currentUserEmail]);

  // Filter and group meetings
  const filteredMeetings = useMemo(() => {
    let result = allMeetings;

    // Apply meeting filter
    switch (meetingFilter) {
      case 'upcoming':
        result = result.filter(m => !isMeetingPast(m));
        break;
      case 'past':
        result = result.filter(m => isMeetingPast(m));
        break;
      case 'my-meetings':
        result = result.filter(m => m.assignees.includes(currentUserEmail));
        break;
    }

    // Sort by date/time
    result.sort((a, b) => {
      const dateA = a.startDate || a.endDate || '';
      const dateB = b.startDate || b.endDate || '';
      if (dateA !== dateB) {
        return meetingFilter === 'past'
          ? dateB.localeCompare(dateA) // Past meetings: newest first
          : dateA.localeCompare(dateB); // Upcoming: soonest first
      }
      // Same date, sort by time
      const timeA = a.meetingDetails?.startTime || '00:00';
      const timeB = b.meetingDetails?.startTime || '00:00';
      return meetingFilter === 'past'
        ? timeB.localeCompare(timeA)
        : timeA.localeCompare(timeB);
    });

    return result;
  }, [allMeetings, meetingFilter, currentUserEmail]);

  // Group meetings by time period
  const groupedMeetings = useMemo(() => {
    if (meetingFilter === 'past') {
      return { all: filteredMeetings };
    }

    const today: TeamTodo[] = [];
    const thisWeek: TeamTodo[] = [];
    const later: TeamTodo[] = [];

    filteredMeetings.forEach(meeting => {
      const dateStr = meeting.startDate || meeting.endDate;
      if (!dateStr) {
        later.push(meeting);
      } else if (isToday(dateStr)) {
        today.push(meeting);
      } else if (isThisWeek(dateStr)) {
        thisWeek.push(meeting);
      } else {
        later.push(meeting);
      }
    });

    return { today, thisWeek, later };
  }, [filteredMeetings, meetingFilter]);

  // Counts
  const tasksCount = allTasks.filter(t => !t.completed).length;
  const meetingsCount = allMeetings.filter(m => !isMeetingPast(m)).length;
  const completedTasksCount = allTasks.filter(t => t.completed).length;

  const handleClearCompleted = async () => {
    if (completedTasksCount === 0) return;
    if (!confirm(`Delete ${completedTasksCount} completed task${completedTasksCount > 1 ? 's' : ''}?`)) return;

    try {
      await deleteCompletedTodos(teamId);
    } catch (err) {
      console.error('Failed to clear completed:', err);
    }
  };

  // Handle joining a meeting call
  const handleJoinMeeting = async (meeting: TeamTodo) => {
    // Check if already in a call
    const currentCallState = getCallState();
    if (currentCallState.activeCall) {
      alert('You are already in a call. Please end the current call first.');
      return;
    }

    setJoiningMeetingId(meeting.id);

    try {
      // Get all attendees (including the current user if not already in the list)
      const attendees = meeting.assignees.includes(currentUserEmail)
        ? meeting.assignees
        : [...meeting.assignees, currentUserEmail];

      // Get current user info
      const currentUser = members[currentUserEmail];
      const userName = currentUser?.displayName || currentUserEmail.split('@')[0];
      const userPhotoURL = currentUser?.photoURL;

      // Use a virtual meeting channel ID (no chat channel created)
      const meetingChannelId = `meeting_${meeting.id}`;

      // Start the video call
      await startCall(
        teamId,
        meetingChannelId,
        attendees,
        'video', // Meetings default to video call
        currentUserEmail,
        userName,
        userPhotoURL
      );

      // Notify parent to show the CallOverlay
      onMeetingCallStarted?.();
    } catch (err: any) {
      console.error('Failed to join meeting:', err);
      alert(err.message || 'Failed to join meeting. Please try again.');
    } finally {
      setJoiningMeetingId(null);
    }
  };

  if (loading) {
    return (
      <div className="team-todo-panel">
        <div className="loading-state">
          <div className="loading-spinner" />
          <span>Loading tasks...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="team-todo-panel">
        <div className="error-state">
          <span>{error}</span>
          <button onClick={() => window.location.reload()}>Refresh</button>
        </div>
      </div>
    );
  }

  // Format meeting time for display
  const formatMeetingTime = (meeting: TeamTodo) => {
    if (!meeting.meetingDetails) return '';
    const { startTime, endTime } = meeting.meetingDetails;
    const formatTime = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number);
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    };
    return `${formatTime(startTime)} - ${formatTime(endTime)}`;
  };

  // Format meeting date for display
  const formatMeetingDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }

    const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
    if (date.getFullYear() !== today.getFullYear()) {
      options.year = 'numeric';
    }
    return date.toLocaleDateString('en-US', options);
  };

  // Get repeat icon label
  const getRepeatLabel = (meeting: TeamTodo) => {
    if (!meeting.meetingDetails?.recurrence) return null;
    const type = meeting.meetingDetails.recurrence.type;
    if (type === 'none') return null;
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  // Render a meeting item
  const renderMeetingItem = (meeting: TeamTodo) => {
    const status = isMeetingNowOrSoon(meeting);
    const dateStr = meeting.startDate || meeting.endDate || '';
    const repeatLabel = getRepeatLabel(meeting);

    return (
      <div
        key={meeting.id}
        className={`meeting-item ${status === 'now' ? 'meeting-now' : ''} ${status === 'soon' ? 'meeting-soon' : ''}`}
        onClick={() => setViewingMeeting(meeting)}
      >
        <div
          className="meeting-color-indicator"
          style={{ backgroundColor: meeting.meetingDetails?.color || '#64c8ca' }}
        />
        <div className="meeting-content">
          <div className="meeting-header">
            <span className="meeting-title">{meeting.text}</span>
            {status === 'now' && <span className="meeting-live-badge">LIVE</span>}
            {status === 'soon' && <span className="meeting-soon-badge">Starting soon</span>}
          </div>
          <div className="meeting-details">
            <span className="meeting-datetime">
              {dateStr && formatMeetingDate(dateStr)} · {formatMeetingTime(meeting)}
            </span>
            {repeatLabel && (
              <span className="meeting-repeat">
                <Repeat size={12} />
                {repeatLabel}
              </span>
            )}
          </div>
          {meeting.assignees.length > 0 && (
            <div className="meeting-attendees">
              {meeting.assignees.slice(0, 3).map((email) => {
                // Find member by email (handles encoded Firebase keys)
                const member = members[email] || Object.values(members).find(m => m.email?.toLowerCase() === email.toLowerCase());
                const initials = member?.displayName
                  ? member.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                  : email.substring(0, 2).toUpperCase();
                return (
                  <div key={email} className="attendee-avatar" title={member?.displayName || email}>
                    {(member?.customAvatar || member?.photoURL) ? (
                      <img src={member.customAvatar || member.photoURL} alt={initials} />
                    ) : (
                      initials
                    )}
                  </div>
                );
              })}
              {meeting.assignees.length > 3 && (
                <span className="attendees-more">+{meeting.assignees.length - 3}</span>
              )}
            </div>
          )}
        </div>
        {(status === 'now' || status === 'soon') && (meeting.meetingDetails?.hasVideoRoom !== false) && (
          <button
            className={`join-call-btn ${joiningMeetingId === meeting.id ? 'joining' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleJoinMeeting(meeting);
            }}
            disabled={joiningMeetingId !== null}
          >
            {joiningMeetingId === meeting.id ? (
              <>
                <Loader size={16} className="spin" />
                Joining...
              </>
            ) : (
              <>
                <Video size={16} />
                Join
              </>
            )}
          </button>
        )}

        {/* 3-dot Menu */}
        <div
          className="meeting-menu-container"
          ref={meetingMenuId === meeting.id ? meetingMenuRef : null}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="meeting-menu-btn"
            onClick={(e) => {
              e.stopPropagation();
              setMeetingMenuId(meetingMenuId === meeting.id ? null : meeting.id);
            }}
          >
            <EllipsisVerticalIcon className="menu-icon" />
          </button>

          {meetingMenuId === meeting.id && (
            <div className="meeting-menu">
              {onForwardTodo && (
                <button
                  className="meeting-menu-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    onForwardTodo(meeting);
                    setMeetingMenuId(null);
                  }}
                >
                  <ArrowUturnRightIcon className="item-icon" />
                  Forward
                </button>
              )}
              <button
                className="meeting-menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingTodo(meeting);
                  setMeetingMenuId(null);
                }}
              >
                <PencilIcon className="item-icon" />
                Edit
              </button>
              <button
                className="meeting-menu-item danger"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (confirm('Are you sure you want to delete this meeting?')) {
                    // Delete Google Calendar event if it exists
                    if (meeting.meetingDetails?.calendarEventId) {
                      try {
                        const { deleteCalendarEvent } = await import('../../services/googleCalendarService');
                        await deleteCalendarEvent(meeting.meetingDetails.calendarEventId);
                        console.log('Calendar event deleted');
                      } catch (calendarErr) {
                        console.warn('Failed to delete calendar event:', calendarErr);
                      }
                    }
                    const { deleteTodo } = await import('../../services/teamTodoService');
                    await deleteTodo(teamId, meeting.id);
                  }
                  setMeetingMenuId(null);
                }}
              >
                <TrashIcon className="item-icon" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="team-todo-panel">
      {/* Header with inline tabs */}
      <div className="todo-panel-header">
        <div className="header-left">
          <h2>Team To-dos</h2>
          <div className="header-tabs">
            <button
              className={`header-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              <span>All</span>
            </button>
            <button
              className={`header-tab ${activeTab === 'tasks' ? 'active' : ''}`}
              onClick={() => setActiveTab('tasks')}
            >
              <ClipboardList size={16} />
              <span>Tasks</span>
              <span className="tab-count">{tasksCount}</span>
            </button>
            <button
              className={`header-tab ${activeTab === 'meetings' ? 'active' : ''}`}
              onClick={() => setActiveTab('meetings')}
            >
              <Calendar size={16} />
              <span>Meetings</span>
              <span className="tab-count">{meetingsCount}</span>
            </button>
          </div>
        </div>
        <button
          className="add-todo-btn"
          onClick={() => setShowAddModal(true)}
          title={activeTab === 'meetings' ? 'Schedule Meeting' : 'Add Task'}
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Filters - different for tasks vs meetings */}
      {activeTab !== 'all' && (
        <div className="todo-filters">
          {activeTab === 'tasks' ? (
            <>
              <div className="filter-tabs">
                <button
                  className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  All
                </button>
                <button
                  className={`filter-tab ${filter === 'my-tasks' ? 'active' : ''}`}
                  onClick={() => setFilter('my-tasks')}
                >
                  My Tasks
                </button>
                <button
                  className={`filter-tab ${filter === 'unassigned' ? 'active' : ''}`}
                  onClick={() => setFilter('unassigned')}
                >
                  Unassigned
                </button>
              </div>

              <div className="filter-actions">
                <label className="show-completed-toggle">
                  <input
                    type="checkbox"
                    checked={showCompleted}
                    onChange={e => setShowCompleted(e.target.checked)}
                  />
                  <span>Show done ({completedTasksCount})</span>
                </label>

                {completedTasksCount > 0 && (
                  <button
                    className="clear-completed-btn"
                    onClick={handleClearCompleted}
                    title="Delete completed tasks"
                  >
                    <TrashIcon className="trash-icon" />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="filter-tabs">
              <button
                className={`filter-tab ${meetingFilter === 'upcoming' ? 'active' : ''}`}
                onClick={() => setMeetingFilter('upcoming')}
              >
                Upcoming
              </button>
              <button
                className={`filter-tab ${meetingFilter === 'past' ? 'active' : ''}`}
                onClick={() => setMeetingFilter('past')}
              >
                Past
              </button>
              <button
                className={`filter-tab ${meetingFilter === 'my-meetings' ? 'active' : ''}`}
                onClick={() => setMeetingFilter('my-meetings')}
              >
                My Meetings
              </button>
            </div>
          )}
        </div>
      )}

      {/* Content area */}
      <div className="todo-list">
        {activeTab === 'all' ? (
          /* All - Show both tasks and upcoming meetings */
          allTasks.length === 0 && allMeetings.length === 0 ? (
            <div className="empty-state">
              <ClipboardDocumentListIcon className="empty-icon-svg" />
              <h3>No items yet</h3>
              <p>Create your first task or schedule a meeting</p>
            </div>
          ) : (
            <>
              {/* Upcoming Meetings Section */}
              {(() => {
                const upcomingMeetings = allMeetings.filter(m => !isMeetingPast(m));
                if (upcomingMeetings.length === 0) return null;
                return (
                  <div className="all-section">
                    <div className="all-section-header">
                      <h3>
                        <Calendar size={14} />
                        Upcoming Meetings
                        <span className="section-count">{upcomingMeetings.length}</span>
                      </h3>
                      {upcomingMeetings.length > 3 && (
                        <button
                          className="view-all-btn"
                          onClick={() => setActiveTab('meetings')}
                        >
                          View all {upcomingMeetings.length}
                        </button>
                      )}
                    </div>
                    {upcomingMeetings.slice(0, 3).map(renderMeetingItem)}
                  </div>
                );
              })()}

              {/* Tasks Section */}
              {(() => {
                const incompleteTasks = allTasks.filter(t => !t.completed);
                if (allTasks.length === 0) return null;
                return (
                  <div className="all-section">
                    <div className="all-section-header">
                      <h3>
                        <ClipboardList size={14} />
                        Tasks
                        <span className="section-count">{tasksCount}</span>
                      </h3>
                      {tasksCount > 5 && (
                        <button
                          className="view-all-btn"
                          onClick={() => setActiveTab('tasks')}
                        >
                          View all {tasksCount}
                        </button>
                      )}
                    </div>
                    {incompleteTasks.slice(0, 5).map(todo => (
                      <TeamTodoItem
                        key={todo.id}
                        todo={todo}
                        teamId={teamId}
                        members={members}
                        currentUserEmail={currentUserEmail}
                        onEdit={(t) => setEditingTodo(t)}
                        onDeleted={() => {}}
                        onForward={onForwardTodo}
                        isHighlighted={highlightedTaskId === todo.id}
                      />
                    ))}
                  </div>
                );
              })()}
            </>
          )
        ) : activeTab === 'tasks' ? (
          /* Tasks List */
          filteredTasks.length === 0 ? (
            <div className="empty-state">
              {filter === 'all' && allTasks.length === 0 ? (
                <>
                  <ClipboardDocumentListIcon className="empty-icon-svg" />
                  <h3>No tasks yet</h3>
                  <p>Create your first team task to get started</p>
                </>
              ) : filter === 'my-tasks' ? (
                <>
                  <UserIcon className="empty-icon-svg" />
                  <h3>No tasks assigned to you</h3>
                  <p>Tasks assigned to you will appear here</p>
                </>
              ) : filter === 'unassigned' ? (
                <>
                  <ClipboardDocumentListIcon className="empty-icon-svg" />
                  <h3>No unassigned tasks</h3>
                  <p>All tasks have been assigned</p>
                </>
              ) : (
                <>
                  <CheckCircleIcon className="empty-icon-svg" />
                  <h3>All done!</h3>
                  <p>All tasks have been completed</p>
                </>
              )}
            </div>
          ) : (
            filteredTasks.map(todo => (
              <TeamTodoItem
                key={todo.id}
                todo={todo}
                teamId={teamId}
                members={members}
                currentUserEmail={currentUserEmail}
                onEdit={(t) => setEditingTodo(t)}
                onDeleted={() => {}}
                onForward={onForwardTodo}
                isHighlighted={highlightedTaskId === todo.id}
              />
            ))
          )
        ) : (
          /* Meetings List */
          filteredMeetings.length === 0 ? (
            <div className="empty-state">
              {meetingFilter === 'upcoming' ? (
                <>
                  <CalendarDaysIcon className="empty-icon-svg" />
                  <h3>No upcoming meetings</h3>
                  <p>Schedule a meeting to get your team together</p>
                </>
              ) : meetingFilter === 'past' ? (
                <>
                  <CalendarDaysIcon className="empty-icon-svg" />
                  <h3>No past meetings</h3>
                  <p>Your past meetings will appear here</p>
                </>
              ) : (
                <>
                  <CalendarDaysIcon className="empty-icon-svg" />
                  <h3>No meetings for you</h3>
                  <p>Meetings you're invited to will appear here</p>
                </>
              )}
            </div>
          ) : meetingFilter === 'past' ? (
            /* Past meetings - no grouping */
            <div className="meetings-section">
              {filteredMeetings.map(renderMeetingItem)}
            </div>
          ) : (
            /* Upcoming meetings - grouped by time */
            <>
              {groupedMeetings.today && groupedMeetings.today.length > 0 && (
                <div className="meetings-section">
                  <div className="meetings-section-header">
                    <Clock size={14} />
                    <span>TODAY</span>
                  </div>
                  {groupedMeetings.today.map(renderMeetingItem)}
                </div>
              )}
              {groupedMeetings.thisWeek && groupedMeetings.thisWeek.length > 0 && (
                <div className="meetings-section">
                  <div className="meetings-section-header">
                    <Calendar size={14} />
                    <span>THIS WEEK</span>
                  </div>
                  {groupedMeetings.thisWeek.map(renderMeetingItem)}
                </div>
              )}
              {groupedMeetings.later && groupedMeetings.later.length > 0 && (
                <div className="meetings-section">
                  <div className="meetings-section-header">
                    <Calendar size={14} />
                    <span>LATER</span>
                  </div>
                  {groupedMeetings.later.map(renderMeetingItem)}
                </div>
              )}
            </>
          )
        )}
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingTodo) && (
        <AddTeamTodoModal
          teamId={teamId}
          members={Object.values(members)}
          currentUserEmail={currentUserEmail}
          currentUserName={members[currentUserEmail]?.displayName || currentUserEmail.split('@')[0]}
          onClose={() => {
            setShowAddModal(false);
            setEditingTodo(null);
          }}
          onTodoSaved={() => {}}
          editingTodo={editingTodo}
          defaultType={activeTab === 'meetings' ? 'meeting' : 'task'}
        />
      )}

      {/* Meeting Details Modal */}
      {viewingMeeting && (
        <MeetingDetailsModal
          meeting={viewingMeeting}
          members={members}
          teamId={teamId}
          currentUserEmail={currentUserEmail}
          onClose={() => setViewingMeeting(null)}
          onEdit={(meeting) => {
            setViewingMeeting(null);
            setEditingTodo(meeting);
          }}
          onMeetingCallStarted={onMeetingCallStarted}
        />
      )}
    </div>
  );
}
