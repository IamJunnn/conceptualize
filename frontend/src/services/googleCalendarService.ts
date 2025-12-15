/**
 * Google Calendar API Service
 * Handles creating, updating, and deleting calendar events for team meetings
 */

import { getAccessToken as getStoredAccessToken, refreshAccessToken as refreshStoredToken, isTokenExpired, hasTokens } from './tokenStorage';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees?: Array<{
    email: string;
    responseStatus?: string;
  }>;
  htmlLink?: string;
}

export interface CreateEventParams {
  summary: string;
  description?: string;
  startDateTime: string; // ISO 8601 format
  endDateTime: string;   // ISO 8601 format
  attendeeEmails: string[];
  timeZone?: string;
}

export interface UpdateEventParams {
  summary?: string;
  description?: string;
  startDateTime?: string;
  endDateTime?: string;
  attendeeEmails?: string[];
  timeZone?: string;
}

/**
 * Get access token from storage with automatic refresh
 */
async function getAccessToken(): Promise<string> {
  if (isTokenExpired()) {
    console.log('[Calendar] Token expired, refreshing...');
    try {
      return await refreshStoredToken();
    } catch (error) {
      console.error('[Calendar] Failed to refresh token:', error);
      throw new Error('Authentication expired. Please sign in again.');
    }
  }

  const token = getStoredAccessToken();
  if (!token) {
    throw new Error('Not authenticated with Google Calendar. Please sign in again.');
  }
  return token;
}

/**
 * Check if user has Calendar access (tokens exist)
 */
export function hasCalendarAccess(): boolean {
  return hasTokens();
}

/**
 * Create a calendar event with attendees
 * Automatically sends email invitations to all attendees
 */
export async function createCalendarEvent(params: CreateEventParams): Promise<CalendarEvent> {
  const token = await getAccessToken();
  const timeZone = params.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  console.log('[Calendar] Creating event:', params.summary);

  const eventBody: any = {
    summary: params.summary,
    description: params.description || '',
    start: {
      dateTime: params.startDateTime,
      timeZone,
    },
    end: {
      dateTime: params.endDateTime,
      timeZone,
    },
  };

  // Add attendees if provided
  if (params.attendeeEmails && params.attendeeEmails.length > 0) {
    eventBody.attendees = params.attendeeEmails.map(email => ({ email }));
  }

  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/primary/events?sendUpdates=all`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('[Calendar] Failed to create event:', error);
    throw new Error(`Failed to create calendar event: ${error}`);
  }

  const event = await response.json();
  console.log('[Calendar] Event created:', event.id);
  return event;
}

/**
 * Update an existing calendar event
 * Sends update notifications to attendees
 */
export async function updateCalendarEvent(
  eventId: string,
  params: UpdateEventParams
): Promise<CalendarEvent> {
  const token = await getAccessToken();
  const timeZone = params.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  console.log('[Calendar] Updating event:', eventId);

  // First get the existing event to merge with updates
  const getResponse = await fetch(
    `${CALENDAR_API_BASE}/calendars/primary/events/${eventId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (!getResponse.ok) {
    const error = await getResponse.text();
    console.error('[Calendar] Failed to get event for update:', error);
    throw new Error(`Failed to get calendar event: ${error}`);
  }

  const existingEvent = await getResponse.json();

  // Build updated event body
  const eventBody: any = {
    ...existingEvent,
  };

  if (params.summary !== undefined) {
    eventBody.summary = params.summary;
  }
  if (params.description !== undefined) {
    eventBody.description = params.description;
  }
  if (params.startDateTime !== undefined) {
    eventBody.start = {
      dateTime: params.startDateTime,
      timeZone,
    };
  }
  if (params.endDateTime !== undefined) {
    eventBody.end = {
      dateTime: params.endDateTime,
      timeZone,
    };
  }
  if (params.attendeeEmails !== undefined) {
    eventBody.attendees = params.attendeeEmails.map(email => ({ email }));
  }

  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/primary/events/${eventId}?sendUpdates=all`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('[Calendar] Failed to update event:', error);
    throw new Error(`Failed to update calendar event: ${error}`);
  }

  const event = await response.json();
  console.log('[Calendar] Event updated:', event.id);
  return event;
}

/**
 * Delete a calendar event
 * Sends cancellation notifications to attendees
 */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const token = await getAccessToken();

  console.log('[Calendar] Deleting event:', eventId);

  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/primary/events/${eventId}?sendUpdates=all`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  // 204 No Content is success for DELETE, 410 Gone means already deleted
  if (!response.ok && response.status !== 204 && response.status !== 410) {
    const error = await response.text();
    console.error('[Calendar] Failed to delete event:', error);
    throw new Error(`Failed to delete calendar event: ${error}`);
  }

  console.log('[Calendar] Event deleted');
}

/**
 * Get a calendar event by ID
 */
export async function getCalendarEvent(eventId: string): Promise<CalendarEvent | null> {
  const token = await getAccessToken();

  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/primary/events/${eventId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const error = await response.text();
    console.error('[Calendar] Failed to get event:', error);
    throw new Error(`Failed to get calendar event: ${error}`);
  }

  return await response.json();
}

/**
 * Helper: Convert date string (YYYY-MM-DD) and time string (HH:MM) to ISO 8601 datetime
 */
export function toISODateTime(date: string, time: string, _timeZone?: string): string {
  // Create a date string that JavaScript can parse
  const dateTimeStr = `${date}T${time}:00`;
  const dateObj = new Date(dateTimeStr);

  // Return ISO string with timezone consideration
  // For Google Calendar, we send the local datetime and specify the timezone separately
  return dateObj.toISOString();
}

/**
 * Helper: Convert meeting data to Calendar API format
 */
export function meetingToCalendarParams(
  title: string,
  description: string | undefined,
  date: string,
  startTime: string,
  endTime: string,
  attendeeEmails: string[]
): CreateEventParams {
  return {
    summary: title,
    description,
    startDateTime: toISODateTime(date, startTime),
    endDateTime: toISODateTime(date, endTime),
    attendeeEmails,
  };
}
