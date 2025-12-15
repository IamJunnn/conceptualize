import { useState, useEffect } from 'react';
import { TeamMember } from '../../services/teamService';
import { TeamTodo, TeamTodoFormData, TodoPriority, TodoType, RecurrencePattern, PRIORITY_CONFIG, MEETING_COLORS } from '../../services/teamTodoTypes';
import { createTodo, updateTodo } from '../../services/teamTodoService';
import { createCalendarEvent, updateCalendarEvent, meetingToCalendarParams, hasCalendarAccess } from '../../services/googleCalendarService';
import AssigneeSelector from './AssigneeSelector';
import CustomDatePicker from '../UI/CustomDatePicker';
import CustomTimePicker, { getNextTimeSlot, addHoursToTime } from '../UI/CustomTimePicker';
import RepeatSelector from '../UI/RepeatSelector';
import CustomRecurrenceModal from '../UI/CustomRecurrenceModal';
import { ClipboardList, Video, Calendar, Mail } from 'lucide-react';
import './AddTeamTodoModal.css';

interface AddTeamTodoModalProps {
  teamId: string;
  members: TeamMember[];
  currentUserEmail: string;
  currentUserName?: string;
  onClose: () => void;
  onTodoSaved: () => void;
  editingTodo?: TeamTodo | null;
  defaultType?: TodoType; // Allow parent to set default type
  defaultDate?: string; // Pre-fill date when clicking on calendar (YYYY-MM-DD format)
}

export default function AddTeamTodoModal({
  teamId,
  members,
  currentUserEmail,
  currentUserName,
  onClose,
  onTodoSaved,
  editingTodo,
  defaultType = 'task',
  defaultDate,
}: AddTeamTodoModalProps) {
  const isEditing = !!editingTodo;

  // Determine initial type from editing todo or default
  const initialType: TodoType = editingTodo?.type || defaultType;

  const [type, setType] = useState<TodoType>(initialType);
  const [text, setText] = useState(editingTodo?.text || '');
  const [priority, setPriority] = useState<TodoPriority>(editingTodo?.priority || 4);
  const [startDate, setStartDate] = useState(editingTodo?.startDate || defaultDate || '');
  const [endDate, setEndDate] = useState(editingTodo?.endDate || defaultDate || '');
  const [description, setDescription] = useState(editingTodo?.description || '');
  const [assignees, setAssignees] = useState<string[]>(editingTodo?.assignees || []);

  // Meeting-specific state - smart defaults for new meetings
  const defaultStartTime = getNextTimeSlot();
  const defaultEndTime = addHoursToTime(defaultStartTime, 2);
  const [startTime, setStartTime] = useState(editingTodo?.meetingDetails?.startTime || defaultStartTime);
  const [endTime, setEndTime] = useState(editingTodo?.meetingDetails?.endTime || defaultEndTime);
  const [recurrence, setRecurrence] = useState<RecurrencePattern | null>(
    editingTodo?.meetingDetails?.recurrence || null
  );
  const [color, setColor] = useState(editingTodo?.meetingDetails?.color || MEETING_COLORS[0].value);
  const [hasVideoRoom, setHasVideoRoom] = useState(editingTodo?.meetingDetails?.hasVideoRoom ?? true); // Default to true for new meetings
  const [addToCalendar, setAddToCalendar] = useState(true);

  // Custom recurrence modal
  const [showRecurrenceModal, setShowRecurrenceModal] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMeeting = type === 'meeting';

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showRecurrenceModal && !isSaving) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showRecurrenceModal, isSaving]);

  // Helper functions to convert between string (YYYY-MM-DD) and Date
  const stringToDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const dateToString = (date: Date | null): string => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!text.trim()) {
      setError(`${isMeeting ? 'Meeting' : 'Task'} title is required`);
      return;
    }

    // For meetings, date is required
    if (isMeeting && !startDate && !endDate) {
      setError('Meeting date is required');
      return;
    }

    // Validate meeting times
    if (isMeeting && startTime >= endTime) {
      setError('End time must be after start time');
      return;
    }

    const formData: TeamTodoFormData = {
      text: text.trim(),
      priority: isMeeting ? 2 : priority, // Meetings default to high priority
      startDate: startDate || undefined,
      endDate: endDate || startDate || undefined, // For meetings, use start date as end date if not set
      description: description.trim() || undefined,
      assignees,
      type,
    };

    // Add meeting details if this is a meeting
    if (isMeeting) {
      const meetingDetails: any = {
        startTime,
        endTime,
        repeat: recurrence?.type || 'none',
        color,
        hasVideoRoom,
      };

      // Only add optional fields if they have values (Firestore doesn't accept undefined)
      if (recurrence?.endType === 'on' && recurrence.endDate) {
        meetingDetails.repeatUntil = recurrence.endDate;
      }
      if (recurrence) {
        // Clean undefined values from recurrence object (Firestore doesn't accept undefined)
        const cleanRecurrence: Record<string, any> = {};
        Object.entries(recurrence).forEach(([key, value]) => {
          if (value !== undefined) {
            cleanRecurrence[key] = value;
          }
        });
        meetingDetails.recurrence = cleanRecurrence;
      }

      formData.meetingDetails = meetingDetails;
    }

    try {
      setIsSaving(true);

      let calendarEventId: string | undefined;

      // Handle Google Calendar integration for meetings
      if (isMeeting && addToCalendar && hasCalendarAccess()) {
        const meetingDate = startDate || endDate;

        try {
          if (isEditing && editingTodo?.meetingDetails?.calendarEventId) {
            // Update existing calendar event
            const calendarParams = meetingToCalendarParams(
              text,
              description,
              meetingDate,
              startTime,
              endTime,
              assignees
            );
            await updateCalendarEvent(editingTodo.meetingDetails.calendarEventId, {
              summary: calendarParams.summary,
              description: calendarParams.description,
              startDateTime: calendarParams.startDateTime,
              endDateTime: calendarParams.endDateTime,
              attendeeEmails: calendarParams.attendeeEmails,
            });
            calendarEventId = editingTodo.meetingDetails.calendarEventId;
            console.log('Calendar event updated');
          } else if (!isEditing) {
            // Create new calendar event
            const calendarParams = meetingToCalendarParams(
              text,
              description,
              meetingDate,
              startTime,
              endTime,
              assignees
            );
            const calendarEvent = await createCalendarEvent(calendarParams);
            calendarEventId = calendarEvent.id;
            console.log('Calendar event created:', calendarEventId);
          }
        } catch (calendarError: any) {
          console.error('Calendar operation failed:', calendarError);
          // Don't fail the whole operation, just warn
          console.warn('Meeting will be created without Google Calendar sync');
        }
      }

      // Add calendarEventId to meeting details if we have one
      if (calendarEventId && formData.meetingDetails) {
        formData.meetingDetails.calendarEventId = calendarEventId;
      }

      if (isEditing) {
        await updateTodo(teamId, editingTodo!.id, formData, currentUserEmail, currentUserName);
      } else {
        await createTodo(teamId, formData, currentUserEmail, currentUserName);
      }

      onTodoSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to save:', err);
      setError(err.message || `Failed to save ${isMeeting ? 'meeting' : 'task'}. Please try again.`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content add-team-todo-modal">
        {/* Type Toggle */}
        <div className="type-toggle">
          <button
            type="button"
            className={`type-btn ${type === 'task' ? 'active' : ''}`}
            onClick={() => setType('task')}
            disabled={isSaving}
          >
            <ClipboardList size={18} />
            <span>Task</span>
          </button>
          <button
            type="button"
            className={`type-btn ${type === 'meeting' ? 'active' : ''}`}
            onClick={() => setType('meeting')}
            disabled={isSaving}
          >
            <Video size={18} />
            <span>Meeting</span>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Title */}
          <div className="form-group">
            <label htmlFor="todoText">{isMeeting ? 'Meeting Title' : 'Task Title'} *</label>
            <input
              id="todoText"
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={isMeeting ? 'e.g., Weekly Team Standup' : 'What needs to be done?'}
              disabled={isSaving}
              autoFocus
            />
          </div>

          {/* Priority - only for tasks */}
          {!isMeeting && (
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
          )}

          {/* Date and Time */}
          {isMeeting ? (
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label>Date *</label>
                <CustomDatePicker
                  selected={stringToDate(startDate || endDate)}
                  onChange={(date) => {
                    const dateStr = dateToString(date);
                    setStartDate(dateStr);
                    setEndDate(dateStr);
                  }}
                  minDate={new Date()}
                  placeholderText="Select meeting date"
                  disabled={isSaving}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Start</label>
                <CustomTimePicker
                  value={startTime}
                  onChange={setStartTime}
                  disabled={isSaving}
                  placeholder="Start time"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>End</label>
                <CustomTimePicker
                  value={endTime}
                  onChange={setEndTime}
                  disabled={isSaving}
                  placeholder="End time"
                />
              </div>
            </div>
          ) : (
            <div className="form-row">
              <div className="form-group half">
                <label>Start Date</label>
                <CustomDatePicker
                  selected={stringToDate(startDate)}
                  onChange={(date) => setStartDate(dateToString(date))}
                  maxDate={endDate ? stringToDate(endDate) || undefined : undefined}
                  placeholderText="Select start date"
                  disabled={isSaving}
                />
              </div>
              <div className="form-group half">
                <label>Due Date</label>
                <CustomDatePicker
                  selected={stringToDate(endDate)}
                  onChange={(date) => setEndDate(dateToString(date))}
                  minDate={startDate ? stringToDate(startDate) || undefined : undefined}
                  placeholderText="Select due date"
                  disabled={isSaving}
                />
              </div>
            </div>
          )}

          {/* Meeting-specific: Repeat */}
          {isMeeting && (
            <div className="form-group">
              <label>Repeat</label>
              <RepeatSelector
                selectedDate={startDate || endDate || null}
                value={recurrence}
                onChange={setRecurrence}
                onCustomClick={() => setShowRecurrenceModal(true)}
                disabled={isSaving}
              />
            </div>
          )}

          {/* Meeting-specific: Video Room */}
          {isMeeting && (
            <div className="form-group video-room-option">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={hasVideoRoom}
                  onChange={e => setHasVideoRoom(e.target.checked)}
                  disabled={isSaving}
                />
                <Video size={16} />
                <span>Add video meeting room</span>
              </label>
              <p className="video-room-hint">
                {hasVideoRoom
                  ? 'Attendees can join a video call when the meeting starts'
                  : 'No video room - this is an in-person or external meeting'}
              </p>
            </div>
          )}

          {/* Meeting-specific: Color */}
          {isMeeting && (
            <div className="form-group">
              <label>Color</label>
              <div className="color-options">
                {MEETING_COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    className={`color-btn ${color === c.value ? 'selected' : ''}`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setColor(c.value)}
                    disabled={isSaving}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Assignees */}
          <div className="form-group">
            <label>{isMeeting ? 'Invite Attendees' : 'Assign To'}</label>
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
              placeholder={isMeeting ? 'Add meeting agenda or notes...' : 'Add more details...'}
              rows={3}
              disabled={isSaving}
            />
          </div>

          {/* Google Calendar - hidden until app is verified by Google */}
          {/* TODO: Re-enable when Google OAuth verification is complete */}
          {false && isMeeting && (
            <div className="form-group calendar-option">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={addToCalendar}
                  onChange={e => setAddToCalendar(e.target.checked)}
                  disabled={isSaving || !hasCalendarAccess()}
                />
                <Calendar size={16} />
                <span>Send Google Calendar invite</span>
              </label>
              {addToCalendar && hasCalendarAccess() && (
                <p className="calendar-hint">
                  <Mail size={12} />
                  Attendees will receive an email invitation
                </p>
              )}
              {!hasCalendarAccess() && (
                <p className="calendar-hint calendar-hint-warning">
                  Sign out and back in to enable Calendar integration
                </p>
              )}
            </div>
          )}

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
              {isSaving
                ? 'Saving...'
                : isEditing
                  ? 'Save Changes'
                  : isMeeting
                    ? 'Schedule Meeting'
                    : 'Create Task'
              }
            </button>
          </div>
        </form>
      </div>

      {/* Custom Recurrence Modal */}
      <CustomRecurrenceModal
        isOpen={showRecurrenceModal}
        onClose={() => setShowRecurrenceModal(false)}
        onSave={setRecurrence}
        initialPattern={recurrence}
        selectedDate={startDate || endDate || null}
      />
    </div>
  );
}
