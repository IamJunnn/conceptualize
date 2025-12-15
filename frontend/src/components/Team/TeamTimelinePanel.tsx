import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { TeamMember } from '../../services/teamService';
import { TeamTodo, MeetingDetails, TodoType } from '../../services/teamTodoTypes';
import { subscribeToTodos, updateTodo } from '../../services/teamTodoService';
import { createBulkNotifications } from '../../services/teamChatService';
import GanttTimeline, { DragDateChangeResult } from '../Timeline/GanttTimeline';
import DateChangeConfirmModal from '../Timeline/DateChangeConfirmModal';
import RecurringEventModal, { RecurringEditScope } from '../Timeline/RecurringEventModal';
import AddTeamTodoModal from './AddTeamTodoModal';
import MeetingDetailsModal from './MeetingDetailsModal';
import { Plus, ClipboardList, Calendar } from 'lucide-react';
import './TeamTimelinePanel.css';

interface TeamTimelinePanelProps {
  teamId: string;
  members: { [email: string]: TeamMember };
  currentUserEmail: string;
  initialFilter?: 'all' | 'tasks' | 'meetings';
  initialMeetingId?: string;
}

// Convert TeamTodo to the format GanttTimeline expects
interface GanttTodo {
  id: string;
  text: string;
  completed: boolean;
  dueDate?: string;
  startDate?: string;
  createdAt: string;
  linkedNote?: string;
  listId?: string;
  description?: string;
  priority?: number;
  type?: TodoType;
  meetingDetails?: MeetingDetails;
}

interface GanttTodoList {
  id: string;
  name: string;
  icon: string;
  todos: GanttTodo[];
  color?: string;
}

export default function TeamTimelinePanel({
  teamId,
  members,
  currentUserEmail,
  initialFilter,
  initialMeetingId,
}: TeamTimelinePanelProps) {
  const [todos, setTodos] = useState<TeamTodo[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'tasks' | 'meetings'>(() => {
    // Use initialFilter if provided, otherwise check localStorage, then default to 'all'
    if (initialFilter) return initialFilter;
    const saved = localStorage.getItem(`teamSchedule_activeTab_${teamId}`);
    return (saved as 'all' | 'tasks' | 'meetings') || 'all';
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TeamTodo | null>(null);
  const [viewingMeeting, setViewingMeeting] = useState<TeamTodo | null>(null);
  const [defaultType, setDefaultType] = useState<TodoType>('task');
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);

  // Date change via drag state
  const [pendingDateChange, setPendingDateChange] = useState<DragDateChangeResult | null>(null);
  const [showRecurringModal, setShowRecurringModal] = useState(false);

  // Save active tab to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(`teamSchedule_activeTab_${teamId}`, activeTab);
  }, [activeTab, teamId]);

  // Update activeTab when initialFilter prop changes
  useEffect(() => {
    if (initialFilter) {
      setActiveTab(initialFilter);
    }
  }, [initialFilter]);

  // Subscribe to real-time updates
  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToTodos(
      teamId,
      (updatedTodos) => {
        setTodos(updatedTodos);
        setLoading(false);
      },
      (err) => {
        console.error('Subscription error:', err);
        setError('Failed to load tasks. Please refresh.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [teamId]);

  // Track which meeting IDs we've already opened to avoid re-opening on modal close
  const processedMeetingIdRef = useRef<string | null>(null);

  // Auto-open meeting modal when initialMeetingId is provided
  useEffect(() => {
    // Reset ref when initialMeetingId is cleared (direct navigation)
    if (!initialMeetingId) {
      processedMeetingIdRef.current = null;
      return;
    }

    // Only process if this is a new meeting request and todos are loaded
    if (todos.length > 0 && processedMeetingIdRef.current !== initialMeetingId) {
      const meeting = todos.find(t => t.id === initialMeetingId && t.type === 'meeting');
      if (meeting) {
        processedMeetingIdRef.current = initialMeetingId;
        setViewingMeeting(meeting);
      }
    }
  }, [initialMeetingId, todos]);

  // Convert team todos to GanttTimeline format
  const ganttLists: GanttTodoList[] = useMemo(() => {
    // Group todos by assignee for the timeline
    // If unassigned, put in "Unassigned" list
    const assigneeGroups: { [key: string]: GanttTodo[] } = {};

    todos.forEach(todo => {
      const ganttTodo: GanttTodo = {
        id: todo.id,
        text: todo.text,
        completed: todo.completed,
        dueDate: todo.endDate,
        startDate: todo.startDate,
        createdAt: todo.createdAt.toISOString(),
        description: todo.description,
        priority: todo.priority,
        type: todo.type,
        meetingDetails: todo.meetingDetails,
      };

      if (todo.assignees.length === 0) {
        // Unassigned
        if (!assigneeGroups['Unassigned']) {
          assigneeGroups['Unassigned'] = [];
        }
        assigneeGroups['Unassigned'].push(ganttTodo);
      } else {
        // Add to each assignee's list
        // Use email as key to avoid name collisions
        todo.assignees.forEach(email => {
          // Use email as the key to ensure uniqueness
          if (!assigneeGroups[email]) {
            assigneeGroups[email] = [];
          }
          assigneeGroups[email].push(ganttTodo);
        });
      }
    });

    // Convert to list format
    const colors = ['#64c8ca', '#f97316', '#8b5cf6', '#ec4899', '#10b981', '#3b82f6'];
    let colorIndex = 0;

    return Object.entries(assigneeGroups).map(([key, todoList]) => {
      // Find member by email (handles encoded Firebase keys)
      const member = key.includes('@')
        ? members[key] || Object.values(members).find(m => m.email?.toLowerCase() === key.toLowerCase())
        : null;

      return {
        id: key,
        // Use display name if available, otherwise show email prefix for emails, or the key (e.g., "Unassigned")
        name: key.includes('@')
          ? member?.displayName || key.split('@')[0]
          : key,
        icon: '👤',
        todos: todoList,
        color: colors[colorIndex++ % colors.length],
      };
    });
  }, [todos, members]);

  // Count tasks and meetings
  const tasksCount = useMemo(() => todos.filter(t => t.type !== 'meeting' && !t.completed).length, [todos]);
  const meetingsCount = useMemo(() => todos.filter(t => t.type === 'meeting').length, [todos]);

  // Filter gantt lists based on active tab
  const filteredGanttLists = useMemo(() => {
    if (activeTab === 'all') return ganttLists;

    return ganttLists.map(list => ({
      ...list,
      todos: list.todos.filter(todo => {
        if (activeTab === 'tasks') return todo.type !== 'meeting';
        if (activeTab === 'meetings') return todo.type === 'meeting';
        return true;
      }),
    })).filter(list => list.todos.length > 0);
  }, [ganttLists, activeTab]);

  // Handle todo click from timeline
  // Using 'any' because GanttTimeline has its own internal Todo type
  const handleTodoClick = (ganttTodo: any) => {
    // Find the original TeamTodo
    const originalTodo = todos.find(t => t.id === ganttTodo.id);
    if (originalTodo) {
      if (originalTodo.type === 'meeting') {
        // Show meeting details modal for meetings
        setViewingMeeting(originalTodo);
      } else {
        // Show edit modal for tasks
        setEditingTodo(originalTodo);
        setDefaultType(originalTodo.type || 'task');
        setShowAddModal(true);
      }
    }
  };

  // Handle edit from meeting details modal
  const handleEditMeeting = (meeting: TeamTodo) => {
    setViewingMeeting(null);
    setEditingTodo(meeting);
    setDefaultType('meeting');
    setShowAddModal(true);
  };

  const handleAddNew = (date?: Date) => {
    setEditingTodo(null);
    setDefaultType(activeTab === 'meetings' ? 'meeting' : 'task');
    // Convert Date to YYYY-MM-DD string format for the modal
    if (date) {
      const dateStr = date.toISOString().split('T')[0];
      setDefaultDate(dateStr);
    } else {
      setDefaultDate(undefined);
    }
    setShowAddModal(true);
  };

  // Handle drag-and-drop date change
  const handleDateDragEnd = useCallback((result: DragDateChangeResult) => {
    setPendingDateChange(result);
    if (result.isRecurring) {
      setShowRecurringModal(true);
    }
  }, []);

  // Get the current user's name for notifications
  const getCurrentUserName = useCallback(() => {
    const member = members[currentUserEmail];
    return member?.displayName || currentUserEmail.split('@')[0];
  }, [members, currentUserEmail]);

  // Apply the date change and send notifications
  const applyDateChange = useCallback(async (_scope?: RecurringEditScope) => {
    if (!pendingDateChange) return;

    const originalTodo = todos.find(t => t.id === pendingDateChange.todo.id);
    if (!originalTodo) {
      setPendingDateChange(null);
      setShowRecurringModal(false);
      return;
    }

    try {
      await updateTodo(teamId, originalTodo.id, {
        startDate: pendingDateChange.newStartDate,
        endDate: pendingDateChange.newEndDate,
      });

      // Send notifications to assignees (excluding current user)
      const assigneesToNotify = originalTodo.assignees.filter(email => email !== currentUserEmail);
      if (assigneesToNotify.length > 0) {
        const senderName = getCurrentUserName();
        const todoTitle = originalTodo.text.length > 40
          ? originalTodo.text.substring(0, 40) + '...'
          : originalTodo.text;

        const formatDate = (dateStr: string) => {
          const date = new Date(dateStr);
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        };

        const isMeeting = originalTodo.type === 'meeting';
        // Use existing notification types - 'meeting_invite' for meetings, 'todo_assigned' for tasks
        const notificationType = isMeeting ? 'meeting_invite' : 'todo_assigned';
        const notificationTitle = isMeeting ? 'Meeting Rescheduled' : 'Task Date Changed';

        await createBulkNotifications(teamId, assigneesToNotify, {
          type: notificationType,
          title: notificationTitle,
          message: `${senderName} moved "${todoTitle}" to ${formatDate(pendingDateChange.newStartDate)}${
            pendingDateChange.newStartDate !== pendingDateChange.newEndDate
              ? ` - ${formatDate(pendingDateChange.newEndDate)}`
              : ''
          }`,
          senderEmail: currentUserEmail,
          senderName,
          todoId: originalTodo.id,
          todoTitle: originalTodo.text,
        });
      }

      console.log(`✅ Updated ${originalTodo.type || 'task'} dates via drag-and-drop`);
    } catch (err) {
      console.error('Failed to update dates:', err);
    }

    setPendingDateChange(null);
    setShowRecurringModal(false);
  }, [pendingDateChange, todos, teamId, currentUserEmail, getCurrentUserName]);

  // Cancel date change
  const cancelDateChange = useCallback(() => {
    setPendingDateChange(null);
    setShowRecurringModal(false);
  }, []);

  if (loading) {
    return (
      <div className="team-timeline-panel">
        <div className="loading-state">
          <div className="loading-spinner" />
          <span>Loading timeline...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="team-timeline-panel">
        <div className="error-state">
          <span>{error}</span>
          <button onClick={() => window.location.reload()}>Refresh</button>
        </div>
      </div>
    );
  }

  return (
    <div className="team-timeline-panel">
      {/* Header with tabs */}
      <div className="timeline-panel-header">
        <div className="header-left">
          <h2>Team Schedule</h2>
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
          className="add-task-btn"
          onClick={() => handleAddNew()}
          title={activeTab === 'meetings' ? 'Schedule Meeting' : 'Add Task'}
        >
          <Plus size={18} />
        </button>
      </div>

      <GanttTimeline
        lists={filteredGanttLists}
        members={members}
        onTodoClick={handleTodoClick}
        onAddTask={handleAddNew}
        onDateDragEnd={handleDateDragEnd}
      />

      {/* Add/Edit Task or Meeting Modal */}
      {showAddModal && (
        <AddTeamTodoModal
          teamId={teamId}
          members={Object.values(members)}
          currentUserEmail={currentUserEmail}
          onClose={() => {
            setShowAddModal(false);
            setEditingTodo(null);
            setDefaultDate(undefined);
          }}
          onTodoSaved={() => {}}
          editingTodo={editingTodo}
          defaultType={activeTab === 'meetings' ? 'meeting' : defaultType}
          defaultDate={defaultDate}
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
          onEdit={handleEditMeeting}
        />
      )}

      {/* Date Change Confirmation Modal (for regular tasks) */}
      {pendingDateChange && !showRecurringModal && (
        <DateChangeConfirmModal
          todoTitle={pendingDateChange.todo.text}
          oldStartDate={pendingDateChange.oldStartDate}
          oldEndDate={pendingDateChange.oldEndDate}
          newStartDate={pendingDateChange.newStartDate}
          newEndDate={pendingDateChange.newEndDate}
          assignees={todos.find(t => t.id === pendingDateChange.todo.id)?.assignees}
          onConfirm={() => applyDateChange()}
          onCancel={cancelDateChange}
        />
      )}

      {/* Recurring Event Modal (for recurring meetings) */}
      {pendingDateChange && showRecurringModal && (
        <RecurringEventModal
          todoTitle={pendingDateChange.todo.text}
          newDate={pendingDateChange.newStartDate}
          meetingTime={pendingDateChange.todo.meetingDetails?.startTime}
          onConfirm={(scope) => applyDateChange(scope)}
          onCancel={cancelDateChange}
        />
      )}
    </div>
  );
}
