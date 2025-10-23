import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { select } from 'd3-selection';
import { scaleTime } from 'd3-scale';
import { axisBottom } from 'd3-axis';
import { timeDay, timeWeek } from 'd3-time';
import { timeFormat } from 'd3-time-format';
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

const EnhancedGanttTimeline: React.FC<GanttTimelineProps> = ({ 
  lists, 
  onTodoClick,
  onTodoToggle 
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [hoveredTodo, setHoveredTodo] = useState<(Todo & { listName: string; listColor: string }) | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');
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
  const effectiveWidth = viewMode === 'daily' ? dimensions.width * 1.5 : dimensions.width;

  // Separate todos into scheduled and unscheduled - memoized to prevent recreation
  const { scheduledTodos, unscheduledTodos } = useMemo(() => {
    const scheduled: Array<Todo & { listName: string; listColor: string }> = [];
    const unscheduled: Array<Todo & { listName: string; listColor: string }> = [];

    lists.forEach((list, idx) => {
      const color = list.color || LIST_COLORS[idx % LIST_COLORS.length];
      list.todos.forEach((todo) => {
        const shouldShow = showCompleted || !todo.completed;
        if (shouldShow) {
          const todoWithList = { ...todo, listName: list.name, listColor: color };
          if (todo.due_date) {
            scheduled.push(todoWithList);
          } else {
            unscheduled.push(todoWithList);
          }
        }
      });
    });

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
        const height = Math.max(400, scheduledTodos.length * 70 + 120);
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
    } else if (viewMode === 'weekly') {
      xAxis = axisBottom(xScale)
        .ticks(timeWeek.every(1))
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
      {/* Control Panel */}
      <div style={{ 
        padding: '16px 20px', 
        background: '#1a1a1a', 
        borderBottom: '1px solid #333',
        display: 'flex',
        gap: '16px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setViewMode('daily')}
            style={{
              padding: '6px 14px',
              background: viewMode === 'daily' ? '#64c8ca' : '#2a2a2a',
              border: 'none',
              borderRadius: '6px',
              color: viewMode === 'daily' ? '#000' : '#ddd',
              fontSize: '13px',
              fontWeight: viewMode === 'daily' ? '600' : '400',
              cursor: 'pointer'
            }}
          >
            Daily
          </button>
          <button
            onClick={() => setViewMode('weekly')}
            style={{
              padding: '6px 14px',
              background: viewMode === 'weekly' ? '#64c8ca' : '#2a2a2a',
              border: 'none',
              borderRadius: '6px',
              color: viewMode === 'weekly' ? '#000' : '#ddd',
              fontSize: '13px',
              fontWeight: viewMode === 'weekly' ? '600' : '400',
              cursor: 'pointer'
            }}
          >
            Weekly
          </button>
          <button
            onClick={() => setViewMode('monthly')}
            style={{
              padding: '6px 14px',
              background: viewMode === 'monthly' ? '#64c8ca' : '#2a2a2a',
              border: 'none',
              borderRadius: '6px',
              color: viewMode === 'monthly' ? '#000' : '#ddd',
              fontSize: '13px',
              fontWeight: viewMode === 'monthly' ? '600' : '400',
              cursor: 'pointer'
            }}
          >
            Monthly
          </button>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ddd', fontSize: '13px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Show completed tasks
        </label>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', fontSize: '12px', color: '#888' }}>
          <span>Total: {scheduledTodos.length} tasks</span>
          <span>•</span>
          <span>Unscheduled: {unscheduledTodos.length}</span>
        </div>
      </div>

      {scheduledTodos.length > 0 ? (
        <div style={{ display: 'flex', height: dimensions.height, overflow: 'hidden' }}>
          {/* Fixed left column with task titles */}
          <div style={{
            width: '200px',
            flexShrink: 0,
            background: '#1a1a1a',
            borderRight: '1px solid #333',
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
                      color: todo.completed ? '#888' : '#e5e7eb',
                      fontSize: '13px',
                      fontWeight: '500',
                      textDecoration: todo.completed ? 'line-through' : 'none',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                    onClick={() => {
                      if (onTodoClickRef.current) onTodoClickRef.current(todo);
                    }}
                  >
                    {todo.text}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Scrollable right area with SVG chart */}
          <div className="timeline-scroll-area" style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
            <svg ref={svgRef} width={effectiveWidth || dimensions.width} height={dimensions.height} />
          </div>
        </div>
      ) : (
        <div className="empty-timeline">
          <div className="empty-timeline-icon">📅</div>
          <p className="empty-timeline-text">No scheduled todos</p>
          <p className="empty-timeline-hint">Add due dates to your todos to see them here</p>
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
                  <div
                    className="unscheduled-todo-text"
                    style={{
                      textDecoration: todo.completed ? 'line-through' : 'none',
                      opacity: todo.completed ? 0.6 : 1
                    }}
                  >
                    {todo.text}
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