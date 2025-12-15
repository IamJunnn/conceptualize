import { useState, useEffect } from 'react';
import { Calendar, Video, X } from 'lucide-react';
import './RecurringEventModal.css';

export type RecurringEditScope = 'this' | 'following' | 'all';

interface RecurringEventModalProps {
  todoTitle: string;
  newDate: string;
  meetingTime?: string;
  onConfirm: (scope: RecurringEditScope) => void;
  onCancel: () => void;
}

export default function RecurringEventModal({
  todoTitle,
  newDate,
  meetingTime,
  onConfirm,
  onCancel,
}: RecurringEventModalProps) {
  const [selectedScope, setSelectedScope] = useState<RecurringEditScope>('this');

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
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const options: { value: RecurringEditScope; label: string; description: string }[] = [
    {
      value: 'this',
      label: 'This event',
      description: 'Only change this occurrence',
    },
    {
      value: 'following',
      label: 'This and following events',
      description: 'Change this and all future occurrences',
    },
    {
      value: 'all',
      label: 'All events',
      description: 'Change all occurrences in the series',
    },
  ];

  return (
    <div className="recurring-modal-overlay">
      <div className="recurring-modal">
        <button className="rem-close-btn" onClick={onCancel}>
          <X size={18} />
        </button>

        <div className="rem-header">
          <Video size={24} className="rem-header-icon" />
          <h3>Change Recurring Event</h3>
        </div>

        <div className="rem-content">
          <div className="rem-event-info">
            <div className="rem-event-title">"{todoTitle}"</div>
            <div className="rem-event-date">
              <Calendar size={14} />
              <span>Moving to: {formatDate(newDate)}</span>
              {meetingTime && <span className="rem-meeting-time">at {meetingTime}</span>}
            </div>
          </div>

          <div className="rem-scope-options">
            {options.map((option) => (
              <label
                key={option.value}
                className={`rem-scope-option ${selectedScope === option.value ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="scope"
                  value={option.value}
                  checked={selectedScope === option.value}
                  onChange={() => setSelectedScope(option.value)}
                />
                <div className="rem-option-content">
                  <span className="rem-option-label">{option.label}</span>
                  <span className="rem-option-desc">{option.description}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="rem-actions">
          <button className="rem-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="rem-btn-confirm" onClick={() => onConfirm(selectedScope)}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
