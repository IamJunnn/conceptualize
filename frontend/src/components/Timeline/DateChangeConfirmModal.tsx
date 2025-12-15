import { useEffect } from 'react';
import { Calendar, ArrowRight, Users, X } from 'lucide-react';
import './DateChangeConfirmModal.css';

interface DateChangeConfirmModalProps {
  todoTitle: string;
  oldStartDate: string;
  oldEndDate: string;
  newStartDate: string;
  newEndDate: string;
  assignees?: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DateChangeConfirmModal({
  todoTitle,
  oldStartDate,
  oldEndDate,
  newStartDate,
  newEndDate,
  assignees = [],
  onConfirm,
  onCancel,
}: DateChangeConfirmModalProps) {
  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const hasAssignees = assignees.length > 0;

  return (
    <div className="date-change-modal-overlay">
      <div className="date-change-modal">
        <button className="dcm-close-btn" onClick={onCancel}>
          <X size={18} />
        </button>

        <div className="dcm-header">
          <Calendar size={24} className="dcm-header-icon" />
          <h3>Change Task Date?</h3>
        </div>

        <div className="dcm-content">
          <div className="dcm-todo-title">"{todoTitle}"</div>

          <div className="dcm-date-row">
            <div className="dcm-date-column">
              <span className="dcm-date-label">Start</span>
              <span className="dcm-date-value old">{formatDate(oldStartDate)}</span>
            </div>
            <ArrowRight size={20} className="dcm-arrow" />
            <div className="dcm-date-column">
              <span className="dcm-date-label">New Start</span>
              <span className="dcm-date-value new">{formatDate(newStartDate)}</span>
            </div>
          </div>

          <div className="dcm-date-row">
            <div className="dcm-date-column">
              <span className="dcm-date-label">Due</span>
              <span className="dcm-date-value old">{formatDate(oldEndDate)}</span>
            </div>
            <ArrowRight size={20} className="dcm-arrow" />
            <div className="dcm-date-column">
              <span className="dcm-date-label">New Due</span>
              <span className="dcm-date-value new">{formatDate(newEndDate)}</span>
            </div>
          </div>

          {hasAssignees && (
            <div className="dcm-assignees">
              <Users size={16} />
              <span>
                {assignees.length} assignee{assignees.length > 1 ? 's' : ''} will be notified
              </span>
            </div>
          )}
        </div>

        <div className="dcm-actions">
          <button className="dcm-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="dcm-btn-confirm" onClick={onConfirm}>
            Confirm Change
          </button>
        </div>
      </div>
    </div>
  );
}
