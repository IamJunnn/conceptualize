import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { select } from 'd3-selection';
import { scaleTime } from 'd3-scale';
import { axisBottom } from 'd3-axis';
import { timeDay, timeWeek } from 'd3-time';
import { timeFormat } from 'd3-time-format';
import { CalendarIcon, PlusIcon } from '@heroicons/react/24/outline';
import './GanttTimeline.css';

interface Todo {
  id: string;
  text: string;
  completed: boolean; // Simple checkbox - done or not done
  due_date?: string;
  start_date?: string;
  created_at: string;
  linked_note?: string;
  list_id?: string;
  description?: string;
  priority?: number | 'P1' | 'P2' | 'P3' | 'P4'; // Bar color based on priority (can be number or string)
}

interface TodoList {
  id: string;
  name: string;
  icon: string;
  todos: Todo[];
  color?: string;
}

interface GanttTimelineProps {
  lists: TodoList[];
  onTodoClick?: (todo: Todo) => void;
  onTodoToggle?: (todoId: string, completed: boolean) => void; // Toggle checkbox
  onAddTask?: () => void; // Optional callback to add a task
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

// Calendar Month View Component
interface CalendarMonthViewProps {
  todos: Array<Todo & { listNames: string[]; listColors: string[] }>;
  onTodoClick: (todo: Todo) => void;
}

const CalendarMonthView: React.FC<CalendarMonthViewProps> = ({ todos, onTodoClick }) => {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

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

  // Calculate multi-day event spans for each week
  const eventSpans = useMemo(() => {
    const spans: Array<{
      todo: typeof todos[0];
      weekIdx: number;
      startCol: number;
      span: number;
      isStart: boolean;
      isEnd: boolean;
    }> = [];

    todos.forEach(todo => {
      if (todo.due_date) {
        const startDate = todo.start_date ? new Date(todo.start_date) : new Date(todo.due_date);
        const endDate = new Date(todo.due_date);

        // Find which weeks this event spans
        weeks.forEach((week, weekIdx) => {
          const weekStart = week[0];
          const weekEnd = week[6];

          // Check if event overlaps with this week
          if (startDate <= weekEnd && endDate >= weekStart) {
            // Calculate start column (0-6)
            let startCol = 0;
            for (let i = 0; i < 7; i++) {
              if (startDate <= week[i]) {
                startCol = i;
                break;
              }
            }

            // Calculate end column
            let endCol = 6;
            for (let i = 6; i >= 0; i--) {
              if (endDate >= week[i]) {
                endCol = i;
                break;
              }
            }

            const span = endCol - startCol + 1;
            const isStart = startDate >= weekStart && startDate <= weekEnd;
            const isEnd = endDate >= weekStart && endDate <= weekEnd;

            spans.push({ todo, weekIdx, startCol, span, isStart, isEnd });
          }
        });
      }
    });

    return spans;
  }, [todos, weeks]);

  const isToday = (date: Date) => {
    return date.toDateString() === new Date().toDateString();
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentMonth.getMonth();
  };

  return (
    <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Month Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <button
          onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
          style={{
            background: '#2d2d2d',
            border: '1px solid #3d3d3d',
            borderRadius: '6px',
            color: '#e0e0e0',
            padding: '8px 16px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          ← Previous
        </button>
        <h3 style={{ margin: 0, color: '#e0e0e0', fontSize: '18px', fontWeight: '600' }}>
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </h3>
        <button
          onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
          style={{
            background: '#2d2d2d',
            border: '1px solid #3d3d3d',
            borderRadius: '6px',
            color: '#e0e0e0',
            padding: '8px 16px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Next →
        </button>
      </div>

      {/* Calendar Grid */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #2d2d2d', borderRadius: '8px', overflow: 'hidden' }}>
        {/* Day Names Header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#2d2d2d', borderBottom: '1px solid #3d3d3d' }}>
          {dayNames.map(day => (
            <div key={day} style={{ padding: '12px', textAlign: 'center', color: '#888', fontSize: '12px', fontWeight: '600' }}>
              {day}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {weeks.map((week, weekIdx) => {
            const weekSpans = eventSpans.filter(span => span.weekIdx === weekIdx);

            return (
              <div key={weekIdx} style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {/* Event bars layer */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '28px 0 0 0' }}>
                  {weekSpans.map((span, idx) => {
                    const priorityColor = PRIORITY_COLORS[`P${span.todo.priority}` as keyof typeof PRIORITY_COLORS] || '#64c8ca';
                    return (
                      <div
                        key={`${span.todo.id}-${span.startCol}`}
                        onClick={() => onTodoClick(span.todo)}
                        style={{
                          gridColumn: `${span.startCol + 1} / span ${span.span}`,
                          marginTop: `${idx * 26}px`,
                          height: '22px',
                          background: priorityColor,
                          borderRadius: span.isStart && span.isEnd ? '4px' : span.isStart ? '4px 0 0 4px' : span.isEnd ? '0 4px 4px 0' : '0',
                          padding: '2px 8px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: '500',
                          color: '#1e1e1e',
                          textDecoration: span.todo.completed ? 'line-through' : 'none',
                          opacity: span.todo.completed ? 0.6 : 0.95,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          marginLeft: '4px',
                          marginRight: '4px',
                          pointerEvents: 'auto',
                          transition: 'opacity 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = span.todo.completed ? '0.6' : '0.95'}
                      >
                        {span.isStart && span.todo.text}
                      </div>
                    );
                  })}
                </div>

                {/* Calendar grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: weekIdx < weeks.length - 1 ? '1px solid #2d2d2d' : 'none', flex: 1 }}>
                  {week.map((date, dayIdx) => {
                    const isTodayDate = isToday(date);
                    const isInCurrentMonth = isCurrentMonth(date);

                    return (
                      <div
                        key={dayIdx}
                        style={{
                          padding: '8px',
                          borderRight: dayIdx < 6 ? '1px solid #2d2d2d' : 'none',
                          background: isTodayDate ? 'rgba(100, 200, 202, 0.05)' : 'transparent',
                          opacity: isInCurrentMonth ? 1 : 0.4,
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: '100px'
                        }}
                      >
                        {/* Date Number */}
                        <div style={{
                          fontSize: '12px',
                          fontWeight: isTodayDate ? '700' : '500',
                          color: isTodayDate ? '#64c8ca' : '#e0e0e0',
                          marginBottom: '4px'
                        }}>
                          {date.getDate()}
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
    </div>
  );
};

const EnhancedGanttTimeline: React.FC<GanttTimelineProps> = ({
  lists,
  onTodoClick,
  onTodoToggle,
  onAddTask
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [hoveredTodo, setHoveredTodo] = useState<(Todo & { listNames: string[]; listColors: string[] }) | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
  const [showCompleted, setShowCompleted] = useState(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('gantt-show-completed');
    return saved !== null ? saved === 'true' : true;
  });
  const tooltipTimeoutRef = useRef<number | null>(null);
  const currentHoveredIdRef = useRef<string | null>(null);
  const onTodoClickRef = useRef(onTodoClick);
  const onTodoToggleRef = useRef(onTodoToggle);

  // Keep refs updated
  useEffect(() => {
    onTodoClickRef.current = onTodoClick;
    onTodoToggleRef.current = onTodoToggle;
  });

  // Save showCompleted preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('gantt-show-completed', String(showCompleted));
  }, [showCompleted]);

  // Calculate effective width for SVG based on view mode
  // Remove the width multiplication to prevent horizontal scrolling
  const effectiveWidth = dimensions.width;

  // Separate todos into scheduled and unscheduled - memoized to prevent recreation
  const { scheduledTodos, unscheduledTodos } = useMemo(() => {
    const scheduledMap: Map<string, Todo & { listNames: string[]; listColors: string[] }> = new Map();
    const unscheduledMap: Map<string, Todo & { listNames: string[]; listColors: string[] }> = new Map();

    lists.forEach((list, idx) => {
      const color = list.color || LIST_COLORS[idx % LIST_COLORS.length];
      list.todos.forEach((todo) => {
        const shouldShow = showCompleted || !todo.completed;
        if (shouldShow) {
          if (todo.due_date) {
            // Add to scheduled, combining assignees if already exists
            const existing = scheduledMap.get(todo.id);
            if (existing) {
              // Only add if not already in the list (avoid duplicates)
              if (!existing.listNames.includes(list.name)) {
                existing.listNames.push(list.name);
                existing.listColors.push(color);
              }
            } else {
              scheduledMap.set(todo.id, { ...todo, listNames: [list.name], listColors: [color] });
            }
          } else {
            // Add to unscheduled, combining assignees if already exists
            const existing = unscheduledMap.get(todo.id);
            if (existing) {
              // Only add if not already in the list (avoid duplicates)
              if (!existing.listNames.includes(list.name)) {
                existing.listNames.push(list.name);
                existing.listColors.push(color);
              }
            } else {
              unscheduledMap.set(todo.id, { ...todo, listNames: [list.name], listColors: [color] });
            }
          }
        }
      });
    });

    const scheduled = Array.from(scheduledMap.values());
    const unscheduled = Array.from(unscheduledMap.values());

    // Sort by start date (or created_at)
    scheduled.sort((a, b) => {
      const dateA = new Date(a.start_date || a.created_at);
      const dateB = new Date(b.start_date || b.created_at);
      return dateA.getTime() - dateB.getTime();
    });

    return { scheduledTodos: scheduled, unscheduledTodos: unscheduled };
  }, [lists, showCompleted]);

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
        // Calculate height based on content, with proper padding
        const height = scheduledTodos.length > 0
          ? Math.max(300, scheduledTodos.length * 70 + 100)
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
    const width = effectiveWidth - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Get date range
    const now = new Date();
    const dates = scheduledTodos.flatMap(t => {
      const endDate = new Date(t.due_date!);
      const startDateStr = t.start_date || t.created_at;
      const startDate = new Date(startDateStr);
      return [startDate, endDate];
    });

    const minDate = new Date(Math.min(...dates.map(d => d.getTime()), now.getTime()));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime()), now.getTime()));

    // Keep the timeline focused around TODAY - only show 1 day before the earliest relevant date
    // This prevents showing too much empty space on the left
    minDate.setDate(minDate.getDate() - 1);
    maxDate.setDate(maxDate.getDate() + 7);

    // Create scales
    const xScale = scaleTime()
      .domain([minDate, maxDate])
      .range([0, effectiveWidth]);

    // Draw alternating day background
    const dayGridGroup = g.append('g').attr('class', 'day-grid');
    const days = timeDay.range(minDate, maxDate);
    
    days.forEach((day, i) => {
      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
      dayGridGroup
        .append('rect')
        .attr('x', xScale(day))
        .attr('y', 0)
        .attr('width', xScale(timeDay.offset(day, 1)) - xScale(day))
        .attr('height', height)
        .attr('fill', isWeekend ? 'rgba(255,100,100,0.03)' : (i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'));
    });

    // Draw current date indicator
    if (now >= minDate && now <= maxDate) {
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
        .text('TODAY');
    }

    // Draw X axis with better formatting based on view mode
    let xAxis;
    if (viewMode === 'daily') {
      xAxis = axisBottom(xScale)
        .ticks(timeDay.every(1))
        .tickFormat(timeFormat('%b %d') as any);
    } else { // monthly
      xAxis = axisBottom(xScale)
        .ticks(timeWeek.every(2))
        .tickFormat(timeFormat('%b %d') as any);
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

    scheduledTodos.forEach((todo, i) => {
      const startDateStr = todo.start_date || todo.created_at;
      const startDate = new Date(startDateStr);
      const endDate = new Date(todo.due_date!);

      const isOverdue = endDate < now && !todo.completed;
      const barHeight = 32;
      const rowHeight = 70; // Explicit row height for spacing
      const barY = i * rowHeight + (rowHeight - barHeight) / 2;

      const barGroup = barsGroup.append('g')
        .attr('class', 'bar-group')
        .style('cursor', 'pointer');

      // Determine bar color: overdue takes priority, then priority level, fallback to list color
      // Normalize priority to P1, P2, P3, P4 format
      let priorityKey: 'P1' | 'P2' | 'P3' | 'P4' | null = null;
      if (todo.priority) {
        if (typeof todo.priority === 'number') {
          priorityKey = `P${todo.priority}` as 'P1' | 'P2' | 'P3' | 'P4';
        } else {
          priorityKey = todo.priority;
        }
      }

      const barColor = isOverdue
        ? '#dc2626'
        : (priorityKey ? PRIORITY_COLORS[priorityKey] : todo.listColor);

      const barWidth = Math.max(30, xScale(endDate) - xScale(startDate));
      
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
          if (onTodoClickRef.current) onTodoClickRef.current(todo);
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

      // Overdue warning
      if (isOverdue) {
        barGroup
          .append('text')
          .attr('x', xScale(endDate) + 10)
          .attr('y', barY + barHeight / 2)
          .attr('dominant-baseline', 'middle')
          .attr('fill', '#ef4444')
          .attr('font-size', '12px')
          .attr('font-weight', 'bold')
          .text('⚠️');
      }
    });

    // Priority legend removed - colors speak for themselves

  }, [dimensions, scheduledTodos, viewMode, showCompleted, effectiveWidth]);

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
                  const rowHeight = 70;
                  const barHeight = 32;
                  const y = i * rowHeight + (rowHeight - barHeight) / 2 + 40; // +40 for top margin

                  return (
                    <div
                      key={todo.id}
                      style={{
                        position: 'absolute',
                        top: `${y}px`,
                        left: '10px',
                        right: '10px',
                        height: `${barHeight}px`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: todo.completed ? '#888' : '#e5e7eb',
                        fontSize: '13px',
                        fontWeight: '500',
                        textDecoration: todo.completed ? 'line-through' : 'none',
                        cursor: 'pointer',
                        overflow: 'hidden'
                      }}
                      onClick={() => {
                        if (onTodoClickRef.current) onTodoClickRef.current(todo);
                      }}
                    >
                      <span style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1
                      }}>
                        {todo.text}
                      </span>
                      {todo.listNames.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                          {todo.listNames.map((name, idx) => (
                            <div
                              key={`${todo.id}-${name}`}
                              style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #64c8ca, #52b6b8)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                fontWeight: '600',
                                color: '#1e1e1e',
                                border: '2px solid #1e1e1e'
                              }}
                              title={name}
                            >
                              {name.substring(0, 2).toUpperCase()}
                            </div>
                          ))}
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
            {onAddTask && (
              <button className="create-first-btn" onClick={onAddTask}>
                <PlusIcon className="btn-icon" />
                Create Task
              </button>
            )}
          </div>
        )}

        {/* Unscheduled todos section */}
        {unscheduledTodos.length > 0 && (
          <div className="unscheduled-todos">
          <h3 className="unscheduled-todos-title">
            ⚠️ Todos without dates ({unscheduledTodos.length})
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
                        {todo.listNames.map((name, idx) => (
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
                              border: '1.5px solid #2d2d2d'
                            }}
                            title={name}
                          >
                            {name.substring(0, 2).toUpperCase()}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="unscheduled-todo-meta">
                    {todo.linked_note ? (
                      <>
                        <span style={{ color: '#64c8ca' }}>[[{todo.linked_note}]]</span>
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

          {hoveredTodo.start_date && (
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">Start:</span>
              <span className="gantt-tooltip-value">
                {new Date(hoveredTodo.start_date).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric'
                })}
              </span>
            </div>
          )}

          {hoveredTodo.due_date && (
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">Due:</span>
              <span className="gantt-tooltip-value">
                {new Date(hoveredTodo.due_date).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric'
                })}
              </span>
            </div>
          )}

          {hoveredTodo.priority && (
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

          {hoveredTodo.linked_note && (
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">Note:</span>
              <span className="gantt-tooltip-value" style={{ color: '#64c8ca' }}>
                [[{hoveredTodo.linked_note}]]
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
    </div>
  );
};

export default EnhancedGanttTimeline;