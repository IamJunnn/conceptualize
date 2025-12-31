/**
 * TeamAvailabilityPanel Component
 * Main panel for viewing and managing team work schedules
 * Shows "My Schedule" (editable) and "Team View" (read-only, timezone converted)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { TeamMember } from '../../services/teamService';
import {
  WorkSchedule,
  TimeBlock,
  DayOfWeek,
} from '../../services/workScheduleTypes';
import {
  saveWorkSchedule,
  subscribeToWorkSchedule,
  subscribeToTeamSchedules,
  addTimeBlock,
  addTimeBlocks,
  updateTimeBlock,
  deleteTimeBlock,
  copyBlocksToDay,
  clearDayBlocks,
  updateScheduleSharing,
  addCustomColor,
  removeCustomColor,
} from '../../services/workScheduleService';
import {
  getUserTimezone,
  formatTimezoneShort,
  formatTimezoneDifference,
  convertScheduleToViewerTimezone,
} from '../../services/timezoneService';
import ScheduleGrid from './ScheduleGrid';
import ScheduleCalendar from './ScheduleCalendar';
import { Calendar, Grid3X3, User, Users, Share2, Check, ChevronDown, Clock, RefreshCw, Settings } from 'lucide-react';
import './TeamAvailabilityPanel.css';

// Always use local timezone
const LOCAL_TIMEZONE = getUserTimezone();

interface TeamAvailabilityPanelProps {
  teamId: string;
  members: { [email: string]: TeamMember };
  currentUserEmail: string;
  currentUserId: string;
  currentUserDisplayName: string;
  userTeams?: Array<{ id: string; name: string }>; // All teams the user belongs to
}

type ViewMode = 'grid' | 'calendar';
type TabMode = 'my-schedule' | 'team-view';

export default function TeamAvailabilityPanel({
  teamId,
  members,
  currentUserEmail,
  currentUserId,
  currentUserDisplayName,
  userTeams = [],
}: TeamAvailabilityPanelProps) {
  // State
  const [activeTab, setActiveTab] = useState<TabMode>('my-schedule');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [mySchedule, setMySchedule] = useState<WorkSchedule | null>(null);
  const [teamSchedules, setTeamSchedules] = useState<WorkSchedule[]>([]);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showShareDropdown, setShowShareDropdown] = useState(false);
  const [showTimeRangeDropdown, setShowTimeRangeDropdown] = useState(false);

  // Display time range state (persisted to localStorage)
  const [displayStartHour, setDisplayStartHour] = useState<number>(() => {
    const saved = localStorage.getItem('scheduleDisplayStartHour');
    return saved ? parseInt(saved, 10) : 6;
  });
  const [displayEndHour, setDisplayEndHour] = useState<number>(() => {
    const saved = localStorage.getItem('scheduleDisplayEndHour');
    return saved ? parseInt(saved, 10) : 23;
  });

  // Display days state (persisted to localStorage)
  const [showDaysDropdown, setShowDaysDropdown] = useState(false);
  const [displayDays, setDisplayDays] = useState<number[]>(() => {
    const saved = localStorage.getItem('scheduleDisplayDays');
    return saved ? JSON.parse(saved) : [0, 1, 2, 3, 4, 5, 6]; // All days by default
  });

  // Always use local timezone
  const myTimezone = LOCAL_TIMEZONE;

  // Subscribe to my schedule
  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToWorkSchedule(
      currentUserId,
      (schedule) => {
        setMySchedule(schedule);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to load schedule:', err);
        setError('Failed to load your schedule');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUserId]);

  // Subscribe to team schedules
  useEffect(() => {
    const unsubscribe = subscribeToTeamSchedules(
      teamId,
      (schedules) => {
        setTeamSchedules(schedules);
      },
      (err) => {
        console.error('Failed to load team schedules:', err);
      }
    );

    return () => unsubscribe();
  }, [teamId]);

  // Initialize schedule if not exists
  const initializeSchedule = useCallback(async () => {
    if (mySchedule) return;

    setSaving(true);
    try {
      await saveWorkSchedule(
        currentUserId,
        currentUserEmail,
        currentUserDisplayName,
        LOCAL_TIMEZONE,
        [],
        [teamId] // Auto-share with current team
      );
    } catch (err) {
      console.error('Failed to initialize schedule:', err);
      setError('Failed to create schedule');
    } finally {
      setSaving(false);
    }
  }, [mySchedule, currentUserId, currentUserEmail, currentUserDisplayName, teamId]);

  // Handle add block (single)
  const handleAddBlock = useCallback(async (block: Omit<TimeBlock, 'id'>) => {
    if (!mySchedule) {
      await initializeSchedule();
    }

    setSaving(true);
    try {
      await addTimeBlock(currentUserId, block);
    } catch (err) {
      console.error('Failed to add block:', err);
      setError('Failed to add activity');
    } finally {
      setSaving(false);
    }
  }, [currentUserId, mySchedule, initializeSchedule]);

  // Handle add multiple blocks (for multi-day selection)
  const handleAddBlocks = useCallback(async (blocks: Omit<TimeBlock, 'id'>[]) => {
    if (!mySchedule) {
      await initializeSchedule();
    }

    setSaving(true);
    try {
      await addTimeBlocks(currentUserId, blocks);
    } catch (err) {
      console.error('Failed to add blocks:', err);
      setError('Failed to add activity');
    } finally {
      setSaving(false);
    }
  }, [currentUserId, mySchedule, initializeSchedule]);

  // Handle update block
  const handleUpdateBlock = useCallback(async (blockId: string, updates: Partial<TimeBlock>) => {
    setSaving(true);
    try {
      await updateTimeBlock(currentUserId, blockId, updates);
    } catch (err) {
      console.error('Failed to update block:', err);
      setError('Failed to update activity');
    } finally {
      setSaving(false);
    }
  }, [currentUserId]);

  // Handle delete block
  const handleDeleteBlock = useCallback(async (blockId: string) => {
    setSaving(true);
    try {
      await deleteTimeBlock(currentUserId, blockId);
    } catch (err) {
      console.error('Failed to delete block:', err);
      setError('Failed to delete activity');
    } finally {
      setSaving(false);
    }
  }, [currentUserId]);

  // Handle copy day
  const handleCopyDay = useCallback(async (fromDay: DayOfWeek, toDay: DayOfWeek) => {
    setSaving(true);
    try {
      await copyBlocksToDay(currentUserId, fromDay, toDay);
    } catch (err) {
      console.error('Failed to copy blocks:', err);
      setError('Failed to copy blocks');
    } finally {
      setSaving(false);
    }
  }, [currentUserId]);

  // Handle clear day
  const handleClearDay = useCallback(async (day: DayOfWeek) => {
    setSaving(true);
    try {
      await clearDayBlocks(currentUserId, day);
    } catch (err) {
      console.error('Failed to clear day:', err);
      setError('Failed to clear day');
    } finally {
      setSaving(false);
    }
  }, [currentUserId]);

  // Handle sharing toggle
  const handleShareToggle = useCallback(async (targetTeamId: string, share: boolean) => {
    if (!mySchedule) return;

    const newSharedTeams = share
      ? [...mySchedule.sharedWithTeams, targetTeamId]
      : mySchedule.sharedWithTeams.filter(id => id !== targetTeamId);

    setSaving(true);
    try {
      await updateScheduleSharing(currentUserId, newSharedTeams);
    } catch (err) {
      console.error('Failed to update sharing:', err);
      setError('Failed to update sharing settings');
    } finally {
      setSaving(false);
    }
  }, [currentUserId, mySchedule]);

  // Handle add custom color
  const handleAddCustomColor = useCallback(async (color: string) => {
    try {
      await addCustomColor(currentUserId, color);
    } catch (err) {
      console.error('Failed to add custom color:', err);
    }
  }, [currentUserId]);

  // Handle remove custom color
  const handleRemoveCustomColor = useCallback(async (color: string) => {
    try {
      await removeCustomColor(currentUserId, color);
    } catch (err) {
      console.error('Failed to remove custom color:', err);
    }
  }, [currentUserId]);

  // Handle time range change
  const handleTimeRangeChange = useCallback((newStartHour: number, newEndHour: number) => {
    setDisplayStartHour(newStartHour);
    setDisplayEndHour(newEndHour);
    localStorage.setItem('scheduleDisplayStartHour', newStartHour.toString());
    localStorage.setItem('scheduleDisplayEndHour', newEndHour.toString());
    setShowTimeRangeDropdown(false);
  }, []);

  // Format hour for display
  const formatHour = (hour: number) => {
    if (hour === 0) return '12:00 AM';
    if (hour === 12) return '12:00 PM';
    if (hour < 12) return `${hour}:00 AM`;
    return `${hour - 12}:00 PM`;
  };

  // Common time range presets
  const timeRangePresets = [
    { label: 'Standard (6 AM - 11 PM)', startHour: 6, endHour: 23 },
    { label: 'Early Bird (5 AM - 8 PM)', startHour: 5, endHour: 20 },
    { label: 'Night Owl (12 PM - 3 AM)', startHour: 12, endHour: 3 },
    { label: 'Overnight (9 PM - 6 AM)', startHour: 21, endHour: 6 },
    { label: 'Full Day (12 AM - 12 AM)', startHour: 0, endHour: 24 },
  ];

  // Day names for display
  const dayNames: Record<number, string> = {
    0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat',
  };

  // Day presets
  const dayPresets = [
    { label: 'All Days', days: [0, 1, 2, 3, 4, 5, 6] },
    { label: 'Weekdays (Mon-Fri)', days: [1, 2, 3, 4, 5] },
    { label: 'Weekends (Sat-Sun)', days: [0, 6] },
  ];

  // Handle days change
  const handleDaysChange = useCallback((newDays: number[]) => {
    if (newDays.length === 0) return; // Must have at least one day
    const sortedDays = [...newDays].sort((a, b) => a - b);
    setDisplayDays(sortedDays);
    localStorage.setItem('scheduleDisplayDays', JSON.stringify(sortedDays));
  }, []);

  // Toggle individual day
  const toggleDay = useCallback((day: number) => {
    setDisplayDays(prev => {
      const newDays = prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day].sort((a, b) => a - b);
      if (newDays.length === 0) return prev; // Must have at least one day
      localStorage.setItem('scheduleDisplayDays', JSON.stringify(newDays));
      return newDays;
    });
  }, []);

  // Format days for display
  const formatDaysLabel = () => {
    if (displayDays.length === 7) return 'All Days';
    if (displayDays.length === 5 && !displayDays.includes(0) && !displayDays.includes(6)) return 'Weekdays';
    if (displayDays.length === 2 && displayDays.includes(0) && displayDays.includes(6)) return 'Weekends';
    if (displayDays.length === 1) return dayNames[displayDays[0]];
    // Show range if consecutive
    const first = displayDays[0];
    const last = displayDays[displayDays.length - 1];
    return `${dayNames[first]} - ${dayNames[last]}`;
  };

  // Get selected member's schedule converted to my timezone
  const selectedMemberSchedule = useMemo(() => {
    if (!selectedMember) return null;

    const schedule = teamSchedules.find(s => s.email === selectedMember);
    if (!schedule) return null;

    // Convert blocks to viewer's timezone
    const convertedBlocks = convertScheduleToViewerTimezone(
      schedule.weeklyBlocks,
      schedule.timezone,
      myTimezone
    );

    return {
      ...schedule,
      weeklyBlocks: convertedBlocks,
    };
  }, [selectedMember, teamSchedules, myTimezone]);

  // Get team members with schedules
  const membersWithSchedules = useMemo(() => {
    const memberList = Object.entries(members).map(([email, member]) => {
      const schedule = teamSchedules.find(s => s.email.toLowerCase() === email.toLowerCase());
      return {
        email,
        displayName: member.displayName || email.split('@')[0],
        photoURL: member.photoURL,
        customAvatar: member.customAvatar,
        hasSchedule: !!schedule,
        schedule,
      };
    });

    // Sort: members with schedules first, then alphabetically
    return memberList.sort((a, b) => {
      if (a.hasSchedule && !b.hasSchedule) return -1;
      if (!a.hasSchedule && b.hasSchedule) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [members, teamSchedules]);

  // Render loading state
  if (loading) {
    return (
      <div className="team-availability-panel">
        <div className="loading-state">
          <RefreshCw className="spinning" size={24} />
          <span>Loading schedule...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="team-availability-panel">
      {/* Header */}
      <div className="availability-header">
        <div className="header-left">
          {/* Tab switcher - icon only */}
          <div className="tab-switcher">
            <button
              className={`tab-btn ${activeTab === 'my-schedule' ? 'active' : ''}`}
              onClick={() => setActiveTab('my-schedule')}
              title="My Schedule"
            >
              <User size={16} />
            </button>
            <button
              className={`tab-btn ${activeTab === 'team-view' ? 'active' : ''}`}
              onClick={() => setActiveTab('team-view')}
              title="Team View"
            >
              <Users size={16} />
            </button>
          </div>
        </div>

        <div className="header-right">
          {/* View mode toggle */}
          <div className="view-mode-toggle">
            <button
              className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              <Grid3X3 size={16} />
            </button>
            <button
              className={`view-btn ${viewMode === 'calendar' ? 'active' : ''}`}
              onClick={() => setViewMode('calendar')}
              title="Calendar View"
            >
              <Calendar size={16} />
            </button>
          </div>

          {/* Share settings (My Schedule only) */}
          {activeTab === 'my-schedule' && userTeams.length > 1 && (
            <div className="share-selector">
              <button
                className="share-btn"
                onClick={() => setShowShareDropdown(!showShareDropdown)}
              >
                <Share2 size={14} />
                <span>Share</span>
                <ChevronDown size={14} />
              </button>

              {showShareDropdown && (
                <div className="dropdown-menu share-dropdown">
                  <div className="dropdown-header">Share with teams</div>
                  {userTeams.map(team => {
                    const isShared = mySchedule?.sharedWithTeams.includes(team.id) || false;
                    return (
                      <button
                        key={team.id}
                        className={`dropdown-item ${isShared ? 'selected' : ''}`}
                        onClick={() => handleShareToggle(team.id, !isShared)}
                      >
                        <span>{team.name}</span>
                        {isShared && <Check size={14} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Time range settings */}
          <div className="time-range-selector">
            <button
              className="time-range-btn"
              onClick={() => setShowTimeRangeDropdown(!showTimeRangeDropdown)}
              title="Display time range"
            >
              <Settings size={14} />
              <span>{formatHour(displayStartHour)} - {displayEndHour === 24 ? '12:00 AM' : formatHour(displayEndHour)}</span>
              <ChevronDown size={14} />
            </button>

            {showTimeRangeDropdown && (
              <div className="dropdown-menu time-range-dropdown">
                <div className="dropdown-header">Display Time Range</div>
                {timeRangePresets.map(preset => {
                  const isSelected = displayStartHour === preset.startHour && displayEndHour === preset.endHour;
                  return (
                    <button
                      key={preset.label}
                      className={`dropdown-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleTimeRangeChange(preset.startHour, preset.endHour)}
                    >
                      <span>{preset.label}</span>
                      {isSelected && <Check size={14} />}
                    </button>
                  );
                })}
                <div className="dropdown-divider" />
                <div className="custom-time-range">
                  <div className="custom-time-label">Custom Range</div>
                  <div className="custom-time-inputs">
                    <select
                      value={displayStartHour}
                      onChange={(e) => handleTimeRangeChange(parseInt(e.target.value, 10), displayEndHour)}
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{formatHour(i)}</option>
                      ))}
                    </select>
                    <span>to</span>
                    <select
                      value={displayEndHour}
                      onChange={(e) => handleTimeRangeChange(displayStartHour, parseInt(e.target.value, 10))}
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i === 0 ? 24 : i}>
                          {i === 0 ? '12:00 AM (next day)' : formatHour(i)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Days selector */}
          <div className="days-selector">
            <button
              className="days-btn"
              onClick={() => setShowDaysDropdown(!showDaysDropdown)}
              title="Display days"
            >
              <Calendar size={14} />
              <span>{formatDaysLabel()}</span>
              <ChevronDown size={14} />
            </button>

            {showDaysDropdown && (
              <div className="dropdown-menu days-dropdown">
                <div className="dropdown-header">Display Days</div>
                {dayPresets.map(preset => {
                  const isSelected = JSON.stringify(displayDays) === JSON.stringify(preset.days);
                  return (
                    <button
                      key={preset.label}
                      className={`dropdown-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        handleDaysChange(preset.days);
                        setShowDaysDropdown(false);
                      }}
                    >
                      <span>{preset.label}</span>
                      {isSelected && <Check size={14} />}
                    </button>
                  );
                })}
                <div className="dropdown-divider" />
                <div className="custom-days">
                  <div className="custom-days-label">Custom Selection</div>
                  <div className="custom-days-grid">
                    {[0, 1, 2, 3, 4, 5, 6].map(day => (
                      <button
                        key={day}
                        type="button"
                        className={`day-toggle ${displayDays.includes(day) ? 'active' : ''}`}
                        onClick={() => toggleDay(day)}
                      >
                        {dayNames[day]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Saving indicator */}
          {saving && (
            <div className="saving-indicator">
              <RefreshCw className="spinning" size={14} />
              <span>Saving...</span>
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Content */}
      <div className="availability-content">
        {activeTab === 'my-schedule' ? (
          // My Schedule - Editable
          <div className="my-schedule-view">
            {!mySchedule ? (
              <div className="empty-schedule">
                <Clock size={48} />
                <h3>Set Up Your Work Schedule</h3>
                <p>Create your weekly schedule to share your availability with your team.</p>
                <button className="primary-btn" onClick={initializeSchedule} disabled={saving}>
                  Create Schedule
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              <ScheduleGrid
                blocks={mySchedule.weeklyBlocks}
                onAddBlock={handleAddBlock}
                onAddBlocks={handleAddBlocks}
                onUpdateBlock={handleUpdateBlock}
                onDeleteBlock={handleDeleteBlock}
                onCopyDay={handleCopyDay}
                onClearDay={handleClearDay}
                timezone={myTimezone}
                startHour={displayStartHour}
                endHour={displayEndHour}
                displayDays={displayDays as DayOfWeek[]}
                customColors={mySchedule.customColors || []}
                onAddCustomColor={handleAddCustomColor}
                onRemoveCustomColor={handleRemoveCustomColor}
              />
            ) : (
              <ScheduleCalendar
                blocks={mySchedule.weeklyBlocks}
                onAddBlock={handleAddBlock}
                onUpdateBlock={handleUpdateBlock}
                onDeleteBlock={handleDeleteBlock}
                timezone={myTimezone}
              />
            )}
          </div>
        ) : (
          // Team View - Read only with member selector
          <div className="team-view">
            <div className="member-list">
              <div className="member-list-header">Team Members</div>
              {membersWithSchedules.map(member => (
                <button
                  key={member.email}
                  className={`member-item ${selectedMember === member.email ? 'selected' : ''} ${!member.hasSchedule ? 'no-schedule' : ''}`}
                  onClick={() => setSelectedMember(member.email)}
                  disabled={!member.hasSchedule}
                >
                  <div className="member-avatar">
                    {member.customAvatar || member.photoURL ? (
                      <img src={member.customAvatar || member.photoURL} alt={member.displayName} />
                    ) : (
                      member.displayName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="member-info">
                    <span className="member-name">{member.displayName}</span>
                    {!member.hasSchedule && (
                      <span className="no-schedule-label">No schedule shared</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="member-schedule-view">
              {!selectedMember ? (
                <div className="select-member-prompt">
                  <Users size={48} />
                  <h3>Select a Team Member</h3>
                  <p>Click on a team member to view their availability in your timezone.</p>
                </div>
              ) : selectedMemberSchedule ? (
                <>
                  <div className="viewing-member-header">
                    <span>Viewing: <strong>{selectedMemberSchedule.displayName}</strong></span>
                    <span className="converted-notice">
                      Times shown in your timezone ({formatTimezoneShort(myTimezone)})
                    </span>
                  </div>
                  {viewMode === 'grid' ? (
                    <ScheduleGrid
                      blocks={selectedMemberSchedule.weeklyBlocks}
                      onAddBlock={() => {}}
                      onUpdateBlock={() => {}}
                      onDeleteBlock={() => {}}
                      onCopyDay={() => {}}
                      onClearDay={() => {}}
                      readOnly
                      timezone={myTimezone}
                      startHour={displayStartHour}
                      endHour={displayEndHour}
                      displayDays={displayDays as DayOfWeek[]}
                    />
                  ) : (
                    <ScheduleCalendar
                      blocks={selectedMemberSchedule.weeklyBlocks}
                      onAddBlock={() => {}}
                      onUpdateBlock={() => {}}
                      onDeleteBlock={() => {}}
                      readOnly
                      timezone={myTimezone}
                    />
                  )}
                </>
              ) : (
                <div className="no-schedule-message">
                  <Clock size={48} />
                  <h3>No Schedule Available</h3>
                  <p>This team member hasn't shared their schedule yet.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
