/**
 * ScheduleGrid Component
 * A weekly grid view for editing work schedules
 * Displays hours as rows and days as columns
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  TimeBlock,
  DayOfWeek,
  DAY_SHORT_NAMES,
  SCHEDULE_COLORS,
  timeToMinutes,
  minutesToTime,
  formatTime12h,
} from '../../services/workScheduleTypes';
import { Trash2, Copy, X, GripVertical, Plus } from 'lucide-react';
import './ScheduleGrid.css';

interface ScheduleGridProps {
  blocks: TimeBlock[];
  onAddBlock: (block: Omit<TimeBlock, 'id'>) => void | Promise<void>;
  onAddBlocks?: (blocks: Omit<TimeBlock, 'id'>[]) => void | Promise<void>; // For multi-day add
  onUpdateBlock: (blockId: string, updates: Partial<TimeBlock>) => void | Promise<void>;
  onDeleteBlock: (blockId: string) => void | Promise<void>;
  onCopyDay: (fromDay: DayOfWeek, toDay: DayOfWeek) => void | Promise<void>;
  onClearDay: (day: DayOfWeek) => void | Promise<void>;
  readOnly?: boolean;
  timezone?: string; // Reserved for future timezone display
  startHour?: number; // Start hour for display (0-23), default 6
  endHour?: number; // End hour for display (0-23), default 23
  displayDays?: DayOfWeek[]; // Days to display (0-6), default all days
  customColors?: string[]; // User's saved custom colors
  onAddCustomColor?: (color: string) => void | Promise<void>;
  onRemoveCustomColor?: (color: string) => void | Promise<void>;
}


const HOUR_HEIGHT = 60; // pixels per hour
const DEFAULT_START_HOUR = 6; // 6 AM
const DEFAULT_END_HOUR = 23; // 11 PM
const ALL_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6]; // Sun-Sat

interface DragState {
  isDragging: boolean;
  dayOfWeek: DayOfWeek | null;
  startY: number;
  currentY: number;
}

interface EditingBlock {
  id: string;
  activity: string;
  color: string;
  startTime: string;
  endTime: string;
  dayOfWeek: DayOfWeek;
}

export default function ScheduleGrid({
  blocks,
  onAddBlock,
  onAddBlocks,
  onUpdateBlock,
  onDeleteBlock,
  onCopyDay,
  onClearDay,
  readOnly = false,
  timezone: _timezone,
  startHour = DEFAULT_START_HOUR,
  endHour = DEFAULT_END_HOUR,
  displayDays = ALL_DAYS,
  customColors = [],
  onAddCustomColor,
  onRemoveCustomColor,
}: ScheduleGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  // Filter days to display
  const visibleDays = useMemo(() => {
    return ALL_DAYS.filter(day => displayDays.includes(day));
  }, [displayDays]);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dayOfWeek: null,
    startY: 0,
    currentY: 0,
  });
  const [editingBlock, setEditingBlock] = useState<EditingBlock | null>(null);
  const [newBlockData, setNewBlockData] = useState<{
    dayOfWeek: DayOfWeek;
    startTime: string;
    endTime: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    day: DayOfWeek;
  } | null>(null);

  // Calculate hours based on startHour and endHour
  // Handle overnight schedules (e.g., 21:00 to 06:00)
  const isOvernight = startHour > endHour;
  const totalHours = isOvernight
    ? (24 - startHour) + endHour
    : endHour - startHour;

  const hours = useMemo(() => {
    const result: string[] = [];
    if (isOvernight) {
      // e.g., 21:00 to 06:00 - show 21, 22, 23, 0, 1, 2, 3, 4, 5
      for (let h = startHour; h < 24; h++) {
        result.push(`${h.toString().padStart(2, '0')}:00`);
      }
      for (let h = 0; h < endHour; h++) {
        result.push(`${h.toString().padStart(2, '0')}:00`);
      }
    } else {
      // Normal daytime schedule
      for (let h = startHour; h < endHour; h++) {
        result.push(`${h.toString().padStart(2, '0')}:00`);
      }
    }
    return result;
  }, [startHour, endHour, isOvernight]);

  // Group blocks by day for efficient rendering
  const blocksByDay = useMemo(() => {
    const grouped: Record<DayOfWeek, TimeBlock[]> = {
      0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
    };
    blocks.forEach(block => {
      grouped[block.dayOfWeek].push(block);
    });
    return grouped;
  }, [blocks]);

  // Check if two blocks overlap
  const blocksOverlap = (a: TimeBlock, b: TimeBlock) => {
    const aStart = timeToMinutes(a.startTime);
    const aEnd = timeToMinutes(a.endTime);
    const bStart = timeToMinutes(b.startTime);
    const bEnd = timeToMinutes(b.endTime);
    return aStart < bEnd && bStart < aEnd;
  };

  // Group overlapping blocks and calculate their positions
  const getOverlapInfo = useMemo(() => {
    const overlapMap: Record<string, { index: number; total: number; hiddenCount: number }> = {};
    // In read-only mode (Team View), show all blocks; in edit mode, limit to 2
    const maxVisible = readOnly ? Infinity : 2;

    Object.entries(blocksByDay).forEach(([_, dayBlocks]) => {
      // Find overlapping groups
      const processed = new Set<string>();

      dayBlocks.forEach(block => {
        if (processed.has(block.id)) return;

        // Find all blocks that overlap with this one
        const overlappingGroup = dayBlocks.filter(other =>
          block.id === other.id || blocksOverlap(block, other)
        );

        // Sort by start time, then by id for consistency
        overlappingGroup.sort((a, b) => {
          const timeDiff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
          return timeDiff !== 0 ? timeDiff : a.id.localeCompare(b.id);
        });

        const total = overlappingGroup.length;
        const visibleCount = Math.min(total, maxVisible);
        const hiddenCount = Math.max(0, total - maxVisible);

        overlappingGroup.forEach((b, idx) => {
          overlapMap[b.id] = {
            index: idx,
            total: visibleCount, // Number of blocks shown side by side
            hiddenCount: idx < maxVisible ? hiddenCount : 0,
          };
          processed.add(b.id);
        });
      });
    });

    return overlapMap;
  }, [blocksByDay, readOnly]);

  // Calculate position relative to the grid's start hour
  const getMinutesFromGridStart = (timeMinutes: number) => {
    const gridStartMinutes = startHour * 60;
    if (isOvernight) {
      // For overnight schedules, handle wrap-around
      if (timeMinutes >= gridStartMinutes) {
        return timeMinutes - gridStartMinutes;
      } else {
        // Time is in the next day (e.g., 2 AM when grid starts at 9 PM)
        return (24 * 60 - gridStartMinutes) + timeMinutes;
      }
    }
    return timeMinutes - gridStartMinutes;
  };

  // Calculate block position and height (with side-by-side support)
  const getBlockStyle = (block: TimeBlock): React.CSSProperties => {
    const startMinutes = timeToMinutes(block.startTime);
    const endMinutes = timeToMinutes(block.endTime);
    const startFromGrid = getMinutesFromGridStart(startMinutes);
    const duration = endMinutes >= startMinutes
      ? endMinutes - startMinutes
      : (24 * 60 - startMinutes) + endMinutes; // Handle overnight blocks

    const top = (startFromGrid / 60) * HOUR_HEIGHT;
    const height = (duration / 60) * HOUR_HEIGHT;

    // Get overlap info for side-by-side positioning
    const overlapInfo = getOverlapInfo[block.id];
    const index = overlapInfo?.index || 0;
    const total = overlapInfo?.total || 1;

    // Calculate width and left position for side-by-side
    const widthPercent = total > 1 ? (100 / total) - 2 : 100; // Leave small gap
    const leftPercent = index * (100 / total);

    return {
      top: `${top}px`,
      height: `${Math.max(height, 20)}px`,
      backgroundColor: block.color,
      width: total > 1 ? `${widthPercent}%` : undefined,
      left: total > 1 ? `${leftPercent}%` : '4px',
      right: total > 1 ? 'auto' : '4px',
    };
  };

  // Handle drag to create new block
  const handleMouseDown = (e: React.MouseEvent, day: DayOfWeek) => {
    if (readOnly) return;
    if ((e.target as HTMLElement).closest('.schedule-block')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;

    setDragState({
      isDragging: true,
      dayOfWeek: day,
      startY: y,
      currentY: y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState.isDragging || !gridRef.current) return;

    const hoursGrid = gridRef.current.querySelector(`.schedule-grid-hours[data-day="${dragState.dayOfWeek}"]`);
    if (!hoursGrid) return;

    const rect = hoursGrid.getBoundingClientRect();
    const y = Math.max(0, Math.min(e.clientY - rect.top, totalHours * HOUR_HEIGHT));

    setDragState(prev => ({ ...prev, currentY: y }));
  };

  // Convert Y position to actual time (handles overnight schedules)
  const yPositionToMinutes = (y: number) => {
    const minutesFromGridStart = Math.round((y / HOUR_HEIGHT) * 60 / 15) * 15;
    let totalMinutes = startHour * 60 + minutesFromGridStart;
    if (totalMinutes >= 24 * 60) {
      totalMinutes -= 24 * 60; // Wrap to next day
    }
    return totalMinutes;
  };

  const handleMouseUp = () => {
    if (!dragState.isDragging || dragState.dayOfWeek === null) {
      setDragState({ isDragging: false, dayOfWeek: null, startY: 0, currentY: 0 });
      return;
    }

    const startY = Math.min(dragState.startY, dragState.currentY);
    const endY = Math.max(dragState.startY, dragState.currentY);

    // Only create block if dragged at least 15 minutes worth
    if (endY - startY < HOUR_HEIGHT / 4) {
      setDragState({ isDragging: false, dayOfWeek: null, startY: 0, currentY: 0 });
      return;
    }

    // Convert Y position to time
    const startMinutes = yPositionToMinutes(startY);
    const endMinutes = yPositionToMinutes(endY);

    setNewBlockData({
      dayOfWeek: dragState.dayOfWeek,
      startTime: minutesToTime(startMinutes),
      endTime: minutesToTime(endMinutes),
    });

    setDragState({ isDragging: false, dayOfWeek: null, startY: 0, currentY: 0 });
  };

  // Get drag preview style
  const getDragPreviewStyle = () => {
    if (!dragState.isDragging) return null;

    const startY = Math.min(dragState.startY, dragState.currentY);
    const height = Math.abs(dragState.currentY - dragState.startY);

    return {
      top: `${startY}px`,
      height: `${height}px`,
    };
  };

  // Handle block click for editing
  const handleBlockClick = (e: React.MouseEvent, block: TimeBlock) => {
    if (readOnly) return;
    e.stopPropagation();
    setEditingBlock({
      id: block.id,
      activity: block.activity,
      color: block.color,
      startTime: block.startTime,
      endTime: block.endTime,
      dayOfWeek: block.dayOfWeek,
    });
  };

  // Save new block (supports multiple days)
  const saveNewBlock = async (activity: string, color: string, startTime?: string, endTime?: string, selectedDays?: DayOfWeek[]) => {
    if (!newBlockData) return;

    const daysToAdd = selectedDays && selectedDays.length > 0 ? selectedDays : [newBlockData.dayOfWeek];
    const finalStartTime = startTime || newBlockData.startTime;
    const finalEndTime = endTime || newBlockData.endTime;

    // Use batch add if multiple days and onAddBlocks is available
    if (daysToAdd.length > 1 && onAddBlocks) {
      const blocksToAdd = daysToAdd.map(day => ({
        dayOfWeek: day,
        startTime: finalStartTime,
        endTime: finalEndTime,
        activity,
        color,
      }));
      await onAddBlocks(blocksToAdd);
    } else {
      // Single day or no batch function - add one by one
      for (const day of daysToAdd) {
        await onAddBlock({
          dayOfWeek: day,
          startTime: finalStartTime,
          endTime: finalEndTime,
          activity,
          color,
        });
      }
    }

    setNewBlockData(null);
  };

  // Context menu for day actions
  const handleDayContextMenu = (e: React.MouseEvent, day: DayOfWeek) => {
    if (readOnly) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, day });
  };

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  return (
    <div className="schedule-grid-container">
      <div className="schedule-grid" ref={gridRef} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        {/* Time labels column */}
        <div className="schedule-grid-times">
          <div className="schedule-grid-header-cell"></div>
          {hours.map(hour => (
            <div key={hour} className="schedule-grid-time-label">
              {formatTime12h(hour)}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {visibleDays.map(day => (
          <div
            key={day}
            className="schedule-grid-day-column"
            onContextMenu={e => handleDayContextMenu(e, day)}
          >
            {/* Day header */}
            <div className="schedule-grid-header-cell">
              <span className="day-name">{DAY_SHORT_NAMES[day]}</span>
              {!readOnly && blocksByDay[day].length > 0 && (
                <button
                  className="day-menu-btn"
                  onClick={e => {
                    e.stopPropagation();
                    handleDayContextMenu(e, day);
                  }}
                  title="Day options"
                >
                  <GripVertical size={14} />
                </button>
              )}
            </div>

            {/* Hour grid lines */}
            <div
              className="schedule-grid-hours"
              data-day={day}
              style={{ height: `${totalHours * HOUR_HEIGHT}px` }}
              onMouseDown={e => handleMouseDown(e, day)}
            >
              {hours.map((_, idx) => (
                <div key={idx} className="schedule-grid-hour-cell" />
              ))}

              {/* Time blocks */}
              {blocksByDay[day]
                .filter(block => {
                  // In read-only mode (Team View), show all blocks
                  // In edit mode, only show first 2 blocks in an overlap group
                  if (readOnly) return true;
                  const overlapInfo = getOverlapInfo[block.id];
                  return !overlapInfo || overlapInfo.index < 2;
                })
                .map(block => {
                  const overlapInfo = getOverlapInfo[block.id];
                  const hiddenCount = overlapInfo?.hiddenCount || 0;
                  // Don't show "+N" indicator in read-only mode since all blocks are visible
                  const showMoreIndicator = !readOnly && hiddenCount > 0 && overlapInfo?.index === 1;

                  return (
                    <div
                      key={block.id}
                      className={`schedule-block ${editingBlock?.id === block.id ? 'editing' : ''}`}
                      style={getBlockStyle(block)}
                      onClick={e => handleBlockClick(e, block)}
                      title={`${block.activity}\n${formatTime12h(block.startTime)} - ${formatTime12h(block.endTime)}`}
                    >
                      <div className="schedule-block-content">
                        <span className="schedule-block-activity">{block.activity}</span>
                        <span className="schedule-block-time">
                          {formatTime12h(block.startTime)} - {formatTime12h(block.endTime)}
                        </span>
                      </div>
                      {showMoreIndicator && (
                        <div className="schedule-block-more" title={`+${hiddenCount} more`}>
                          +{hiddenCount}
                        </div>
                      )}
                      {!readOnly && (
                        <button
                          className="schedule-block-delete"
                          onClick={e => {
                            e.stopPropagation();
                            onDeleteBlock(block.id);
                          }}
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}

              {/* Drag preview */}
              {dragState.isDragging && dragState.dayOfWeek === day && (
                <div className="schedule-drag-preview" style={getDragPreviewStyle() || undefined} />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* New block modal */}
      {newBlockData && (
        <BlockEditModal
          title="Add Activity"
          initialActivity=""
          initialColor={SCHEDULE_COLORS[0].value}
          startTime={newBlockData.startTime}
          endTime={newBlockData.endTime}
          days={[newBlockData.dayOfWeek]}
          isMultiDay={true}
          displayStartHour={startHour}
          displayEndHour={endHour}
          customColors={customColors}
          onSave={saveNewBlock}
          onCancel={() => setNewBlockData(null)}
          onAddCustomColor={onAddCustomColor}
          onRemoveCustomColor={onRemoveCustomColor}
        />
      )}

      {/* Edit block modal */}
      {editingBlock && (
        <BlockEditModal
          title="Edit Activity"
          initialActivity={editingBlock.activity}
          initialColor={editingBlock.color}
          startTime={editingBlock.startTime}
          endTime={editingBlock.endTime}
          day={editingBlock.dayOfWeek}
          displayStartHour={startHour}
          displayEndHour={endHour}
          customColors={customColors}
          onSave={(activity, color, newStartTime, newEndTime) => {
            onUpdateBlock(editingBlock.id, {
              activity,
              color,
              startTime: newStartTime || editingBlock.startTime,
              endTime: newEndTime || editingBlock.endTime,
            });
            setEditingBlock(null);
          }}
          onCancel={() => setEditingBlock(null)}
          onDelete={() => {
            onDeleteBlock(editingBlock.id);
            setEditingBlock(null);
          }}
          onAddCustomColor={onAddCustomColor}
          onRemoveCustomColor={onRemoveCustomColor}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="schedule-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              const targetDay = prompt(`Copy ${DAY_SHORT_NAMES[contextMenu.day]} blocks to which day? (Mon, Tue, Wed, Thu, Fri, Sat, Sun)`);
              if (targetDay) {
                const dayMap: Record<string, DayOfWeek> = {
                  'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6,
                };
                const targetDayNum = dayMap[targetDay.toLowerCase().slice(0, 3)];
                if (targetDayNum !== undefined) {
                  onCopyDay(contextMenu.day, targetDayNum);
                }
              }
              setContextMenu(null);
            }}
          >
            <Copy size={14} />
            Copy to another day
          </button>
          <button
            onClick={() => {
              if (confirm(`Clear all blocks from ${DAY_SHORT_NAMES[contextMenu.day]}?`)) {
                onClearDay(contextMenu.day);
              }
              setContextMenu(null);
            }}
            className="danger"
          >
            <Trash2 size={14} />
            Clear all blocks
          </button>
        </div>
      )}
    </div>
  );
}

// Modal for adding/editing blocks
interface BlockEditModalProps {
  title: string;
  initialActivity: string;
  initialColor: string;
  startTime?: string;
  endTime?: string;
  day?: DayOfWeek;
  days?: DayOfWeek[]; // For multi-day selection (new blocks)
  isMultiDay?: boolean; // Enable multi-day selection mode
  displayStartHour?: number;
  displayEndHour?: number;
  customColors?: string[]; // User's saved custom colors
  onSave: (activity: string, color: string, startTime?: string, endTime?: string, selectedDays?: DayOfWeek[]) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onAddCustomColor?: (color: string) => void | Promise<void>;
  onRemoveCustomColor?: (color: string) => void | Promise<void>;
}

// Generate time options for select (every 15 minutes) within a range
const generateTimeOptions = (fromHour: number = 0, toHour: number = 24) => {
  const options: { value: string; label: string }[] = [];
  const isOvernight = fromHour > toHour;

  if (isOvernight) {
    // e.g., 21:00 to 06:00
    for (let h = fromHour; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        const value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        const hour12 = h % 12 || 12;
        const suffix = h >= 12 ? 'PM' : 'AM';
        const label = `${hour12}:${m.toString().padStart(2, '0')} ${suffix}`;
        options.push({ value, label });
      }
    }
    for (let h = 0; h < toHour; h++) {
      for (let m = 0; m < 60; m += 15) {
        const value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        const hour12 = h % 12 || 12;
        const suffix = h >= 12 ? 'PM' : 'AM';
        const label = `${hour12}:${m.toString().padStart(2, '0')} ${suffix}`;
        options.push({ value, label });
      }
    }
  } else {
    // Normal daytime range
    for (let h = fromHour; h < toHour; h++) {
      for (let m = 0; m < 60; m += 15) {
        const value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        const hour12 = h % 12 || 12;
        const suffix = h >= 12 ? 'PM' : 'AM';
        const label = `${hour12}:${m.toString().padStart(2, '0')} ${suffix}`;
        options.push({ value, label });
      }
    }
  }
  return options;
};

function BlockEditModal({
  title,
  initialActivity,
  initialColor,
  startTime: initialStartTime,
  endTime: initialEndTime,
  day,
  days: initialDays,
  isMultiDay = false,
  displayStartHour = 0,
  displayEndHour = 24,
  customColors = [],
  onSave,
  onCancel,
  onDelete,
  onAddCustomColor,
  onRemoveCustomColor,
}: BlockEditModalProps) {
  const [activity, setActivity] = useState(initialActivity);
  const [color, setColor] = useState(initialColor);
  const [startTime, setStartTime] = useState(initialStartTime || '09:00');
  const [endTime, setEndTime] = useState(initialEndTime || '17:00');
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>(
    initialDays || (day !== undefined ? [day] : [])
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Generate time options based on display range
  const timeOptions = useMemo(() =>
    generateTimeOptions(displayStartHour, displayEndHour),
    [displayStartHour, displayEndHour]
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const toggleDay = (d: DayOfWeek) => {
    setSelectedDays(prev =>
      prev.includes(d)
        ? prev.filter(x => x !== d)
        : [...prev, d].sort((a, b) => a - b)
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activity.trim() && (isMultiDay ? selectedDays.length > 0 : true)) {
      onSave(activity.trim(), color, startTime, endTime, isMultiDay ? selectedDays : undefined);
    }
  };

  return (
    <div className="block-edit-modal-overlay">
      <div className="block-edit-modal">
        <div className="block-edit-modal-header">
          <h3>{title}</h3>
          <button className="close-btn" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Multi-day selection for new blocks */}
          {isMultiDay && (
            <div className="block-edit-days-section">
              <label>Days</label>
              <div className="block-edit-days-grid">
                {ALL_DAYS.map(d => (
                  <button
                    key={d}
                    type="button"
                    className={`day-select-btn ${selectedDays.includes(d) ? 'selected' : ''}`}
                    onClick={() => toggleDay(d)}
                  >
                    {DAY_SHORT_NAMES[d]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Time section */}
          {(day !== undefined || isMultiDay) && (
            <div className="block-edit-time-section">
              {day !== undefined && !isMultiDay && (
                <div className="block-edit-day">
                  <span>{DAY_SHORT_NAMES[day]}</span>
                </div>
              )}
              <div className="block-edit-time-inputs" style={isMultiDay ? { flex: 1 } : undefined}>
                <select
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="time-select"
                >
                  {timeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <span className="time-separator">to</span>
                <select
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="time-select"
                >
                  {timeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Activity</label>
            <input
              ref={inputRef}
              type="text"
              value={activity}
              onChange={e => setActivity(e.target.value)}
              placeholder="e.g., Coding, Meeting, Design work"
            />
          </div>

          <div className="form-group">
            <label>Color</label>
            <div className="color-picker">
              {/* Preset colors */}
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
              {/* Saved custom colors */}
              {customColors.map(customColor => (
                <div key={customColor} className="custom-color-wrapper">
                  <button
                    type="button"
                    className={`color-swatch ${color === customColor ? 'selected' : ''}`}
                    style={{ backgroundColor: customColor }}
                    onClick={() => setColor(customColor)}
                    title={customColor}
                  />
                  {onRemoveCustomColor && (
                    <button
                      type="button"
                      className="color-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveCustomColor(customColor);
                      }}
                      title="Remove color"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
              {/* Add custom color button with positioned picker */}
              <div className="custom-color-picker-wrapper">
                <button
                  type="button"
                  className="color-swatch custom-color-btn"
                  onClick={() => colorInputRef.current?.click()}
                  title="Add custom color"
                >
                  <Plus size={14} />
                </button>
                <input
                  ref={colorInputRef}
                  type="color"
                  value={color}
                  onChange={e => {
                    const newColor = e.target.value;
                    setColor(newColor);
                    // Save the custom color if it's not a preset
                    if (onAddCustomColor && !SCHEDULE_COLORS.some(c => c.value === newColor) && !customColors.includes(newColor)) {
                      onAddCustomColor(newColor);
                    }
                  }}
                  className="color-input-positioned"
                />
              </div>
            </div>
          </div>

          <div className="block-edit-modal-actions">
            {onDelete && (
              <button type="button" className="delete-btn" onClick={onDelete}>
                <Trash2 size={14} />
                Delete
              </button>
            )}
            <div className="right-actions">
              <button type="button" className="cancel-btn" onClick={onCancel}>
                Cancel
              </button>
              <button type="submit" className="save-btn" disabled={!activity.trim() || (isMultiDay && selectedDays.length === 0)}>
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
