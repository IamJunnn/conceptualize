import { useState } from 'react';
import { TeamMember } from '../../services/teamService';
import { TeamTodo, TeamTodoFormData, TodoPriority, PRIORITY_CONFIG } from '../../services/teamTodoTypes';
import { createTodo, updateTodo } from '../../services/teamTodoService';
import AssigneeSelector from './AssigneeSelector';
import './AddTeamTodoModal.css';

interface AddTeamTodoModalProps {
  teamId: string;
  members: TeamMember[];
  currentUserEmail: string;
  onClose: () => void;
  onTodoSaved: () => void;
  editingTodo?: TeamTodo | null;
}

export default function AddTeamTodoModal({
  teamId,
  members,
  currentUserEmail,
  onClose,
  onTodoSaved,
  editingTodo,
}: AddTeamTodoModalProps) {
  const isEditing = !!editingTodo;

  const [text, setText] = useState(editingTodo?.text || '');
  const [priority, setPriority] = useState<TodoPriority>(editingTodo?.priority || 4);
  const [startDate, setStartDate] = useState(editingTodo?.startDate || '');
  const [endDate, setEndDate] = useState(editingTodo?.endDate || '');
  const [description, setDescription] = useState(editingTodo?.description || '');
  const [assignees, setAssignees] = useState<string[]>(editingTodo?.assignees || []);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!text.trim()) {
      setError('Task title is required');
      return;
    }

    const formData: TeamTodoFormData = {
      text: text.trim(),
      priority,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      description: description.trim() || undefined,
      assignees,
    };

    try {
      setIsSaving(true);

      if (isEditing) {
        await updateTodo(teamId, editingTodo!.id, formData);
      } else {
        await createTodo(teamId, formData, currentUserEmail);
      }

      onTodoSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to save todo:', err);
      setError(err.message || 'Failed to save task. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content add-team-todo-modal" onClick={e => e.stopPropagation()}>
        <h2>{isEditing ? 'Edit Task' : 'New Team Task'}</h2>

        <form onSubmit={handleSubmit}>
          {/* Title */}
          <div className="form-group">
            <label htmlFor="todoText">Task Title *</label>
            <input
              id="todoText"
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="What needs to be done?"
              disabled={isSaving}
              autoFocus
            />
          </div>

          {/* Priority */}
          <div className="form-group">
            <label>Priority</label>
            <div className="priority-options">
              {([1, 2, 3, 4] as TodoPriority[]).map(p => (
                <button
                  key={p}
                  type="button"
                  className={`priority-btn ${priority === p ? 'selected' : ''}`}
                  style={{
                    '--priority-color': PRIORITY_CONFIG[p].color,
                    '--priority-bg': PRIORITY_CONFIG[p].bgColor,
                  } as React.CSSProperties}
                  onClick={() => setPriority(p)}
                  disabled={isSaving}
                >
                  <span className="priority-dot" />
                  P{p}
                </button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="form-row">
            <div className="form-group half">
              <label htmlFor="startDate">Start Date</label>
              <input
                id="startDate"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                max={endDate || undefined}
                disabled={isSaving}
              />
            </div>
            <div className="form-group half">
              <label htmlFor="endDate">Due Date</label>
              <input
                id="endDate"
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                min={startDate || undefined}
                disabled={isSaving}
              />
            </div>
          </div>

          {/* Assignees */}
          <div className="form-group">
            <label>Assign To</label>
            <AssigneeSelector
              members={Object.values(members)}
              selectedEmails={assignees}
              onChange={setAssignees}
              currentUserEmail={currentUserEmail}
              disabled={isSaving}
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label htmlFor="description">Description (optional)</label>
            <textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add more details..."
              rows={3}
              disabled={isSaving}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSaving || !text.trim()}
            >
              {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
