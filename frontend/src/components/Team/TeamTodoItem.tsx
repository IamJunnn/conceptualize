import { useState, useRef, useEffect } from 'react';
import { TeamTodo, PRIORITY_CONFIG, getInitialsFromEmail, formatTodoDate, isTodoOverdue, isTodoDueSoon } from '../../services/teamTodoTypes';
import { TeamMember } from '../../services/teamService';
import { toggleTodo, deleteTodo } from '../../services/teamTodoService';
import { deleteCalendarEvent } from '../../services/googleCalendarService';
import { EllipsisVerticalIcon, TrashIcon, CalendarIcon, ArrowUturnRightIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import ConfirmModal from '../UI/ConfirmModal';
import './TeamTodoItem.css';

interface TeamTodoItemProps {
  todo: TeamTodo;
  teamId: string;
  members: { [email: string]: TeamMember };
  currentUserEmail: string;
  onEdit: (todo: TeamTodo) => void;
  onDeleted: () => void;
  onForward?: (todo: TeamTodo) => void;
  isHighlighted?: boolean;
}

export default function TeamTodoItem({
  todo,
  teamId,
  members,
  currentUserEmail,
  onEdit,
  onDeleted,
  onForward,
  isHighlighted,
}: TeamTodoItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const priorityConfig = PRIORITY_CONFIG[todo.priority];
  const isOverdue = isTodoOverdue(todo);
  const isDueSoon = isTodoDueSoon(todo);

  // Can user edit/delete this todo?
  const canModify =
    todo.createdBy === currentUserEmail ||
    todo.assignees.includes(currentUserEmail) ||
    members[currentUserEmail]?.role === 'owner' ||
    members[currentUserEmail]?.role === 'admin';

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const handleToggle = async () => {
    try {
      await toggleTodo(teamId, todo.id, currentUserEmail);
    } catch (err) {
      console.error('Failed to toggle todo:', err);
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      setIsDeleting(true);
      setShowDeleteConfirm(false);

      // Delete Google Calendar event if it exists (for meetings)
      if (todo.type === 'meeting' && todo.meetingDetails?.calendarEventId) {
        try {
          await deleteCalendarEvent(todo.meetingDetails.calendarEventId);
          console.log('Calendar event deleted');
        } catch (calendarErr) {
          console.warn('Failed to delete calendar event:', calendarErr);
        }
      }

      await deleteTodo(teamId, todo.id);
      onDeleted();
    } catch (err) {
      console.error('Failed to delete todo:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className={`team-todo-item ${todo.completed ? 'completed' : ''} ${isDeleting ? 'deleting' : ''} ${isHighlighted ? 'highlighted' : ''}`}
      data-task-id={todo.id}
    >
      {/* Checkbox */}
      <button
        className={`todo-checkbox ${todo.completed ? 'checked' : ''}`}
        onClick={handleToggle}
        title={todo.completed ? 'Mark as incomplete' : 'Mark as complete'}
      >
        {todo.completed ? (
          <CheckCircleIcon className="todo-check-icon" />
        ) : (
          <div className="empty-circle" />
        )}
      </button>

      {/* Priority indicator */}
      <div
        className="priority-indicator"
        style={{ background: priorityConfig.color }}
        title={priorityConfig.label}
      />

      {/* Content - Click to edit */}
      <div
        className="todo-content"
        onClick={() => canModify && onEdit(todo)}
        style={{ cursor: canModify ? 'pointer' : 'default' }}
      >
        <div className="todo-title">{todo.text}</div>

        <div className="todo-meta">
          {/* Due date */}
          {todo.endDate && (
            <span
              className={`todo-due-date ${isOverdue ? 'overdue' : ''} ${isDueSoon ? 'due-soon' : ''}`}
            >
              <CalendarIcon className="date-icon" />
              {formatTodoDate(todo.endDate)}
            </span>
          )}

          {/* Assignees */}
          {todo.assignees.length > 0 && (
            <div className="todo-assignees">
              {todo.assignees.slice(0, 3).map(email => {
                // Find member by email (handles encoded Firebase keys)
                const member = members[email] || Object.values(members).find(m => m.email?.toLowerCase() === email.toLowerCase());
                const avatarUrl = member?.customAvatar || member?.photoURL;
                return (
                  <div
                    key={email}
                    className="assignee-badge"
                    title={member?.displayName || email}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="assignee-avatar-img" />
                    ) : (
                      getInitialsFromEmail(email)
                    )}
                  </div>
                );
              })}
              {todo.assignees.length > 3 && (
                <span className="more-assignees">+{todo.assignees.length - 3}</span>
              )}
            </div>
          )}

          {/* Completed by */}
          {todo.completed && todo.completedBy && (
            <span className="completed-by">
              ✓ by {members[todo.completedBy]?.displayName?.split(' ')[0] || todo.completedBy.split('@')[0]}
            </span>
          )}
        </div>
      </div>

      {/* Menu */}
      {canModify && (
        <div className="todo-menu-container" ref={menuRef}>
          <button
            className="todo-menu-btn"
            onClick={() => setShowMenu(!showMenu)}
          >
            <EllipsisVerticalIcon className="menu-icon" />
          </button>

          {showMenu && (
            <div className="todo-menu">
              {onForward && (
                <button
                  className="todo-menu-item"
                  onClick={() => {
                    onForward(todo);
                    setShowMenu(false);
                  }}
                >
                  <ArrowUturnRightIcon className="item-icon" />
                  Forward
                </button>
              )}
              <button
                className="todo-menu-item danger"
                onClick={() => {
                  setShowDeleteConfirm(true);
                  setShowMenu(false);
                }}
              >
                <TrashIcon className="item-icon" />
                Delete
              </button>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title={`Delete ${todo.type === 'meeting' ? 'Meeting' : 'Task'}`}
        message={`Are you sure you want to delete "${todo.text}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        isDanger
      />
    </div>
  );
}
