import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { select } from 'd3-selection';
import { scaleTime, ScaleTime } from 'd3-scale';
import { axisBottom } from 'd3-axis';
import { timeDay, timeWeek } from 'd3-time';
import { timeFormat } from 'd3-time-format';
import { zoom, zoomIdentity, ZoomTransform } from 'd3-zoom';
import { drag } from 'd3-drag';
import { CalendarIcon } from '@heroicons/react/24/outline';
import { Video, Clock, ZoomIn, ZoomOut, Home, AlertTriangle, Repeat, Plus, Calendar, Users } from 'lucide-react';
import { getLocalStorage, setLocalStorage } from '../../hooks/useLocalStorage';
import './GanttTimeline.css';

// Drag result interface for date change
export interface DragDateChangeResult {
  todo: Todo & { listNames: string[]; listColors: string[] };
  oldStartDate: string;
  oldEndDate: string;
  newStartDate: string;
  newEndDate: string;
  isRecurring: boolean;
}

// Recurrence pattern for custom recurrence
interface RecurrencePattern {
  type: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'weekdays' | 'custom';
  interval?: number;
  unit?: 'day' | 'week' | 'month';
  weekDays?: number[];
  dayOfMonth?: number;
  weekOfMonth?: number;
  endType: 'never' | 'on' | 'after';
  endDate?: string;
  occurrences?: number;
}

// Meeting details interface
interface MeetingDetails {
  startTime: string;
  endTime: string;
  repeat: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'weekdays' | 'custom';
  repeatUntil?: string;
  recurrence?: RecurrencePattern;
  color: string;
  calendarEventId?: string;
  hasVideoRoom?: boolean;
}

interface Todo {
  id: string;
  text: string;
  completed: boolean; // Simple checkbox - done or not done
  dueDate?: string;
  startDate?: string;
  createdAt: string;
  linkedNote?: string;
  listId?: string;
  description?: string;
  priority?: number | 'P1' | 'P2' | 'P3' | 'P4'; // Bar color based on priority (can be number or string)
  type?: 'task' | 'meeting';
  meetingDetails?: MeetingDetails;
}

interface TodoList {
  id: string;
  name: string;
  icon: string;
  todos: Todo[];
  color?: string;
}

// Member type for avatar display
interface TimelineMember {
  email: string;
  displayName?: string;
  photoURL?: string;
  customAvatar?: string;
}

/**
 * Parse a YYYY-MM-DD date string as local time (not UTC)
 * This prevents timezone issues where dates appear shifted by one day
 */
function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();

  // If it's already an ISO string with time, use it directly
  if (dateStr.includes('T')) {
    return new Date(dateStr);
  }

  // For YYYY-MM-DD format, parse as local time
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

interface GanttTimelineProps {
  lists: TodoList[];
  members?: { [key: string]: TimelineMember }; // For looking up member avatars
  onTodoClick?: (todo: Todo) => void;
  onTodoToggle?: (todoId: string, completed: boolean) => void; // Toggle checkbox
  onAddTask?: (date?: Date) => void; // Optional callback to add a task, optionally with a pre-filled date
  onStartCall?: (todoId: string, callType: 'video' | 'voice') => void; // Start a call for a meeting
  onDateDragEnd?: (result: DragDateChangeResult) => void; // Callback when a todo is dragged to a new date
}

const LIST_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4',
];

// Priority determines the bar color
const PRIORITY_COLORS = {
  'P1': '#ef4444', // Red - Highest priority
  'P2': '#f97316', // Orange
  'P3': '#eab308', // Yellow
  'P4': '#22c55e'  // Green - Lowest priority
};

// Helper function to generate all occurrences of a recurring meeting within a date range
function generateRecurringOccurrences(
  todo: Todo & { listNames: string[]; listColors: string[] },
  rangeStart: Date,
  rangeEnd: Date
): Array<Todo & { listNames: string[]; listColors: string[]; isRecurringInstance?: boolean; originalDate?: string }> {
  const occurrences: Array<Todo & { listNames: string[]; listColors: string[]; isRecurringInstance?: boolean; originalDate?: string }> = [];

  if (!todo.dueDate || todo.type !== 'meeting' || !todo.meetingDetails) {
    return [todo];
  }

  const recurrence = todo.meetingDetails.recurrence;
  const repeatType = recurrence?.type || todo.meetingDetails.repeat || 'none';

  if (repeatType === 'none') {
    return [todo];
  }

  const originalDate = parseLocalDate(todo.dueDate!);
  const startDate = todo.startDate ? parseLocalDate(todo.startDate) : originalDate;

  // Determine end date for recurrence
  let recurrenceEndDate: Date | null = null;
  if (recurrence?.endType === 'on' && recurrence.endDate) {
    recurrenceEndDate = new Date(recurrence.endDate);
  } else if (todo.meetingDetails.repeatUntil) {
    recurrenceEndDate = new Date(todo.meetingDetails.repeatUntil);
  }

  // Calculate the duration of the original event
  const duration = originalDate.getTime() - startDate.getTime();

  // Generate occurrences within the visible range
  let currentDate = new Date(startDate);
  let occurrenceCount = 0;
  const maxOccurrences = recurrence?.occurrences || 365; // Limit to prevent infinite loop

  while (currentDate <= rangeEnd && occurrenceCount < maxOccurrences) {
    // Check if this occurrence is within range and not past recurrence end
    if (currentDate >= rangeStart && (!recurrenceEndDate || currentDate <= recurrenceEndDate)) {
      const endDateForOccurrence = new Date(currentDate.getTime() + duration);

      occurrences.push({
        ...todo,
        startDate: currentDate.toISOString().split('T')[0],
        dueDate: endDateForOccurrence.toISOString().split('T')[0],
        isRecurringInstance: occurrenceCount > 0,
        originalDate: todo.dueDate,
      });
    }

    occurrenceCount++;

    // Advance to next occurrence based on repeat type
    const interval = recurrence?.interval || 1;

    switch (repeatType) {
      case 'daily':
        currentDate = new Date(currentDate);
        currentDate.setDate(currentDate.getDate() + interval);
        break;

      case 'weekly':
        currentDate = new Date(currentDate);
        currentDate.setDate(currentDate.getDate() + (7 * interval));
        break;

      case 'biweekly':
        currentDate = new Date(currentDate);
        currentDate.setDate(currentDate.getDate() + 14);
        break;

      case 'monthly':
        currentDate = new Date(currentDate);
        currentDate.setMonth(currentDate.getMonth() + interval);
        break;

      case 'weekdays':
        currentDate = new Date(currentDate);
        do {
          currentDate.setDate(currentDate.getDate() + 1);
        } while (currentDate.getDay() === 0 || currentDate.getDay() === 6);
        break;

      case 'custom':
        if (recurrence?.unit === 'day') {
          currentDate = new Date(currentDate);
          currentDate.setDate(currentDate.getDate() + interval);
        } else if (recurrence?.unit === 'week') {
          // Handle specific weekdays if provided
          if (recurrence.weekDays && recurrence.weekDays.length > 0) {
            let found = false;
            const weekDaysSorted = [...recurrence.weekDays].sort((a, b) => a - b);

            // Find next occurrence
            for (let i = 0; i < 7 * interval && !found; i++) {
              currentDate = new Date(currentDate);
              currentDate.setDate(currentDate.getDate() + 1);
              if (weekDaysSorted.includes(currentDate.getDay())) {
                found = true;
              }
            }
          } else {
            currentDate = new Date(currentDate);
            currentDate.setDate(currentDate.getDate() + (7 * interval));
          }
        } else if (recurrence?.unit === 'month') {
          currentDate = new Date(currentDate);
          currentDate.setMonth(currentDate.getMonth() + interval);
        }
        break;

      default:
        // Unknown type, stop generating
        return occurrences;
    }

    // Safety check - if date didn't advance, break to prevent infinite loop
    if (occurrences.length > 0 && currentDate <= parseLocalDate(occurrences[occurrences.length - 1].startDate!)) {
      break;
    }
  }

  return occurrences;
}

// Calendar Month View Component
interface CalendarMonthViewProps {
  todos: Array<Todo & { listNames: string[]; listColors: string[] }>;
  onTodoClick: (todo: Todo) => void;
  onAddTask?: (date: Date) => void;
}

// Tooltip component for event preview
interface EventTooltipProps {
  todo: Todo & { listNames: string[]; listColors: string[] };
  position: { x: number; y: number };
}

const EventTooltip: React.FC<EventTooltipProps> = ({ todo, position }) => {
  const isMeeting = todo.type === 'meeting';

  // Calculate position to stay within viewport
  const tooltipWidth = 280;
  const tooltipHeight = 150; // Approximate height
  const padding = 10;

  let left = position.x + padding;
  let top = position.y + padding;

  // Adjust if tooltip would go off right edge
  if (left + tooltipWidth > window.innerWidth - padding) {
    left = position.x - tooltipWidth - padding;
  }

  // Adjust if tooltip would go off bottom edge
  if (top + tooltipHeight > window.innerHeight - padding) {
    top = position.y - tooltipHeight - padding;
  }

  // Ensure minimum bounds
  left = Math.max(padding, left);
  top = Math.max(padding, top);

  return (
    <div
      className="calendar-event-tooltip"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        background: '#2d2d2d',
        border: '1px solid #3d3d3d',
        borderRadius: '8px',
        padding: '12px',
        maxWidth: '280px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        zIndex: 10000,
        pointerEvents: 'none'
      }}
    >
      <div style={{ fontWeight: '600', color: '#e0e0e0', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {isMeeting && <Video size={14} style={{ color: todo.meetingDetails?.color || '#64c8ca' }} />}
        {todo.text}
      </div>

      {isMeeting && todo.meetingDetails && (
        <div style={{ fontSize: '12px', color: '#b0b0b0', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Clock size={12} style={{ color: '#64c8ca', flexShrink: 0 }} />
          {(() => {
            const formatTime12h = (time: string) => {
              const [hours, minutes] = time.split(':').map(Number);
              const period = hours >= 12 ? 'PM' : 'AM';
              const hours12 = hours % 12 || 12;
              return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
            };
            return `${formatTime12h(todo.meetingDetails!.startTime)} - ${formatTime12h(todo.meetingDetails!.endTime)}`;
          })()}
        </div>
      )}

      {todo.startDate && todo.dueDate && todo.startDate !== todo.dueDate && (
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px' }}>
          {parseLocalDate(todo.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} → {parseLocalDate(todo.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      )}

      {todo.description && (
        <div style={{ fontSize: '12px', color: '#888', marginTop: '8px', borderTop: '1px solid #3d3d3d', paddingTop: '8px', lineHeight: '1.4' }}>
          {todo.description.length > 100 ? todo.description.substring(0, 100) + '...' : todo.description}
        </div>
      )}

      {todo.listNames.length > 0 && (
        <div style={{ fontSize: '11px', color: '#64c8ca', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Users size={12} /> {todo.listNames.join(', ')}
        </div>
      )}
    </div>
  );
};

// Context menu component
interface ContextMenuProps {
  position: { x: number; y: number };
  options: Array<{ label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean }>;
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ position, options, onClose }) => {
  useEffect(() => {
    const handleClick = () => onClose();
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      className="calendar-context-menu"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        background: '#2d2d2d',
        border: '1px solid #3d3d3d',
        borderRadius: '8px',
        padding: '6px',
        minWidth: '160px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        zIndex: 10001
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {options.map((option, idx) => (
        <button
          key={idx}
          onClick={(e) => { e.stopPropagation(); option.onClick(); onClose(); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            padding: '8px 12px',
            background: 'transparent',
            border: 'none',
            borderRadius: '4px',
            color: option.danger ? '#ef4444' : '#e0e0e0',
            fontSize: '13px',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 0.15s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = option.danger ? 'rgba(239,68,68,0.15)' : '#3d3d3d'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          {option.icon && <span>{option.icon}</span>}
          {option.label}
        </button>
      ))}
    </div>
  );
};

// Day popover for +N more
interface DayPopoverProps {
  date: Date;
  events: Array<Todo & { listNames: string[]; listColors: string[] }>;
  position: { x: number; y: number };
  onClose: () => void;
  onEventClick: (todo: Todo) => void;
  onAddEvent: () => void;
}

const DayPopover: React.FC<DayPopoverProps> = ({ date, events, position, onClose, onEventClick, onAddEvent }) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }} onClick={onClose} />
      <div
        className="day-popover"
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          background: '#252525',
          border: '1px solid #3d3d3d',
          borderRadius: '10px',
          padding: '12px',
          minWidth: '240px',
          maxWidth: '320px',
          maxHeight: '300px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 10000,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #3d3d3d' }}>
          <span style={{ fontWeight: '600', color: '#e0e0e0' }}>
            {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <button
            onClick={onAddEvent}
            style={{
              background: 'rgba(100,200,202,0.15)',
              border: '1px solid #64c8ca',
              borderRadius: '4px',
              color: '#64c8ca',
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            + Add
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {events.length === 0 ? (
            <div style={{ color: '#666', fontSize: '13px', padding: '12px', textAlign: 'center' }}>No events</div>
          ) : (
            events.map((event, idx) => {
              const isMeeting = event.type === 'meeting';
              const barColor = isMeeting && event.meetingDetails?.color
                ? event.meetingDetails.color
                : PRIORITY_COLORS[`P${event.priority}` as keyof typeof PRIORITY_COLORS] || '#64c8ca';

              return (
                <div
                  key={`${event.id}-${idx}`}
                  onClick={() => onEventClick(event)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    marginBottom: '4px',
                    background: '#2d2d2d',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#3d3d3d'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#2d2d2d'}
                >
                  <div style={{ width: '4px', height: '24px', borderRadius: '2px', background: barColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#e0e0e0', fontSize: '13px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {event.text}
                    </div>
                    {isMeeting && event.meetingDetails && (
                      <div style={{ color: '#888', fontSize: '11px', marginTop: '2px' }}>
                        {(() => {
                          const formatTime12h = (time: string) => {
                            const [hours, minutes] = time.split(':').map(Number);
                            const period = hours >= 12 ? 'PM' : 'AM';
                            const hours12 = hours % 12 || 12;
                            return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
                          };
                          return `${formatTime12h(event.meetingDetails!.startTime)} - ${formatTime12h(event.meetingDetails!.endTime)}`;
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};

const CalendarMonthView: React.FC<CalendarMonthViewProps> = ({ todos, onTodoClick, onAddTask }) => {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const calendarRef = useRef<HTMLDivElement>(null);
  const weeksContainerRef = useRef<HTMLDivElement>(null);
  const [showYearMonthPicker, setShowYearMonthPicker] = useState(false);
  const [hoveredEvent, setHoveredEvent] = useState<{ todo: Todo & { listNames: string[]; listColors: string[] }; position: { x: number; y: number } } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ position: { x: number; y: number }; options: Array<{ label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean }> } | null>(null);
  const [dayPopover, setDayPopover] = useState<{ date: Date; events: Array<Todo & { listNames: string[]; listColors: string[] }>; position: { x: number; y: number } } | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const [rowHeight, setRowHeight] = useState<number>(100); // Dynamic row height for event visibility calculation

  // Calculate max visible events based on available row height
  // Header area: ~18px, each event: 20px spacing (18px bar + 2px gap), "+N more": 16px
  const calculateMaxVisibleEvents = useCallback((height: number): number => {
    const headerSpace = 18; // Space for date number
    const eventHeight = 20; // Each event takes 20px (18px bar + 2px gap)
    const moreIndicatorHeight = 16; // "+N more" indicator height

    // Available space for events = total height - header - space for "+N more" indicator
    const availableSpace = height - headerSpace - moreIndicatorHeight;

    // If space is very limited, show at least 0 events (just "+N more")
    if (availableSpace < eventHeight) return 0;

    return Math.max(0, Math.floor(availableSpace / eventHeight));
  }, []);

  // Track row height using ResizeObserver
  useEffect(() => {
    const container = weeksContainerRef.current;
    if (!container) return;

    const updateRowHeight = () => {
      const firstRow = container.querySelector('[data-week-row]') as HTMLElement;
      if (firstRow) {
        const height = firstRow.offsetHeight;
        setRowHeight(height);
      }
    };

    // Initial measurement
    updateRowHeight();

    const resizeObserver = new ResizeObserver(() => {
      updateRowHeight();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Mouse wheel navigation - scroll up = next month, scroll down = previous month
  useEffect(() => {
    const calendarEl = calendarRef.current;
    if (!calendarEl) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Debounce-like behavior - only respond to significant scroll
      if (Math.abs(e.deltaY) < 10) return;

      if (e.deltaY < 0) {
        // Scroll up = next month
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
      } else {
        // Scroll down = previous month
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
      }
    };

    calendarEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => calendarEl.removeEventListener('wheel', handleWheel);
  }, []);

  // Generate calendar data
  const generateCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay()); // Start from Sunday

    const weeks: Date[][] = [];
    let currentWeek: Date[] = [];
    let currentDate = new Date(startDate);

    while (currentDate <= lastDay || currentWeek.length > 0) {
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);

      // Stop after 6 weeks
      if (weeks.length === 5 && currentWeek.length === 7) {
        weeks.push(currentWeek);
        break;
      }
    }

    if (currentWeek.length > 0 && weeks.length < 6) {
      weeks.push(currentWeek);
    }

    return weeks;
  };

  const weeks = generateCalendar();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Calculate the visible date range for recurring occurrences
  const visibleRange = useMemo(() => {
    if (weeks.length === 0) return { start: new Date(), end: new Date() };
    const start = weeks[0][0];
    const end = weeks[weeks.length - 1][6];
    return { start, end };
  }, [weeks]);

  // Expand recurring meetings for the visible month
  const expandedTodos = useMemo(() => {
    const expanded: Array<typeof todos[0] & { isRecurringInstance?: boolean; originalDate?: string }> = [];

    todos.forEach(todo => {
      const occurrences = generateRecurringOccurrences(todo, visibleRange.start, visibleRange.end);
      expanded.push(...occurrences);
    });

    return expanded;
  }, [todos, visibleRange]);

  // Note: eventSpans calculation removed - using direct per-day rendering instead

  const isToday = (date: Date) => {
    return date.toDateString() === new Date().toDateString();
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentMonth.getMonth();
  };

  // Navigate to today
  const goToToday = () => {
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  // Get short month name for first day of month display
  const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div
      ref={calendarRef}
      className="calendar-month-view"
      style={{ padding: '16px', background: '#1e1e1e' }}
    >
      {/* Google Calendar Style Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px', gap: '8px' }}>
        {/* Left: Today button + Nav arrows */}
        <button
          onClick={goToToday}
          style={{
            background: 'transparent',
            border: '1px solid #3d3d3d',
            borderRadius: '20px',
            color: '#e0e0e0',
            padding: '8px 20px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#2d2d2d'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          Today
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#888',
              cursor: 'pointer',
              fontSize: '18px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#2d2d2d'; e.currentTarget.style.color = '#e0e0e0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888'; }}
          >
            ‹
          </button>
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#888',
              cursor: 'pointer',
              fontSize: '18px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#2d2d2d'; e.currentTarget.style.color = '#e0e0e0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888'; }}
          >
            ›
          </button>
        </div>

        {/* Center: Month Year (clickable) */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowYearMonthPicker(!showYearMonthPicker)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#e0e0e0',
              fontSize: '22px',
              fontWeight: '400',
              cursor: 'pointer',
              padding: '4px 12px',
              borderRadius: '6px',
              transition: 'background 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#2d2d2d'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            <span style={{ fontSize: '10px', opacity: 0.5, marginLeft: '4px' }}>▼</span>
          </button>

          {/* Year/Month Picker Dropdown */}
          {showYearMonthPicker && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setShowYearMonthPicker(false)} />
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: '0',
                  marginTop: '8px',
                  background: '#252525',
                  border: '1px solid #3d3d3d',
                  borderRadius: '10px',
                  padding: '16px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  zIndex: 9999,
                  minWidth: '280px'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Year selector */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <button
                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear() - 1, currentMonth.getMonth(), 1))}
                    style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px', padding: '4px 8px' }}
                  >
                    ◀
                  </button>
                  <span style={{ color: '#e0e0e0', fontSize: '16px', fontWeight: '600' }}>{currentMonth.getFullYear()}</span>
                  <button
                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear() + 1, currentMonth.getMonth(), 1))}
                    style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px', padding: '4px 8px' }}
                  >
                    ▶
                  </button>
                </div>

                {/* Month grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {monthNames.map((name, idx) => {
                    const isSelected = idx === currentMonth.getMonth();
                    const isCurrent = idx === today.getMonth() && currentMonth.getFullYear() === today.getFullYear();
                    return (
                      <button
                        key={name}
                        onClick={() => {
                          setCurrentMonth(new Date(currentMonth.getFullYear(), idx, 1));
                          setShowYearMonthPicker(false);
                        }}
                        style={{
                          padding: '10px 8px',
                          background: isSelected ? '#64c8ca' : isCurrent ? 'rgba(100,200,202,0.2)' : '#2d2d2d',
                          border: isCurrent && !isSelected ? '1px solid #64c8ca' : '1px solid transparent',
                          borderRadius: '6px',
                          color: isSelected ? '#1e1e1e' : '#e0e0e0',
                          fontSize: '13px',
                          fontWeight: isSelected ? '600' : '400',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#3d3d3d'; }}
                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = isCurrent ? 'rgba(100,200,202,0.2)' : '#2d2d2d'; }}
                      >
                        {name.substring(0, 3)}
                      </button>
                    );
                  })}
                </div>

                {/* Quick jump to today */}
                <button
                  onClick={() => {
                    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                    setShowYearMonthPicker(false);
                  }}
                  style={{
                    width: '100%',
                    marginTop: '12px',
                    padding: '8px',
                    background: 'rgba(100,200,202,0.15)',
                    border: '1px solid #64c8ca',
                    borderRadius: '6px',
                    color: '#64c8ca',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Go to Today
                </button>
              </div>
            </>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Right side hint */}
        <span style={{ fontSize: '11px', color: '#555' }}>Scroll to navigate</span>
      </div>

      {/* Calendar Grid */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #333', borderRadius: '8px', minHeight: 0, background: '#1e1e1e' }}>
        {/* Day Names Header - Static */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #333', flexShrink: 0 }}>
          {dayNames.map((day, idx) => (
            <div
              key={day}
              style={{
                padding: '6px 4px',
                textAlign: 'center',
                fontSize: '10px',
                fontWeight: '500',
                color: idx === 0 || idx === 6 ? '#ef5350' : '#888',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                borderRight: idx < 6 ? '1px solid #333' : 'none'
              }}
            >
              {day.toUpperCase()}
            </div>
          ))}
        </div>

        {/* Weeks Grid - Flexible rows that fill available space */}
        <div ref={weeksContainerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, background: '#1e1e1e' }}>
          {weeks.map((week, weekIdx) => {
            // Dynamic MAX_VISIBLE_EVENTS based on actual row height
            const maxVisibleEvents = calculateMaxVisibleEvents(rowHeight);

            // Count TOTAL events per column directly from expandedTodos (not from weekSpans)
            // This ensures we get the true count of all events on each date
            const totalEventsPerColumn: { [col: number]: number } = {};
            for (let col = 0; col < 7; col++) {
              const dateForCol = week[col];
              totalEventsPerColumn[col] = expandedTodos.filter(todo => {
                const todoStart = todo.startDate ? parseLocalDate(todo.startDate) : todo.dueDate ? parseLocalDate(todo.dueDate) : null;
                const todoEnd = todo.dueDate ? parseLocalDate(todo.dueDate) : null;
                if (!todoStart || !todoEnd) return false;
                // Normalize dates to midnight for comparison
                const normalizedDate = new Date(dateForCol.getFullYear(), dateForCol.getMonth(), dateForCol.getDate());
                const normalizedStart = new Date(todoStart.getFullYear(), todoStart.getMonth(), todoStart.getDate());
                const normalizedEnd = new Date(todoEnd.getFullYear(), todoEnd.getMonth(), todoEnd.getDate());
                return normalizedDate >= normalizedStart && normalizedDate <= normalizedEnd;
              }).length;
            }

            // Assign global row indices to events based on start date (for slot consistency across days)
            // Sort events by start date, then assign row numbers
            const sortedEvents = [...expandedTodos].sort((a, b) => {
              const aStart = a.startDate || a.dueDate || '';
              const bStart = b.startDate || b.dueDate || '';
              return aStart.localeCompare(bStart);
            });
            const eventRowMap = new Map<string, number>();
            sortedEvents.forEach((todo, idx) => {
              const key = `${todo.id}-${todo.startDate || todo.dueDate}`;
              eventRowMap.set(key, idx);
            });

            return (
              <div key={weekIdx} data-week-row style={{ flex: '1 1 0', position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', borderBottom: weekIdx < weeks.length - 1 ? '1px solid #333' : 'none', background: '#1e1e1e' }}>
                {/* Event bars layer - per-day rendering */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '18px 0 0 0' }}>
                  {[0, 1, 2, 3, 4, 5, 6].map(col => {
                    const dateForCol = week[col];
                    const isOutsideMonth = dateForCol.getMonth() !== currentMonth.getMonth();

                    // Get all events for this day
                    const eventsForDay = expandedTodos.filter(todo => {
                      const todoStart = todo.startDate ? parseLocalDate(todo.startDate) : todo.dueDate ? parseLocalDate(todo.dueDate) : null;
                      const todoEnd = todo.dueDate ? parseLocalDate(todo.dueDate) : null;
                      if (!todoStart || !todoEnd) return false;
                      const normalizedDate = new Date(dateForCol.getFullYear(), dateForCol.getMonth(), dateForCol.getDate());
                      const normalizedStart = new Date(todoStart.getFullYear(), todoStart.getMonth(), todoStart.getDate());
                      const normalizedEnd = new Date(todoEnd.getFullYear(), todoEnd.getMonth(), todoEnd.getDate());
                      return normalizedDate >= normalizedStart && normalizedDate <= normalizedEnd;
                    });

                    // Sort events by their global row assignment for consistent slot ordering
                    const sortedDayEvents = [...eventsForDay].sort((a, b) => {
                      const aKey = `${a.id}-${a.startDate || a.dueDate}`;
                      const bKey = `${b.id}-${b.startDate || b.dueDate}`;
                      return (eventRowMap.get(aKey) || 0) - (eventRowMap.get(bKey) || 0);
                    });

                    // Take only visible events (up to maxVisibleEvents)
                    const visibleEvents = sortedDayEvents.slice(0, maxVisibleEvents);
                    const hiddenCount = sortedDayEvents.length - visibleEvents.length;

                    return (
                      <div key={col} style={{ gridColumn: `${col + 1}`, display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden', minWidth: 0 }}>
                        {visibleEvents.map((todo, slotIdx) => {
                          const isMeeting = todo.type === 'meeting';
                          const isRecurring = isMeeting && todo.meetingDetails &&
                            ((todo.meetingDetails.recurrence?.type && todo.meetingDetails.recurrence.type !== 'none') ||
                             (todo.meetingDetails.repeat && todo.meetingDetails.repeat !== 'none'));
                          // Check if regular task is a recurring instance
                          const isRecurringTask = !isMeeting && todo.isRecurringInstance;

                          // Check if this is a multi-day event
                          const todoStart = todo.startDate ? parseLocalDate(todo.startDate) : parseLocalDate(todo.dueDate!);
                          const todoEnd = parseLocalDate(todo.dueDate!);
                          const normalizedDate = new Date(dateForCol.getFullYear(), dateForCol.getMonth(), dateForCol.getDate());
                          const normalizedStart = new Date(todoStart.getFullYear(), todoStart.getMonth(), todoStart.getDate());
                          const normalizedEnd = new Date(todoEnd.getFullYear(), todoEnd.getMonth(), todoEnd.getDate());
                          const isMultiDay = normalizedStart.getTime() !== normalizedEnd.getTime();
                          const isStartDay = normalizedDate.getTime() === normalizedStart.getTime();
                          const isEndDay = normalizedDate.getTime() === normalizedEnd.getTime();

                          // Color for tasks (priority-based), meetings use accent color for icon
                          const priorityColor = PRIORITY_COLORS[`P${todo.priority}` as keyof typeof PRIORITY_COLORS] || '#64c8ca';
                          const meetingColor = todo.meetingDetails?.color || '#64c8ca';

                          const barOpacity = todo.completed ? 0.5 : isOutsideMonth ? 0.4 : 1;
                          const uniqueKey = `${todo.id}-${todo.startDate || todo.dueDate}-${col}-${slotIdx}`;

                          // Meeting: no background, just icon + text
                          if (isMeeting) {
                            return (
                              <div
                                key={uniqueKey}
                                onClick={() => onTodoClick(todo)}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(100, 200, 202, 0.1)';
                                  if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                                  hoverTimeoutRef.current = window.setTimeout(() => {
                                    setHoveredEvent({ todo, position: { x: e.clientX, y: e.clientY } });
                                  }, 400);
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                  if (hoverTimeoutRef.current) {
                                    clearTimeout(hoverTimeoutRef.current);
                                    hoverTimeoutRef.current = null;
                                  }
                                  setHoveredEvent(null);
                                }}
                                style={{
                                  height: '18px',
                                  padding: '0 4px',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  fontWeight: '500',
                                  color: meetingColor,
                                  opacity: barOpacity,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  marginLeft: '1px',
                                  marginRight: '1px',
                                  pointerEvents: 'auto',
                                  borderRadius: '2px',
                                  background: 'transparent',
                                  transition: 'background 0.15s'
                                }}
                              >
                                {isRecurring ? (
                                  <Repeat size={12} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                                ) : (
                                  <Video size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
                                )}
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>{todo.text}</span>
                              </div>
                            );
                          }

                          // Task: colored bar with rounded corners based on multi-day position
                          const borderRadius = isMultiDay
                            ? isStartDay && isEndDay
                              ? '3px'
                              : isStartDay
                                ? '3px 0 0 3px'
                                : isEndDay
                                  ? '0 3px 3px 0'
                                  : '0'
                            : '3px';

                          return (
                            <div
                              key={uniqueKey}
                              onClick={() => onTodoClick(todo)}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.opacity = '1';
                                if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                                hoverTimeoutRef.current = window.setTimeout(() => {
                                  setHoveredEvent({ todo, position: { x: e.clientX, y: e.clientY } });
                                }, 400);
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.opacity = String(barOpacity);
                                if (hoverTimeoutRef.current) {
                                  clearTimeout(hoverTimeoutRef.current);
                                  hoverTimeoutRef.current = null;
                                }
                                setHoveredEvent(null);
                              }}
                              style={{
                                height: '18px',
                                background: priorityColor,
                                borderRadius: borderRadius,
                                padding: '0 6px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: '500',
                                color: '#1e1e1e',
                                textDecoration: todo.completed ? 'line-through' : 'none',
                                opacity: barOpacity,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                marginLeft: isMultiDay && !isStartDay ? '0' : '1px',
                                marginRight: isMultiDay && !isEndDay ? '0' : '1px',
                                pointerEvents: 'auto',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.15)'
                              }}
                            >
                              {(isStartDay || !isMultiDay) && (
                                <>
                                  {isRecurringTask && (
                                    <Repeat size={10} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                                  )}
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>{todo.text}</span>
                                </>
                              )}
                            </div>
                          );
                        })}

                        {/* "+N more" indicator for this day */}
                        {hiddenCount > 0 && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              setDayPopover({
                                date: dateForCol,
                                events: sortedDayEvents,
                                position: { x: rect.left, y: rect.bottom + 4 }
                              });
                            }}
                            style={{
                              height: '16px',
                              marginLeft: '1px',
                              marginRight: '1px',
                              padding: '0 4px',
                              cursor: 'pointer',
                              fontSize: '10px',
                              fontWeight: '500',
                              color: '#e0e0e0',
                              opacity: isOutsideMonth ? 0.4 : 1,
                              pointerEvents: 'auto',
                              display: 'flex',
                              alignItems: 'center',
                              transition: 'color 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#64c8ca'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#e0e0e0'}
                          >
                            +{hiddenCount} more
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Calendar grid cells */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', flex: 1 }}>
                  {week.map((date, dayIdx) => {
                    const isTodayDate = isToday(date);
                    const isInCurrentMonth = isCurrentMonth(date);
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    const isFirstOfMonth = date.getDate() === 1;

                    // Get events for this specific date for context menu
                    const eventsForDate = expandedTodos.filter(todo => {
                      const todoStart = todo.startDate ? parseLocalDate(todo.startDate) : todo.dueDate ? parseLocalDate(todo.dueDate) : null;
                      const todoEnd = todo.dueDate ? parseLocalDate(todo.dueDate) : null;
                      if (!todoStart || !todoEnd) return false;
                      return date >= todoStart && date <= todoEnd;
                    });

                    return (
                      <div
                        key={dayIdx}
                        onClick={() => {
                          if (onAddTask) onAddTask(date);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          setContextMenu({
                            position: { x: e.clientX, y: e.clientY },
                            options: [
                              { label: `Add event on ${formattedDate}`, icon: <Plus size={14} />, onClick: () => onAddTask && onAddTask(date) },
                              ...(eventsForDate.length > 0 ? [
                                { label: `View ${eventsForDate.length} event${eventsForDate.length > 1 ? 's' : ''}`, icon: <Calendar size={14} />, onClick: () => {
                                  setDayPopover({
                                    date,
                                    events: eventsForDate,
                                    position: { x: e.clientX, y: e.clientY }
                                  });
                                }},
                              ] : []),
                            ]
                          });
                        }}
                        style={{
                          padding: '2px',
                          borderRight: dayIdx < 6 ? '1px solid #333' : 'none',
                          background: 'transparent',
                          opacity: isInCurrentMonth ? 1 : 0.35,
                          display: 'flex',
                          flexDirection: 'column',
                          cursor: 'pointer',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(100, 200, 202, 0.06)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        {/* Date Number - Google Calendar style (compact) */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: isTodayDate ? '22px' : 'auto',
                          height: '18px',
                          fontSize: isFirstOfMonth ? '10px' : '11px',
                          fontWeight: '400',
                          color: isTodayDate ? '#1e1e1e' : isWeekend ? '#ef5350' : '#e0e0e0',
                          background: isTodayDate ? '#64c8ca' : 'transparent',
                          borderRadius: isTodayDate ? '50%' : '0',
                          alignSelf: 'flex-start',
                          padding: isFirstOfMonth && !isTodayDate ? '0 3px' : '0',
                          marginLeft: '2px'
                        }}>
                          {isFirstOfMonth ? `${shortMonthNames[date.getMonth()]} 1` : date.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event Tooltip */}
      {hoveredEvent && (
        <EventTooltip todo={hoveredEvent.todo} position={hoveredEvent.position} />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          position={contextMenu.position}
          options={contextMenu.options}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Day Popover for +N more */}
      {dayPopover && (
        <DayPopover
          date={dayPopover.date}
          events={dayPopover.events}
          position={dayPopover.position}
          onClose={() => setDayPopover(null)}
          onEventClick={(todo) => { setDayPopover(null); onTodoClick(todo); }}
          onAddEvent={() => { setDayPopover(null); onAddTask && onAddTask(dayPopover.date); }}
        />
      )}
    </div>
  );
};

const EnhancedGanttTimeline: React.FC<GanttTimelineProps> = ({
  lists,
  members,
  onTodoClick,
  onTodoToggle,
  onAddTask,
  onStartCall: _onStartCall,
  onDateDragEnd
}) => {
  // These props are available for future use
  void _onStartCall;
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [hoveredTodo, setHoveredTodo] = useState<(Todo & { listNames: string[]; listColors: string[] }) | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>(() => {
    return getLocalStorage<'daily' | 'monthly'>('gantt-view-mode', 'daily');
  });
  const [showCompleted, setShowCompleted] = useState(() => {
    return getLocalStorage<boolean>('gantt-show-completed', true);
  });
  const tooltipTimeoutRef = useRef<number | null>(null);
  const currentHoveredIdRef = useRef<string | null>(null);
  const onTodoClickRef = useRef(onTodoClick);
  const onTodoToggleRef = useRef(onTodoToggle);
  const onDateDragEndRef = useRef(onDateDragEnd);

  // Drag indicator state - stores chart coordinates for SVG rendering
  const [_dragIndicator, setDragIndicator] = useState<{
    chartX: number; // Position in chart coordinate system (same as xScale output)
    date: Date;
    todoId: string;
  } | null>(null);

  // Store xScale ref for drag calculations
  const xScaleRef = useRef<ScaleTime<number, number> | null>(null);

  // Ref to the drag indicator SVG group for direct updates
  const dragIndicatorGroupRef = useRef<SVGGElement | null>(null);

  // Zoom state - load from localStorage if available
  const [zoomTransform, setZoomTransform] = useState<ZoomTransform>(() => {
    const saved = getLocalStorage<{ k: number; x: number; y: number } | null>('gantt-zoom-transform', null);
    if (saved) {
      return zoomIdentity.translate(saved.x, saved.y).scale(saved.k);
    }
    return zoomIdentity;
  });
  const zoomBehaviorRef = useRef<ReturnType<typeof zoom<SVGSVGElement, unknown>> | null>(null);

  // Keep refs updated
  useEffect(() => {
    onTodoClickRef.current = onTodoClick;
    onTodoToggleRef.current = onTodoToggle;
    onDateDragEndRef.current = onDateDragEnd;
  });

  // Save viewMode preference to localStorage whenever it changes
  useEffect(() => {
    setLocalStorage('gantt-view-mode', viewMode);
  }, [viewMode]);

  // Save showCompleted preference to localStorage whenever it changes
  useEffect(() => {
    setLocalStorage('gantt-show-completed', showCompleted);
  }, [showCompleted]);

  // Save zoom transform to localStorage whenever it changes
  useEffect(() => {
    const { k, x, y } = zoomTransform;
    setLocalStorage('gantt-zoom-transform', { k, x, y });
  }, [zoomTransform]);

  // Shift+Scroll for horizontal panning
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const handleWheel = (e: WheelEvent) => {
      // Only handle when Shift is held
      if (!e.shiftKey) return;

      e.preventDefault();

      // Get the current zoom transform and behavior
      const currentTransform = zoomTransform;
      const zoomBehavior = zoomBehaviorRef.current;
      if (!zoomBehavior) return;

      // Calculate pan amount (negative deltaY = scroll up = pan right, positive = pan left)
      // Using deltaY for vertical scroll wheel, but panning horizontally
      const panAmount = e.deltaY * 2; // Multiply for faster panning

      // Create new transform with horizontal translation
      const newTransform = currentTransform.translate(-panAmount / currentTransform.k, 0);

      // Apply the new transform
      select(svgEl).call(zoomBehavior.transform as any, newTransform);
    };

    svgEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => svgEl.removeEventListener('wheel', handleWheel);
  }, [zoomTransform]);

  // Calculate effective width for SVG based on view mode
  // Remove the width multiplication to prevent horizontal scrolling
  const effectiveWidth = dimensions.width;

  // Separate todos into scheduled and unscheduled - memoized to prevent recreation
  const { scheduledTodos, unscheduledTodos } = useMemo(() => {
    const scheduledMap: Map<string, Todo & { listNames: string[]; listColors: string[]; listIds: string[] }> = new Map();
    const unscheduledMap: Map<string, Todo & { listNames: string[]; listColors: string[]; listIds: string[] }> = new Map();

    lists.forEach((list, idx) => {
      const color = list.color || LIST_COLORS[idx % LIST_COLORS.length];
      list.todos.forEach((todo) => {
        const shouldShow = showCompleted || !todo.completed;
        if (shouldShow) {
          if (todo.dueDate) {
            // Add to scheduled, combining assignees if already exists
            const existing = scheduledMap.get(todo.id);
            if (existing) {
              // Only add if not already in the list (avoid duplicates)
              if (!existing.listNames.includes(list.name)) {
                existing.listNames.push(list.name);
                existing.listColors.push(color);
                existing.listIds.push(list.id);
              }
            } else {
              scheduledMap.set(todo.id, { ...todo, listNames: [list.name], listColors: [color], listIds: [list.id] });
            }
          } else {
            // Add to unscheduled, combining assignees if already exists
            const existing = unscheduledMap.get(todo.id);
            if (existing) {
              // Only add if not already in the list (avoid duplicates)
              if (!existing.listNames.includes(list.name)) {
                existing.listNames.push(list.name);
                existing.listColors.push(color);
                existing.listIds.push(list.id);
              }
            } else {
              unscheduledMap.set(todo.id, { ...todo, listNames: [list.name], listColors: [color], listIds: [list.id] });
            }
          }
        }
      });
    });

    const scheduled = Array.from(scheduledMap.values());
    const unscheduled = Array.from(unscheduledMap.values());

    // Sort by start date (or createdAt)
    scheduled.sort((a, b) => {
      const dateA = parseLocalDate(a.startDate || a.createdAt);
      const dateB = parseLocalDate(b.startDate || b.createdAt);
      return dateA.getTime() - dateB.getTime();
    });

    return { scheduledTodos: scheduled, unscheduledTodos: unscheduled };
  }, [lists, showCompleted]);

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
        // Calculate height based on content - fixed row height (no vertical scaling)
        const height = scheduledTodos.length > 0
          ? Math.max(300, scheduledTodos.length * 46 + 100)
          : 400;
        setDimensions({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [scheduledTodos.length]);

  // Add mouse leave handler to container to ensure tooltip hides
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseLeave = () => {
      currentHoveredIdRef.current = null;
      setHoveredTodo(null);
      setTooltipPos(null);
    };

    container.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      container.removeEventListener('mouseleave', handleMouseLeave);
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  // Draw the enhanced Gantt chart
  useEffect(() => {
    if (!svgRef.current || scheduledTodos.length === 0) return;

    const svg = select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 40, right: 40, bottom: 40, left: 20 };
    const chartWidth = effectiveWidth - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;
    void chartWidth; // Reserved for future chart width calculations

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Get date range
    const now = new Date();
    // Create a "today at midnight" for the TODAY indicator line to align with axis ticks
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const dates = scheduledTodos.flatMap(t => {
      const endDate = parseLocalDate(t.dueDate!);
      const startDateStr = t.startDate || t.createdAt;
      const startDate = parseLocalDate(startDateStr);
      return [startDate, endDate];
    });

    const minDate = new Date(Math.min(...dates.map(d => d.getTime()), now.getTime()));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime()), now.getTime()));

    // Keep the timeline focused around TODAY - only show 1 day before the earliest relevant date
    // This prevents showing too much empty space on the left
    minDate.setDate(minDate.getDate() - 1);
    maxDate.setDate(maxDate.getDate() + 7);

    // Create scales - apply zoom transform for scaling
    const xScaleBase = scaleTime()
      .domain([minDate, maxDate])
      .range([0, effectiveWidth]);

    // Apply zoom transform to scale
    const xScale = zoomTransform.rescaleX(xScaleBase);

    // Store xScale in ref for drag calculations
    xScaleRef.current = xScale;

    // Setup zoom behavior - allow infinite panning to explore past/future
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 8]) // Min 0.5x, max 8x zoom
      .translateExtent([[-Infinity, 0], [Infinity, height]]) // Allow unlimited horizontal panning
      .filter((event) => {
        // Ignore events from zoom control buttons
        const target = event.target as HTMLElement;
        if (target.closest('.zoom-controls') || target.closest('.timeline-filters')) {
          return false;
        }
        return true;
      })
      .on('zoom', (event) => {
        setZoomTransform(event.transform);
      });

    // Store zoom behavior in ref for external control
    zoomBehaviorRef.current = zoomBehavior;

    // Apply zoom behavior to SVG
    svg.call(zoomBehavior as any);

    // Apply current transform
    svg.call(zoomBehavior.transform as any, zoomTransform);

    // Calculate visible date range based on zoom/pan transform
    // This ensures the grid always displays for the visible area
    const visibleMinDate = xScale.invert(0);
    const visibleMaxDate = xScale.invert(effectiveWidth);

    // Add buffer days to ensure smooth scrolling (7 days on each side)
    const gridMinDate = new Date(visibleMinDate);
    gridMinDate.setDate(gridMinDate.getDate() - 7);
    const gridMaxDate = new Date(visibleMaxDate);
    gridMaxDate.setDate(gridMaxDate.getDate() + 7);

    // Draw alternating day background for the visible range
    const dayGridGroup = g.append('g').attr('class', 'day-grid');
    const days = timeDay.range(gridMinDate, gridMaxDate);

    // Calculate a consistent starting index based on a reference date for consistent alternating colors
    const referenceDate = new Date(2020, 0, 1); // Fixed reference point
    const daysSinceReference = Math.floor((gridMinDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));

    days.forEach((day, i) => {
      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
      const globalIndex = daysSinceReference + i; // Use global index for consistent coloring
      dayGridGroup
        .append('rect')
        .attr('x', xScale(day))
        .attr('y', 0)
        .attr('width', xScale(timeDay.offset(day, 1)) - xScale(day))
        .attr('height', height)
        .attr('fill', isWeekend ? 'rgba(255,100,100,0.03)' : (globalIndex % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'));
    });

    // Draw current time indicator - positioned at exact current time, not just midnight
    // This makes the line move throughout the day based on current time
    if (now >= visibleMinDate && now <= visibleMaxDate) {
      g.append('line')
        .attr('x1', xScale(now))
        .attr('x2', xScale(now))
        .attr('y1', -20)
        .attr('y2', height)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5')
        .attr('opacity', 0.8);

      g.append('text')
        .attr('x', xScale(now))
        .attr('y', -30)
        .attr('text-anchor', 'middle')
        .attr('fill', '#ef4444')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .text('NOW');
    }

    // Draw X axis with better formatting based on view mode
    // Custom format: Show "Jan 1", "Feb 1" etc. on 1st of month, just day number otherwise
    const monthFormat = timeFormat('%b');
    const customDateFormat = (date: Date) => {
      const day = date.getDate();
      if (day === 1) {
        return `${monthFormat(date)} 1`; // "Jan 1", "Feb 1", etc.
      }
      return String(day); // Just the day number
    };

    let xAxis;
    if (viewMode === 'daily') {
      xAxis = axisBottom(xScale)
        .ticks(timeDay.every(1))
        .tickFormat(customDateFormat as any);
    } else { // monthly
      xAxis = axisBottom(xScale)
        .ticks(timeWeek.every(2))
        .tickFormat(customDateFormat as any);
    }

    const xAxisGroup = g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis);

    xAxisGroup.selectAll('text')
      .attr('fill', '#9ca3af')
      .attr('font-size', '11px');

    xAxisGroup.selectAll('line, path')
      .attr('stroke', '#374151');

    // Draw todo bars with priority-based colors
    const barsGroup = g.append('g').attr('class', 'bars');

    // Create drag indicator group (rendered on top, initially hidden)
    const dragIndicatorGroup = g.append('g')
      .attr('class', 'drag-indicator-group')
      .style('display', 'none');

    // Vertical line for the indicator
    dragIndicatorGroup.append('line')
      .attr('x1', 0)
      .attr('x2', 0)
      .attr('y1', -20)
      .attr('y2', height)
      .attr('stroke', '#64c8ca')
      .attr('stroke-width', 2)
      .attr('opacity', 0.9);

    // Date label background
    dragIndicatorGroup.append('rect')
      .attr('class', 'drag-indicator-label-bg')
      .attr('x', -40)
      .attr('y', -44)
      .attr('width', 80)
      .attr('height', 24)
      .attr('rx', 4)
      .attr('fill', '#64c8ca');

    // Date label text
    dragIndicatorGroup.append('text')
      .attr('class', 'drag-indicator-label')
      .attr('x', 0)
      .attr('y', -27)
      .attr('text-anchor', 'middle')
      .attr('fill', '#1e1e1e')
      .attr('font-size', '12px')
      .attr('font-weight', '600');

    // Store ref to the group for direct updates during drag
    dragIndicatorGroupRef.current = dragIndicatorGroup.node();

    scheduledTodos.forEach((todo, i) => {
      const startDateStr = todo.startDate || todo.createdAt;
      const startDate = parseLocalDate(startDateStr);
      const endDate = parseLocalDate(todo.dueDate!);

      // For meetings, position the bar at the actual time of the meeting
      const isMeeting = todo.type === 'meeting';
      if (isMeeting && todo.meetingDetails?.startTime && todo.meetingDetails?.endTime) {
        const [startHour, startMin] = todo.meetingDetails.startTime.split(':').map(Number);
        const [endHour, endMin] = todo.meetingDetails.endTime.split(':').map(Number);
        startDate.setHours(startHour, startMin, 0, 0);
        endDate.setHours(endHour, endMin, 0, 0);
      }

      const isOverdue = endDate < now && !todo.completed;
      const barHeight = 28;
      const rowHeight = 46;
      const barY = i * rowHeight + (rowHeight - barHeight) / 2;

      const barGroup = barsGroup.append('g')
        .attr('class', 'bar-group')
        .style('cursor', 'grab');

      // Track original positions for drag
      const originalStartX = xScale(startDate);
      let dragStartX = 0;
      let hasDragged = false;

      // Create drag behavior for the bar
      const dragBehavior = drag<SVGGElement, unknown>()
        .on('start', function(event) {
          dragStartX = event.x;
          hasDragged = false;
          select(this).style('cursor', 'grabbing');
          // Hide tooltip during drag
          setHoveredTodo(null);
          setTooltipPos(null);
        })
        .on('drag', function(event) {
          if (!xScaleRef.current) return;

          const dx = event.x - dragStartX;
          if (Math.abs(dx) > 5) {
            hasDragged = true;
          }

          // Calculate new position
          const newX = originalStartX + dx;
          const targetDate = xScaleRef.current.invert(newX);

          // Snap to day start using D3's timeDay for consistency with axis ticks
          const snappedDate = timeDay.floor(targetDate);
          const snappedX = xScaleRef.current(snappedDate);

          // Move the entire bar group
          select(this).attr('transform', `translate(${snappedX - originalStartX}, 0)`);

          // Update drag indicator - use chart coordinates directly for perfect alignment
          // snappedX is already in the chart coordinate system (same as axis ticks)
          setDragIndicator({
            chartX: snappedX,
            date: snappedDate,
            todoId: todo.id
          });

          // Also update the SVG indicator group directly for immediate visual feedback
          if (dragIndicatorGroupRef.current) {
            const indicatorGroup = select(dragIndicatorGroupRef.current);
            indicatorGroup
              .attr('transform', `translate(${snappedX}, 0)`)
              .style('display', 'block');

            // Update the date label text
            indicatorGroup.select('.drag-indicator-label')
              .text(snappedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
          }
        })
        .on('end', function(event) {
          select(this).style('cursor', 'grab');

          // Clear drag indicator
          setDragIndicator(null);

          // Hide the SVG indicator group
          if (dragIndicatorGroupRef.current) {
            select(dragIndicatorGroupRef.current).style('display', 'none');
          }

          if (!hasDragged || !xScaleRef.current) {
            // Reset position if not dragged significantly
            select(this).attr('transform', null);
            return;
          }

          const dx = event.x - dragStartX;
          const newX = originalStartX + dx;
          const targetDate = xScaleRef.current.invert(newX);

          // Snap to day start using D3's timeDay for consistency with axis ticks
          const snappedDate = timeDay.floor(targetDate);

          // Calculate original dates using timeDay.floor for consistency
          const origStartDate = timeDay.floor(parseLocalDate(todo.startDate || todo.createdAt));
          const origEndDate = timeDay.floor(parseLocalDate(todo.dueDate!));

          // Calculate duration in days
          const durationMs = origEndDate.getTime() - origStartDate.getTime();

          // Calculate new dates
          const newStartDate = snappedDate;
          const newEndDate = new Date(newStartDate.getTime() + durationMs);

          // Check if date actually changed
          if (newStartDate.getTime() === origStartDate.getTime()) {
            select(this).attr('transform', null);
            return;
          }

          // Reset bar position (will be re-rendered with new data)
          select(this).attr('transform', null);

          // Check if this is a recurring meeting
          const isRecurring = todo.type === 'meeting' && todo.meetingDetails &&
            ((todo.meetingDetails.recurrence?.type && todo.meetingDetails.recurrence.type !== 'none') ||
             (todo.meetingDetails.repeat && todo.meetingDetails.repeat !== 'none'));

          // Helper to format date as YYYY-MM-DD using local time (not UTC)
          const formatLocalDate = (date: Date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          };

          // Call the callback
          if (onDateDragEndRef.current) {
            onDateDragEndRef.current({
              todo,
              oldStartDate: formatLocalDate(origStartDate),
              oldEndDate: formatLocalDate(origEndDate),
              newStartDate: formatLocalDate(newStartDate),
              newEndDate: formatLocalDate(newEndDate),
              isRecurring: !!isRecurring
            });
          }
        });

      // Apply drag behavior to bar group
      barGroup.call(dragBehavior as any);

      // Normalize priority to P1, P2, P3, P4 format
      let priorityKey: 'P1' | 'P2' | 'P3' | 'P4' | null = null;
      if (todo.priority) {
        if (typeof todo.priority === 'number') {
          priorityKey = `P${todo.priority}` as 'P1' | 'P2' | 'P3' | 'P4';
        } else {
          priorityKey = todo.priority;
        }
      }

      // Meetings use their custom color, otherwise use priority/list colors
      let barColor: string;
      if (isMeeting && todo.meetingDetails?.color) {
        barColor = todo.meetingDetails.color;
      } else if (isOverdue) {
        barColor = '#dc2626';
      } else if (priorityKey) {
        barColor = PRIORITY_COLORS[priorityKey];
      } else {
        barColor = todo.listColors?.[0] || '#64c8ca';
      }

      // Calculate actual width based on start/end dates (which include meeting times if applicable)
      const actualWidth = xScale(endDate) - xScale(startDate);

      // For meetings, use the actual time-based width (startDate/endDate already have times set)
      // Only apply a small fixed minimum to keep it visible when zoomed out
      // For tasks, use actual date span with minimum width
      let barWidth: number;
      if (isMeeting) {
        // Meetings: use actual duration width with minimal minimum (2px)
        // At low zoom, meetings appear as thin lines; at high zoom, they show true duration
        barWidth = Math.max(2, actualWidth);
      } else {
        // Tasks: use actual width with fixed minimum
        barWidth = Math.max(30, actualWidth);
      }
      
      // Background bar (subtle)
      barGroup
        .append('rect')
        .attr('class', 'task-bar-bg')
        .attr('x', xScale(startDate))
        .attr('y', barY)
        .attr('width', barWidth)
        .attr('height', barHeight)
        .attr('rx', 6)
        .attr('fill', barColor)
        .attr('opacity', 0.2)
        .attr('stroke', barColor)
        .attr('stroke-width', 1);

      // Main task bar - faded if completed
      barGroup
        .append('rect')
        .attr('class', 'task-bar')
        .attr('x', xScale(startDate))
        .attr('y', barY)
        .attr('width', barWidth)
        .attr('height', barHeight)
        .attr('rx', 6)
        .attr('fill', barColor)
        .attr('opacity', todo.completed ? 0.4 : 0.9)
        .attr('stroke', priorityKey ? barColor : 'none')
        .attr('stroke-width', priorityKey ? 2 : 0)
        .on('mouseenter', function(event) {
          // Only process if not already hovering this specific todo
          if (currentHoveredIdRef.current === todo.id) {
            return;
          }
          currentHoveredIdRef.current = todo.id;

          // Clear any pending hide timeout
          if (tooltipTimeoutRef.current) {
            clearTimeout(tooltipTimeoutRef.current);
            tooltipTimeoutRef.current = null;
          }

          // Use class for CSS transition instead of D3 transition
          select(this).classed('bar-hovered', true);

          setHoveredTodo(todo);
          setTooltipPos({ x: event.pageX, y: event.pageY });
        })
        .on('mousemove', function(event) {
          if (currentHoveredIdRef.current === todo.id) {
            setTooltipPos({ x: event.pageX, y: event.pageY });
          }
        })
        .on('mouseleave', function() {
          // Only clear if we're leaving the current hovered todo
          if (currentHoveredIdRef.current === todo.id) {
            currentHoveredIdRef.current = null;

            // Remove hover class
            select(this).classed('bar-hovered', false);

            // Immediate hide - no delay
            setHoveredTodo(null);
            setTooltipPos(null);
          }
        })
        .on('click', () => {
          // Only trigger click if we didn't drag
          if (!hasDragged && onTodoClickRef.current) {
            onTodoClickRef.current(todo);
          }
        });


      // Task text on bar (if space available)
      if (barWidth > 80) {
        const displayText = todo.text.length > 25 ? todo.text.substring(0, 25) + '...' : todo.text;
        barGroup
          .append('text')
          .attr('x', xScale(startDate) + 12)
          .attr('y', barY + barHeight / 2)
          .attr('dominant-baseline', 'middle')
          .attr('fill', 'white')
          .attr('font-size', '12px')
          .attr('font-weight', '500')
          .attr('text-decoration', todo.completed ? 'line-through' : 'none')
          .attr('opacity', todo.completed ? 0.7 : 1)
          .text(displayText);
      }

      // Overdue warning indicator moved to left sidebar

    });

    // Priority legend removed - colors speak for themselves

  }, [dimensions, scheduledTodos, viewMode, showCompleted, effectiveWidth, zoomTransform]);

  // Zoom control functions - directly update state for reliable behavior
  // Zoom increments: 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, ...
  const ZOOM_STEP = 0.25;
  const MIN_ZOOM = 0.5;  // 50%
  const MAX_ZOOM = 4.0;  // 400%

  const handleZoomIn = useCallback(() => {
    setZoomTransform(prev => {
      const newK = Math.min(prev.k + ZOOM_STEP, MAX_ZOOM);
      // Keep the center point the same when zooming
      const centerX = effectiveWidth / 2;
      const newX = centerX - (centerX - prev.x) * (newK / prev.k);
      return zoomIdentity.translate(newX, 0).scale(newK);
    });
  }, [effectiveWidth]);

  const handleZoomOut = useCallback(() => {
    setZoomTransform(prev => {
      const newK = Math.max(prev.k - ZOOM_STEP, MIN_ZOOM);
      // Keep the center point the same when zooming
      const centerX = effectiveWidth / 2;
      const newX = centerX - (centerX - prev.x) * (newK / prev.k);
      return zoomIdentity.translate(newX, 0).scale(newK);
    });
  }, [effectiveWidth]);

  // Go to Today - reset to identity transform which centers on today
  const handleGoToToday = useCallback(() => {
    setZoomTransform(zoomIdentity);
  }, []);

  // Get current zoom level percentage
  const zoomLevel = Math.round(zoomTransform.k * 100);

  return (
    <div className="gantt-timeline-container" ref={containerRef}>
      {/* Control Panel - matching TodoPanel style */}
      <div className="timeline-filters">
        <div className="filter-tabs">
          <button
            className={`filter-tab ${viewMode === 'daily' ? 'active' : ''}`}
            onClick={() => setViewMode('daily')}
          >
            Daily
          </button>
          <button
            className={`filter-tab ${viewMode === 'monthly' ? 'active' : ''}`}
            onClick={() => setViewMode('monthly')}
          >
            Monthly
          </button>
        </div>

        {/* Zoom Controls - only show in daily view */}
        {viewMode === 'daily' && scheduledTodos.length > 0 && (
          <div
            className="zoom-controls"
            style={{ cursor: 'default' }}
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onMouseUp={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onPointerUp={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onTouchStart={(e) => { e.stopPropagation(); }}
          >
            <button
              className="zoom-btn today-btn"
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleGoToToday(); }}
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
              title="Go to Today"
            >
              <Home size={14} />
            </button>
            <div className="zoom-divider" />
            <button
              className="zoom-btn"
              style={{ cursor: zoomLevel <= 50 ? 'not-allowed' : 'pointer' }}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleZoomOut(); }}
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
              title="Zoom Out"
              disabled={zoomLevel <= 50}
            >
              <ZoomOut size={16} />
            </button>
            <button
              className="zoom-level"
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleGoToToday(); }}
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
              title="Reset to 100%"
            >
              {zoomLevel}%
            </button>
            <button
              className="zoom-btn"
              style={{ cursor: zoomLevel >= 400 ? 'not-allowed' : 'pointer' }}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleZoomIn(); }}
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
              title="Zoom In"
              disabled={zoomLevel >= 400}
            >
              <ZoomIn size={16} />
            </button>
          </div>
        )}

        <div className="filter-actions">
          <label className="show-completed-toggle">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            <span>Show done ({scheduledTodos.filter(t => t.completed).length})</span>
          </label>

          <div className="task-stats">
            <span>Total: {scheduledTodos.length}</span>
            <span className="stat-separator">•</span>
            <span>Unscheduled: {unscheduledTodos.length}</span>
          </div>
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="timeline-content-scroll">
        {scheduledTodos.length > 0 ? (
          viewMode === 'monthly' ? (
            // Calendar View for Monthly Mode
            <CalendarMonthView
              todos={scheduledTodos}
              onTodoClick={(todo) => onTodoClickRef.current && onTodoClickRef.current(todo)}
              onAddTask={onAddTask}
            />
          ) : (
          <div style={{ display: 'flex', minHeight: '100%' }}>
            {/* Fixed left column with task titles */}
            <div style={{
              width: '200px',
              flexShrink: 0,
              background: '#1e1e1e',
              borderRight: '1px solid #2d2d2d',
              overflow: 'hidden'
            }}>
              <div style={{ height: '100%', position: 'relative' }}>
                {scheduledTodos.map((todo, i) => {
                  const rowHeight = 46;
                  const barHeight = 28;
                  const y = i * rowHeight + (rowHeight - barHeight) / 2 + 40; // +40 for top margin

                  return (
                    <div
                      key={todo.id}
                      style={{
                        position: 'absolute',
                        top: `${y}px`,
                        left: '8px',
                        right: '8px',
                        height: `${barHeight}px`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: todo.completed ? '#888' : '#e5e7eb',
                        fontSize: '12px',
                        fontWeight: '500',
                        textDecoration: todo.completed ? 'line-through' : 'none',
                        cursor: 'pointer',
                        overflow: 'hidden'
                      }}
                      onClick={() => {
                        if (onTodoClickRef.current) onTodoClickRef.current(todo);
                      }}
                    >
                      {todo.type === 'meeting' && (
                        <Video
                          size={12}
                          style={{
                            flexShrink: 0,
                            marginRight: '4px',
                            color: todo.meetingDetails?.color || '#64c8ca'
                          }}
                        />
                      )}
                      <span style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1
                      }}>
                        {todo.text}
                      </span>
                      {/* Overdue warning indicator */}
                      {!todo.completed && todo.dueDate && parseLocalDate(todo.dueDate) < new Date() && (
                        <span title="Overdue">
                          <AlertTriangle
                            size={14}
                            style={{
                              flexShrink: 0,
                              color: '#ef4444'
                            }}
                          />
                        </span>
                      )}
                      {todo.listNames.length > 0 && (
                        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                          {todo.listNames.map((name, idx) => {
                            // Get the email from listIds to look up member
                            const email = (todo as any).listIds?.[idx] || '';
                            // Find member by email (handles encoded Firebase keys)
                            const member = members?.[email] || (members && Object.values(members).find(m => m.email?.toLowerCase() === email.toLowerCase()));
                            const avatarUrl = member?.customAvatar || member?.photoURL;
                            return (
                            <div
                              key={`${todo.id}-${name}`}
                              style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #64c8ca, #52b6b8)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '9px',
                                fontWeight: '600',
                                color: '#1e1e1e',
                                border: '1.5px solid #1e1e1e',
                                overflow: 'hidden'
                              }}
                              title={member?.displayName || name}
                            >
                              {avatarUrl ? (
                                <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                name.substring(0, 2).toUpperCase()
                              )}
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Scrollable right area with SVG chart */}
            <div className="timeline-scroll-area" style={{ flex: 1, overflowX: 'hidden', overflowY: 'hidden', background: '#1e1e1e' }}>
              <svg ref={svgRef} width={effectiveWidth || dimensions.width} height={dimensions.height} />
            </div>
          </div>
          )
        ) : (
          <div className="empty-timeline">
            <CalendarIcon className="empty-icon-svg" />
            <h3>No scheduled tasks</h3>
            <p>Add due dates to your tasks to see them on the timeline</p>
          </div>
        )}

        {/* Unscheduled todos section */}
        {unscheduledTodos.length > 0 && (
          <div className="unscheduled-todos">
          <h3 className="unscheduled-todos-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} /> Todos without dates ({unscheduledTodos.length})
          </h3>
          <div className="unscheduled-todos-list">
            {unscheduledTodos.map((todo) => (
              <div
                key={todo.id}
                className="unscheduled-todo-item"
                onClick={() => onTodoClickRef.current && onTodoClickRef.current(todo)}
              >
                <div
                  className="unscheduled-todo-indicator"
                  style={{ backgroundColor: '#64c8ca' }}
                />
                <div className="unscheduled-todo-content">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      className="unscheduled-todo-text"
                      style={{
                        textDecoration: todo.completed ? 'line-through' : 'none',
                        opacity: todo.completed ? 0.6 : 1,
                        flex: 1
                      }}
                    >
                      {todo.text}
                    </div>
                    {todo.listNames.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {todo.listNames.map((name, idx) => {
                          // Get the email from listIds to look up member
                          const email = (todo as any).listIds?.[idx] || '';
                          // Find member by email (handles encoded Firebase keys)
                          const member = members?.[email] || (members && Object.values(members).find(m => m.email?.toLowerCase() === email.toLowerCase()));
                          const avatarUrl = member?.customAvatar || member?.photoURL;
                          return (
                          <div
                            key={`${todo.id}-${name}`}
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              background: 'linear-gradient(135deg, #64c8ca, #52b6b8)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '9px',
                              fontWeight: '600',
                              color: '#1e1e1e',
                              border: '1.5px solid #2d2d2d',
                              overflow: 'hidden'
                            }}
                            title={member?.displayName || name}
                          >
                            {avatarUrl ? (
                              <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              name.substring(0, 2).toUpperCase()
                            )}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="unscheduled-todo-meta">
                    {todo.linkedNote ? (
                      <>
                        <span style={{ color: '#64c8ca' }}>[[{todo.linkedNote}]]</span>
                        {' • '}
                      </>
                    ) : null}
                    No due date set
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </div>

      {/* Tooltip */}
      {hoveredTodo && tooltipPos && (
        <div
          className="gantt-tooltip"
          style={{
            left: `${tooltipPos.x + 15}px`,
            top: `${tooltipPos.y + 15}px`
          }}
        >
          <div className="gantt-tooltip-title">{hoveredTodo.text}</div>

          {hoveredTodo.startDate && (
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">Start:</span>
              <span className="gantt-tooltip-value">
                {parseLocalDate(hoveredTodo.startDate!).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric'
                })}
              </span>
            </div>
          )}

          {hoveredTodo.dueDate && (
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">Due:</span>
              <span className="gantt-tooltip-value">
                {parseLocalDate(hoveredTodo.dueDate!).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric'
                })}
              </span>
            </div>
          )}

          {hoveredTodo.type === 'meeting' && hoveredTodo.meetingDetails && (
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">Time:</span>
              <span className="gantt-tooltip-value">
                {(() => {
                  // Convert 24-hour time to 12-hour format with AM/PM
                  const formatTime12h = (time: string) => {
                    const [hours, minutes] = time.split(':').map(Number);
                    const period = hours >= 12 ? 'PM' : 'AM';
                    const hours12 = hours % 12 || 12;
                    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
                  };
                  return `${formatTime12h(hoveredTodo.meetingDetails!.startTime)} - ${formatTime12h(hoveredTodo.meetingDetails!.endTime)}`;
                })()}
              </span>
            </div>
          )}

          {hoveredTodo.type === 'meeting' && hoveredTodo.meetingDetails?.repeat !== 'none' && (
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">Repeat:</span>
              <span className="gantt-tooltip-value" style={{ textTransform: 'capitalize' }}>
                {hoveredTodo.meetingDetails?.repeat}
              </span>
            </div>
          )}

          {hoveredTodo.priority && hoveredTodo.type !== 'meeting' && (
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">Priority:</span>
              <span
                className="gantt-tooltip-priority"
                style={{
                  backgroundColor: typeof hoveredTodo.priority === 'number'
                    ? PRIORITY_COLORS[`P${hoveredTodo.priority}` as keyof typeof PRIORITY_COLORS]
                    : PRIORITY_COLORS[hoveredTodo.priority as keyof typeof PRIORITY_COLORS]
                }}
              >
                {hoveredTodo.priority}
              </span>
            </div>
          )}

          {hoveredTodo.linkedNote && (
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">Note:</span>
              <span className="gantt-tooltip-value" style={{ color: '#64c8ca' }}>
                [[{hoveredTodo.linkedNote}]]
              </span>
            </div>
          )}

          {hoveredTodo.description && (
            <div className="gantt-tooltip-description">
              {hoveredTodo.description}
            </div>
          )}
        </div>
      )}

      {/* Drag Date Indicator is now rendered in SVG for perfect alignment with axis ticks */}
    </div>
  );
};

export default EnhancedGanttTimeline;