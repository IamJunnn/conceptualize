import { useState, useEffect, useMemo } from 'react';
import { TeamMember } from '../../services/teamService';
import { TeamTodo, getInitialsFromEmail } from '../../services/teamTodoTypes';
import { subscribeToTodos } from '../../services/teamTodoService';
import GanttTimeline from '../Timeline/GanttTimeline';
import AddTeamTodoModal from './AddTeamTodoModal';
import { PlusIcon } from '@heroicons/react/24/outline';
import './TeamTimelinePanel.css';

interface TeamTimelinePanelProps {
  teamId: string;
  members: { [email: string]: TeamMember };
  currentUserEmail: string;
}

// Convert TeamTodo to the format GanttTimeline expects
interface GanttTodo {
  id: string;
  text: string;
  completed: boolean;
  due_date?: string;
  start_date?: string;
  created_at: string;
  linked_note?: string;
  list_id?: string;
  description?: string;
  priority?: number;
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
}: TeamTimelinePanelProps) {
  const [todos, setTodos] = useState<TeamTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TeamTodo | null>(null);

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
        due_date: todo.endDate,
        start_date: todo.startDate,
        created_at: todo.createdAt.toISOString(),
        description: todo.description,
        priority: todo.priority,
      };

      if (todo.assignees.length === 0) {
        // Unassigned
        if (!assigneeGroups['Unassigned']) {
          assigneeGroups['Unassigned'] = [];
        }
        assigneeGroups['Unassigned'].push(ganttTodo);
      } else {
        // Add to each assignee's list
        // Use email as key to avoid name collisions, then store initials for display
        todo.assignees.forEach(email => {
          const initials = getInitialsFromEmail(email);
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

    return Object.entries(assigneeGroups).map(([key, todoList]) => ({
      id: key,
      // Use initials for display if it's an email, otherwise use the key (e.g., "Unassigned")
      name: key.includes('@') ? getInitialsFromEmail(key) : key,
      icon: '👤',
      todos: todoList,
      color: colors[colorIndex++ % colors.length],
    }));
  }, [todos, members]);

  // Handle todo click from timeline
  // Using 'any' because GanttTimeline has its own internal Todo type
  const handleTodoClick = (ganttTodo: any) => {
    // Find the original TeamTodo
    const originalTodo = todos.find(t => t.id === ganttTodo.id);
    if (originalTodo) {
      setEditingTodo(originalTodo);
    }
  };

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

  // Count scheduled vs unscheduled
  const scheduledCount = todos.filter(t => t.endDate).length;

  return (
    <div className="team-timeline-panel">
      {/* Header matching TeamTodoPanel style */}
      <div className="timeline-panel-header">
        <div className="header-left">
          <h2>Team Schedule</h2>
          <span className="task-count">{scheduledCount} task{scheduledCount !== 1 ? 's' : ''}</span>
        </div>
        <button className="add-task-btn" onClick={() => setShowAddModal(true)}>
          <PlusIcon className="add-icon" />
          Add Task
        </button>
      </div>

      <GanttTimeline
        lists={ganttLists}
        onTodoClick={handleTodoClick}
        onAddTask={() => setShowAddModal(true)}
      />

      {/* Add/Edit Modal */}
      {(showAddModal || editingTodo) && (
        <AddTeamTodoModal
          teamId={teamId}
          members={Object.values(members)}
          currentUserEmail={currentUserEmail}
          onClose={() => {
            setShowAddModal(false);
            setEditingTodo(null);
          }}
          onTodoSaved={() => {}}
          editingTodo={editingTodo}
        />
      )}
    </div>
  );
}
