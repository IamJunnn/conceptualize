import { useState, useEffect, useMemo } from 'react';
import { TeamMember } from '../../services/teamService';
import { TeamTodo, TodoFilter } from '../../services/teamTodoTypes';
import { subscribeToTodos, deleteCompletedTodos } from '../../services/teamTodoService';
import TeamTodoItem from './TeamTodoItem';
import AddTeamTodoModal from './AddTeamTodoModal';
import { PlusIcon, TrashIcon, UserIcon, ClipboardDocumentListIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import './TeamTodoPanel.css';

interface TeamTodoPanelProps {
  teamId: string;
  members: { [email: string]: TeamMember };
  currentUserEmail: string;
}

export default function TeamTodoPanel({
  teamId,
  members,
  currentUserEmail,
}: TeamTodoPanelProps) {
  const [todos, setTodos] = useState<TeamTodo[]>([]);
  const [filter, setFilter] = useState<TodoFilter>('all');
  const [showCompleted, setShowCompleted] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TeamTodo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Filter todos
  const filteredTodos = useMemo(() => {
    let result = todos;

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
  }, [todos, filter, showCompleted, currentUserEmail]);

  const completedCount = todos.filter(t => t.completed).length;
  const incompleteCount = todos.length - completedCount;

  const handleClearCompleted = async () => {
    if (completedCount === 0) return;
    if (!confirm(`Delete ${completedCount} completed task${completedCount > 1 ? 's' : ''}?`)) return;

    try {
      await deleteCompletedTodos(teamId);
    } catch (err) {
      console.error('Failed to clear completed:', err);
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

  return (
    <div className="team-todo-panel">
      {/* Header */}
      <div className="todo-panel-header">
        <div className="header-left">
          <h2>Team To-dos</h2>
          <span className="task-count">{incompleteCount} task{incompleteCount !== 1 ? 's' : ''}</span>
        </div>
        <button className="add-todo-btn" onClick={() => setShowAddModal(true)}>
          <PlusIcon className="add-icon" />
          Add Task
        </button>
      </div>

      {/* Filters */}
      <div className="todo-filters">
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
            <span>Show done ({completedCount})</span>
          </label>

          {completedCount > 0 && (
            <button
              className="clear-completed-btn"
              onClick={handleClearCompleted}
              title="Delete completed tasks"
            >
              <TrashIcon className="trash-icon" />
            </button>
          )}
        </div>
      </div>

      {/* Todo list */}
      <div className="todo-list">
        {filteredTodos.length === 0 ? (
          <div className="empty-state">
            {filter === 'all' && todos.length === 0 ? (
              <>
                <ClipboardDocumentListIcon className="empty-icon-svg" />
                <h3>No tasks yet</h3>
                <p>Create your first team task to get started</p>
                <button className="create-first-btn" onClick={() => setShowAddModal(true)}>
                  <PlusIcon className="btn-icon" />
                  Create Task
                </button>
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
          filteredTodos.map(todo => (
            <TeamTodoItem
              key={todo.id}
              todo={todo}
              teamId={teamId}
              members={members}
              currentUserEmail={currentUserEmail}
              onEdit={(t) => setEditingTodo(t)}
              onDeleted={() => {}}
            />
          ))
        )}
      </div>

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
