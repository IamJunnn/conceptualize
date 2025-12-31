/**
 * ScheduleCalendar Component
 * A monthly calendar view for viewing/editing work schedules
 * Shows blocks on their respective days
 */

import { useState, useMemo } from 'react';
import {
  TimeBlock,
  DayOfWeek,
  DAY_SHORT_NAMES,
  SCHEDULE_COLORS,
  formatTime12h,
} from '../../services/workScheduleTypes';
import { ChevronLeft, ChevronRight, Plus, X, Trash2 } from 'lucide-react';
import './ScheduleCalendar.css';

interface ScheduleCalendarProps {
  blocks: TimeBlock[];
  onAddBlock: (block: Omit<TimeBlock, 'id'>) => void;
  onUpdateBlock: (blockId: string, updates: Partial<TimeBlock>) => void;
  onDeleteBlock: (blockId: string) => void;
  readOnly?: boolean;
  timezone?: string;
}

// Get days in a month
function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

// Get day of week with Monday = 0
function getDayOfWeekMondayStart(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

export default function ScheduleCalendar({
  blocks,
  onAddBlock,
  onUpdateBlock: _onUpdateBlock,
  onDeleteBlock,
  readOnly = false,
  timezone: _timezone,
}: ScheduleCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<DayOfWeek | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Get days for current month view
  const calendarDays = useMemo(() => {
    const days = getDaysInMonth(year, month);
    const firstDayOffset = getDayOfWeekMondayStart(days[0]);

    // Add empty slots for days before the first of the month
    const paddingBefore = Array(firstDayOffset).fill(null);

    return [...paddingBefore, ...days];
  }, [year, month]);

  // Group blocks by day of week
  const blocksByDay = useMemo(() => {
    const grouped: Record<DayOfWeek, TimeBlock[]> = {
      0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
    };
    blocks.forEach(block => {
      grouped[block.dayOfWeek].push(block);
    });
    // Sort by start time
    Object.keys(grouped).forEach(day => {
      grouped[Number(day) as DayOfWeek].sort((a, b) =>
        a.startTime.localeCompare(b.startTime)
      );
    });
    return grouped;
  }, [blocks]);

  // Navigate months
  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Handle day click
  const handleDayClick = (date: Date) => {
    if (readOnly) return;
    const dayOfWeek = date.getDay() as DayOfWeek;
    setSelectedDay(dayOfWeek);
  };

  // Get blocks for a specific day of week
  const getBlocksForDayOfWeek = (date: Date): TimeBlock[] => {
    const dayOfWeek = date.getDay() as DayOfWeek;
    return blocksByDay[dayOfWeek] || [];
  };

  // Format month/year header
  const monthYearString = currentDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // Check if a date is today
  const isToday = (date: Date): boolean => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  return (
    <div className="schedule-calendar">
      {/* Calendar header */}
      <div className="calendar-header">
        <div className="calendar-nav">
          <button className="nav-btn" onClick={goToPrevMonth}>
            <ChevronLeft size={18} />
          </button>
          <h2 className="month-title">{monthYearString}</h2>
          <button className="nav-btn" onClick={goToNextMonth}>
            <ChevronRight size={18} />
          </button>
        </div>
        <button className="today-btn" onClick={goToToday}>
          Today
        </button>
      </div>

      {/* Day headers */}
      <div className="calendar-weekdays">
        {[1, 2, 3, 4, 5, 6, 0].map(day => (
          <div key={day} className="weekday-header">
            {DAY_SHORT_NAMES[day as DayOfWeek]}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="calendar-grid">
        {calendarDays.map((date, idx) => {
          if (!date) {
            return <div key={`empty-${idx}`} className="calendar-day empty" />;
          }

          const dayBlocks = getBlocksForDayOfWeek(date);
          const dayOfWeek = date.getDay() as DayOfWeek;

          return (
            <div
              key={date.toISOString()}
              className={`calendar-day ${isToday(date) ? 'today' : ''} ${selectedDay === dayOfWeek ? 'selected' : ''}`}
              onClick={() => handleDayClick(date)}
            >
              <div className="day-number">{date.getDate()}</div>
              <div className="day-blocks">
                {dayBlocks.slice(0, 3).map(block => (
                  <div
                    key={block.id}
                    className="calendar-block"
                    style={{ backgroundColor: block.color }}
                    title={`${block.activity}: ${formatTime12h(block.startTime)} - ${formatTime12h(block.endTime)}`}
                  >
                    <span className="block-time">{formatTime12h(block.startTime)}</span>
                    <span className="block-activity">{block.activity}</span>
                  </div>
                ))}
                {dayBlocks.length > 3 && (
                  <div className="more-blocks">+{dayBlocks.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected day detail panel */}
      {selectedDay !== null && (
        <div className="day-detail-panel">
          <div className="day-detail-header">
            <h3>{DAY_SHORT_NAMES[selectedDay]} Schedule</h3>
            <button className="close-panel-btn" onClick={() => setSelectedDay(null)}>
              <X size={18} />
            </button>
          </div>

          <div className="day-detail-content">
            {blocksByDay[selectedDay].length === 0 ? (
              <div className="no-blocks-message">
                No activities scheduled for {DAY_SHORT_NAMES[selectedDay]}
              </div>
            ) : (
              <div className="day-blocks-list">
                {blocksByDay[selectedDay].map(block => (
                  <div
                    key={block.id}
                    className="day-block-item"
                    style={{ borderLeftColor: block.color }}
                  >
                    <div className="block-info">
                      <span className="block-activity-name">{block.activity}</span>
                      <span className="block-time-range">
                        {formatTime12h(block.startTime)} - {formatTime12h(block.endTime)}
                      </span>
                    </div>
                    {!readOnly && (
                      <button
                        className="delete-block-btn"
                        onClick={() => onDeleteBlock(block.id)}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!readOnly && (
              <button
                className="add-block-btn"
                onClick={() => setShowAddModal(true)}
              >
                <Plus size={16} />
                Add Activity
              </button>
            )}
          </div>
        </div>
      )}

      {/* Add block modal */}
      {showAddModal && selectedDay !== null && (
        <AddBlockModal
          dayOfWeek={selectedDay}
          onAdd={(block) => {
            onAddBlock(block);
            setShowAddModal(false);
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

// Modal for adding a new block
interface AddBlockModalProps {
  dayOfWeek: DayOfWeek;
  onAdd: (block: Omit<TimeBlock, 'id'>) => void;
  onClose: () => void;
}

function AddBlockModal({ dayOfWeek, onAdd, onClose }: AddBlockModalProps) {
  const [activity, setActivity] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [color, setColor] = useState<string>(SCHEDULE_COLORS[0].value);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activity.trim()) return;

    onAdd({
      dayOfWeek,
      startTime,
      endTime,
      activity: activity.trim(),
      color,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="add-block-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Activity - {DAY_SHORT_NAMES[dayOfWeek]}</h3>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Activity</label>
            <input
              type="text"
              value={activity}
              onChange={e => setActivity(e.target.value)}
              placeholder="e.g., Coding, Meeting, Design"
              autoFocus
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Color</label>
            <div className="color-picker">
              {SCHEDULE_COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  className={`color-swatch ${color === c.value ? 'selected' : ''}`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => setColor(c.value)}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="save-btn" disabled={!activity.trim()}>
              Add Activity
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
