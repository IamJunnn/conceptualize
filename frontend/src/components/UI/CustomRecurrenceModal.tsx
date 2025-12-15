import { useState, useEffect } from 'react';
import { RecurrencePattern, RecurrenceEndType } from '../../services/teamTodoTypes';
import CustomDatePicker from './CustomDatePicker';
import './CustomRecurrenceModal.css';

interface CustomRecurrenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (pattern: RecurrencePattern) => void;
  initialPattern?: RecurrencePattern | null;
  selectedDate?: string | null; // YYYY-MM-DD format for default end date
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function CustomRecurrenceModal({
  isOpen,
  onClose,
  onSave,
  initialPattern,
  selectedDate,
}: CustomRecurrenceModalProps) {
  const [interval, setInterval] = useState(1);
  const [unit, setUnit] = useState<'day' | 'week' | 'month'>('week');
  const [weekDays, setWeekDays] = useState<number[]>([]);
  const [endType, setEndType] = useState<RecurrenceEndType>('never');
  const [endDate, setEndDate] = useState('');
  const [occurrences, setOccurrences] = useState(13);

  // Initialize from selected date
  useEffect(() => {
    if (isOpen && selectedDate) {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay();

      // Set default weekday if no initial pattern
      if (!initialPattern || initialPattern.type !== 'custom') {
        setWeekDays([dayOfWeek]);
      }

      // Set default end date to 3 months from selected date
      const defaultEndDate = new Date(date);
      defaultEndDate.setMonth(defaultEndDate.getMonth() + 3);
      setEndDate(formatDateString(defaultEndDate));
    }
  }, [isOpen, selectedDate, initialPattern]);

  // Initialize from existing pattern
  useEffect(() => {
    if (isOpen && initialPattern && initialPattern.type === 'custom') {
      setInterval(initialPattern.interval || 1);
      setUnit(initialPattern.unit || 'week');
      setWeekDays(initialPattern.weekDays || []);
      setEndType(initialPattern.endType);
      setEndDate(initialPattern.endDate || '');
      setOccurrences(initialPattern.occurrences || 13);
    }
  }, [isOpen, initialPattern]);

  // Reset when closing
  useEffect(() => {
    if (!isOpen) {
      // Don't reset immediately to avoid flash during close animation
    }
  }, [isOpen]);

  const formatDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const stringToDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const dateToString = (date: Date | null): string => {
    if (!date) return '';
    return formatDateString(date);
  };

  const toggleDay = (day: number) => {
    if (weekDays.includes(day)) {
      // Don't allow removing the last day
      if (weekDays.length > 1) {
        setWeekDays(weekDays.filter(d => d !== day));
      }
    } else {
      setWeekDays([...weekDays, day].sort((a, b) => a - b));
    }
  };

  const handleSave = () => {
    const pattern: RecurrencePattern = {
      type: 'custom',
      interval,
      unit,
      weekDays: unit === 'week' ? weekDays : undefined,
      endType,
      endDate: endType === 'on' ? endDate : undefined,
      occurrences: endType === 'after' ? occurrences : undefined,
    };
    onSave(pattern);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="custom-recurrence-overlay">
      <div className="custom-recurrence-modal">
        <h3>Custom recurrence</h3>

        {/* Repeat every */}
        <div className="recurrence-row">
          <label>Repeat every</label>
          <div className="interval-controls">
            <div className="interval-input-wrapper">
              <input
                type="number"
                min={1}
                max={99}
                value={interval}
                onChange={e => setInterval(Math.max(1, Math.min(99, parseInt(e.target.value) || 1)))}
                className="interval-input"
              />
              <div className="interval-arrows">
                <button
                  type="button"
                  className="arrow-btn"
                  onClick={() => setInterval(Math.min(99, interval + 1))}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="arrow-btn"
                  onClick={() => setInterval(Math.max(1, interval - 1))}
                >
                  ▼
                </button>
              </div>
            </div>
            <select
              value={unit}
              onChange={e => setUnit(e.target.value as 'day' | 'week' | 'month')}
              className="unit-select"
            >
              <option value="day">{interval === 1 ? 'day' : 'days'}</option>
              <option value="week">{interval === 1 ? 'week' : 'weeks'}</option>
              <option value="month">{interval === 1 ? 'month' : 'months'}</option>
            </select>
          </div>
        </div>

        {/* Repeat on (only for weeks) */}
        {unit === 'week' && (
          <div className="recurrence-row">
            <label>Repeat on</label>
            <div className="day-toggles">
              {DAY_LABELS.map((label, index) => (
                <button
                  key={index}
                  type="button"
                  className={`day-toggle ${weekDays.includes(index) ? 'selected' : ''}`}
                  onClick={() => toggleDay(index)}
                  title={DAY_NAMES[index]}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ends */}
        <div className="recurrence-row ends-section">
          <label>Ends</label>
          <div className="ends-options">
            <label className="radio-option">
              <input
                type="radio"
                name="endType"
                checked={endType === 'never'}
                onChange={() => setEndType('never')}
              />
              <span className="radio-circle" />
              <span className="radio-label">Never</span>
            </label>

            <label className="radio-option">
              <input
                type="radio"
                name="endType"
                checked={endType === 'on'}
                onChange={() => setEndType('on')}
              />
              <span className="radio-circle" />
              <span className="radio-label">On</span>
              <div className={`date-picker-container ${endType === 'on' ? 'active' : ''}`}>
                <CustomDatePicker
                  selected={stringToDate(endDate)}
                  onChange={(date) => setEndDate(dateToString(date))}
                  minDate={selectedDate ? stringToDate(selectedDate) || new Date() : new Date()}
                  placeholderText="Select end date"
                  disabled={endType !== 'on'}
                />
              </div>
            </label>

            <label className="radio-option">
              <input
                type="radio"
                name="endType"
                checked={endType === 'after'}
                onChange={() => setEndType('after')}
              />
              <span className="radio-circle" />
              <span className="radio-label">After</span>
              <div className={`occurrences-container ${endType === 'after' ? 'active' : ''}`}>
                <div className="occurrences-input-wrapper">
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={occurrences}
                    onChange={e => setOccurrences(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))}
                    className="occurrences-input"
                    disabled={endType !== 'after'}
                  />
                  <div className="interval-arrows">
                    <button
                      type="button"
                      className="arrow-btn"
                      onClick={() => setOccurrences(Math.min(999, occurrences + 1))}
                      disabled={endType !== 'after'}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="arrow-btn"
                      onClick={() => setOccurrences(Math.max(1, occurrences - 1))}
                      disabled={endType !== 'after'}
                    >
                      ▼
                    </button>
                  </div>
                </div>
                <span className="occurrences-label">occurrences</span>
              </div>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="recurrence-actions">
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-done" onClick={handleSave}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
