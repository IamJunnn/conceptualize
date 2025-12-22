import { useState, useEffect } from 'react';
import { TeamMember } from '../../services/teamService';
import { TeamTodo } from '../../services/teamTodoTypes';
import { deleteTodo } from '../../services/teamTodoService';
import { deleteCalendarEvent } from '../../services/googleCalendarService';
import { startCall, getCallState } from '../../services/callService';
import { X, Repeat, Video, Edit2, Trash2, Loader, MapPin } from 'lucide-react';
import PermissionModal, { hasStoredPermission } from './Chat/PermissionModal';
import './MeetingDetailsModal.css';

interface MeetingDetailsModalProps {
  meeting: TeamTodo;
  members: { [email: string]: TeamMember };
  teamId: string;
  currentUserEmail: string;
  onClose: () => void;
  onEdit: (meeting: TeamTodo) => void;
  onMeetingCallStarted?: () => void;
}

// Helper to check if a meeting is happening now or soon
function isMeetingNowOrSoon(meeting: TeamTodo): 'now' | 'soon' | null {
  if (!meeting.startDate || !meeting.meetingDetails?.startTime) return null;

  const now = new Date();
  const meetingStart = new Date(meeting.startDate);
  const [startHours, startMinutes] = meeting.meetingDetails.startTime.split(':').map(Number);
  meetingStart.setHours(startHours, startMinutes, 0, 0);

  const meetingEnd = new Date(meeting.startDate);
  if (meeting.meetingDetails?.endTime) {
    const [endHours, endMinutes] = meeting.meetingDetails.endTime.split(':').map(Number);
    meetingEnd.setHours(endHours, endMinutes, 0, 0);
  } else {
    meetingEnd.setHours(startHours + 1, startMinutes, 0, 0);
  }

  // Meeting is happening now
  if (now >= meetingStart && now <= meetingEnd) {
    return 'now';
  }

  // Meeting starts within 15 minutes
  const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);
  if (meetingStart > now && meetingStart <= fifteenMinutesFromNow) {
    return 'soon';
  }

  return null;
}

export default function MeetingDetailsModal({
  meeting,
  members,
  teamId,
  currentUserEmail,
  onClose,
  onEdit,
  onMeetingCallStarted,
}: MeetingDetailsModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  const status = isMeetingNowOrSoon(meeting);
  const canJoin = (status === 'now' || status === 'soon') && meeting.meetingDetails?.hasVideoRoom !== false;

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting && !isJoining) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isDeleting, isJoining]);

  // Format time for display
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }

    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    };
    return date.toLocaleDateString('en-US', options);
  };

  // Get short repeat label
  const getRepeatLabel = () => {
    if (!meeting.meetingDetails?.recurrence) return null;
    const type = meeting.meetingDetails.recurrence.type;
    if (type === 'none') return null;

    const labels: { [key: string]: string } = {
      daily: 'Daily',
      weekly: 'Weekly',
      biweekly: 'Every 2 weeks',
      monthly: 'Monthly',
      custom: 'Custom',
    };
    return labels[type] || type;
  };

  // Handle delete
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this meeting?')) return;

    setIsDeleting(true);
    try {
      // Delete Google Calendar event if it exists
      if (meeting.meetingDetails?.calendarEventId) {
        try {
          await deleteCalendarEvent(meeting.meetingDetails.calendarEventId);
          console.log('Calendar event deleted');
        } catch (calendarErr) {
          console.warn('Failed to delete calendar event:', calendarErr);
          // Continue with meeting deletion even if calendar deletion fails
        }
      }

      await deleteTodo(teamId, meeting.id);
      onClose();
    } catch (err) {
      console.error('Failed to delete meeting:', err);
      alert('Failed to delete meeting. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle join call - show permission modal first (or skip if already granted)
  const handleJoinCall = () => {
    // Check if already in a call
    const currentCallState = getCallState();
    if (currentCallState.activeCall) {
      alert('You are already in a call. Please end the current call first.');
      return;
    }

    // Check if permission was previously granted (meetings are always video)
    if (hasStoredPermission('video')) {
      // Skip modal and join call directly
      executeJoinCall();
    } else {
      setShowPermissionModal(true);
    }
  };

  // Execute join after permission granted
  const executeJoinCall = async () => {
    setShowPermissionModal(false);
    setIsJoining(true);
    try {
      // Normalize emails to lowercase for consistent Firestore queries
      const currentUserEmailLower = currentUserEmail.toLowerCase();
      const attendeesLower = meeting.assignees.map(e => e.toLowerCase());
      const attendees = attendeesLower.includes(currentUserEmailLower)
        ? attendeesLower
        : [...attendeesLower, currentUserEmailLower];

      const currentUser = members[currentUserEmail] || members[currentUserEmailLower];
      const userName = currentUser?.displayName || currentUserEmail.split('@')[0];
      const userPhotoURL = currentUser?.photoURL;
      const userCustomAvatar = currentUser?.customAvatar;

      const meetingChannelId = `meeting_${meeting.id}`;

      await startCall(
        teamId,
        meetingChannelId,
        attendees,
        'video',
        currentUserEmailLower,
        userName,
        userPhotoURL,
        userCustomAvatar
      );

      onMeetingCallStarted?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to join meeting:', err);
      alert(err.message || 'Failed to join meeting. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  const dateStr = meeting.startDate || meeting.endDate;
  const repeatLabel = getRepeatLabel();
  const hasVideoRoom = meeting.meetingDetails?.hasVideoRoom !== false;

  // Build the date/time string
  const getDateTimeString = () => {
    const parts: string[] = [];
    if (dateStr) parts.push(formatDate(dateStr));
    if (meeting.meetingDetails?.startTime) {
      let timeStr = formatTime(meeting.meetingDetails.startTime);
      if (meeting.meetingDetails.endTime) {
        timeStr += ` - ${formatTime(meeting.meetingDetails.endTime)}`;
      }
      parts.push(timeStr);
    }
    return parts.join(' • ');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content meeting-details-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div
          className="meeting-details-header"
          style={{ borderLeftColor: meeting.meetingDetails?.color || '#64c8ca' }}
        >
          <button className="close-btn" onClick={onClose} title="Close">
            <X size={16} />
          </button>

          <div className="header-content">
            <h2>
              {meeting.text}
              {status === 'now' && <span className="status-badge live">LIVE</span>}
              {status === 'soon' && <span className="status-badge soon">Soon</span>}
            </h2>

            {/* Date & Time - prominent */}
            <div className="meeting-datetime">
              <span className="datetime-text">{getDateTimeString()}</span>
              {repeatLabel && (
                <span className="repeat-badge">
                  <Repeat size={12} />
                  {repeatLabel}
                </span>
              )}
            </div>

            {/* Attendees - horizontal avatars */}
            {meeting.assignees.length > 0 && (
              <div className="meeting-attendees">
                <div className="attendee-avatars">
                  {meeting.assignees.slice(0, 5).map((email, index) => {
                    // Find member by email (handles encoded Firebase keys)
                    const member = members[email] || Object.values(members).find(m => m.email?.toLowerCase() === email.toLowerCase());
                    const avatarUrl = member?.customAvatar || member?.photoURL;
                    const initials = member?.displayName
                      ? member.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                      : email.substring(0, 2).toUpperCase();
                    return (
                      <div
                        key={email}
                        className="avatar-circle"
                        style={{ zIndex: 10 - index }}
                        title={member?.displayName || email}
                      >
                        {avatarUrl ? (
                          <img src={avatarUrl} alt={initials} />
                        ) : (
                          initials
                        )}
                      </div>
                    );
                  })}
                  {meeting.assignees.length > 5 && (
                    <div className="avatar-circle avatar-more" style={{ zIndex: 4 }}>
                      +{meeting.assignees.length - 5}
                    </div>
                  )}
                </div>
                <span className="attendee-count">
                  {meeting.assignees.length} attendee{meeting.assignees.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="header-actions">
            <button
              className="action-btn edit-btn"
              onClick={() => onEdit(meeting)}
              title="Edit meeting"
            >
              <Edit2 size={14} />
              <span>Edit</span>
            </button>
            <button
              className="action-btn delete-btn"
              onClick={handleDelete}
              disabled={isDeleting}
              title="Delete meeting"
            >
              {isDeleting ? <Loader size={14} className="spin" /> : <Trash2 size={14} />}
              <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
            </button>
          </div>
        </div>

        {/* Body - only show if there's description or no video room */}
        {(meeting.description || !hasVideoRoom) && (
          <div className="meeting-details-body">
            {/* No video room notice */}
            {!hasVideoRoom && (
              <div className="info-row no-video">
                <MapPin size={14} />
                <span>In-person or external meeting</span>
              </div>
            )}

            {/* Description */}
            {meeting.description && (
              <div className="description-section">
                <p className="description-text">{meeting.description}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer with Join button */}
        {canJoin && (
          <div className="meeting-details-footer">
            <button
              className={`join-meeting-btn ${status === 'now' ? 'live' : ''}`}
              onClick={handleJoinCall}
              disabled={isJoining}
            >
              {isJoining ? (
                <>
                  <Loader size={16} className="spin" />
                  Joining...
                </>
              ) : (
                <>
                  <Video size={16} />
                  {status === 'now' ? 'Join Now' : 'Join Meeting'}
                </>
              )}
            </button>
          </div>
        )}

        {/* Permission Modal */}
        <PermissionModal
          isOpen={showPermissionModal}
          callType="video"
          onAllow={executeJoinCall}
          onDeny={() => setShowPermissionModal(false)}
        />
      </div>
    </div>
  );
}
