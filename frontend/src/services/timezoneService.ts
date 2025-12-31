/**
 * Timezone Service
 * Utilities for timezone conversion and display
 */

import { TimeBlock, DayOfWeek, timeToMinutes, minutesToTime } from './workScheduleTypes';

/**
 * Get the user's current timezone
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Get timezone offset in minutes for a given timezone
 * Positive = ahead of UTC, Negative = behind UTC
 */
export function getTimezoneOffset(timezone: string, date: Date = new Date()): number {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60);
}

/**
 * Convert a time from one timezone to another
 * Returns the converted time and potentially a day offset (-1, 0, or +1)
 */
export function convertTimeBetweenTimezones(
  time: string, // HH:MM format
  dayOfWeek: DayOfWeek,
  fromTimezone: string,
  toTimezone: string,
  referenceDate: Date = new Date()
): { time: string; dayOfWeek: DayOfWeek; dayOffset: number } {
  // Get offset difference
  const fromOffset = getTimezoneOffset(fromTimezone, referenceDate);
  const toOffset = getTimezoneOffset(toTimezone, referenceDate);
  const offsetDiff = toOffset - fromOffset; // in minutes

  // Convert time to minutes and add offset
  const originalMinutes = timeToMinutes(time);
  let newMinutes = originalMinutes + offsetDiff;

  // Handle day overflow/underflow
  let dayOffset = 0;
  if (newMinutes >= 24 * 60) {
    dayOffset = 1;
    newMinutes -= 24 * 60;
  } else if (newMinutes < 0) {
    dayOffset = -1;
    newMinutes += 24 * 60;
  }

  // Calculate new day of week
  let newDayOfWeek = (dayOfWeek + dayOffset) as DayOfWeek;
  if (newDayOfWeek > 6) newDayOfWeek = 0 as DayOfWeek;
  if (newDayOfWeek < 0) newDayOfWeek = 6 as DayOfWeek;

  return {
    time: minutesToTime(newMinutes),
    dayOfWeek: newDayOfWeek,
    dayOffset,
  };
}

/**
 * Convert a time block from one timezone to another
 */
export function convertBlockTimezone(
  block: TimeBlock,
  fromTimezone: string,
  toTimezone: string
): TimeBlock {
  const startConverted = convertTimeBetweenTimezones(
    block.startTime,
    block.dayOfWeek,
    fromTimezone,
    toTimezone
  );

  const endConverted = convertTimeBetweenTimezones(
    block.endTime,
    block.dayOfWeek,
    fromTimezone,
    toTimezone
  );

  // If start and end are on different days after conversion,
  // we need to split the block (for simplicity, we'll just use the start day)
  return {
    ...block,
    startTime: startConverted.time,
    endTime: endConverted.time,
    dayOfWeek: startConverted.dayOfWeek,
  };
}

/**
 * Convert all blocks in a schedule to viewer's timezone
 */
export function convertScheduleToViewerTimezone(
  blocks: TimeBlock[],
  ownerTimezone: string,
  viewerTimezone: string
): TimeBlock[] {
  if (ownerTimezone === viewerTimezone) {
    return blocks;
  }

  return blocks.map(block => convertBlockTimezone(block, ownerTimezone, viewerTimezone));
}

/**
 * Format timezone for display
 * e.g., "America/Los_Angeles" -> "PT" or "PST/PDT"
 */
export function formatTimezoneShort(timezone: string): string {
  try {
    const date = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    return tzPart?.value || timezone;
  } catch {
    return timezone;
  }
}

/**
 * Get current time in a timezone
 */
export function getCurrentTimeInTimezone(timezone: string): string {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get current day of week in a timezone (0 = Sunday)
 */
export function getCurrentDayInTimezone(timezone: string): DayOfWeek {
  const now = new Date();
  const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  return tzDate.getDay() as DayOfWeek;
}

/**
 * Format time difference between two timezones
 * e.g., "+3 hours" or "-5.5 hours"
 */
export function formatTimezoneDifference(
  fromTimezone: string,
  toTimezone: string
): string {
  const fromOffset = getTimezoneOffset(fromTimezone);
  const toOffset = getTimezoneOffset(toTimezone);
  const diffMinutes = toOffset - fromOffset;

  if (diffMinutes === 0) {
    return 'same time';
  }

  const hours = Math.abs(diffMinutes) / 60;
  const sign = diffMinutes > 0 ? '+' : '-';
  const hoursStr = hours % 1 === 0 ? hours.toString() : hours.toFixed(1);

  return `${sign}${hoursStr} ${hours === 1 ? 'hour' : 'hours'}`;
}

/**
 * Check if a timezone is valid
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a list of all IANA timezones
 */
export function getAllTimezones(): string[] {
  // Common timezones - a more complete list would be much longer
  return [
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
    'America/Anchorage',
    'Pacific/Honolulu',
    'America/Phoenix',
    'America/Toronto',
    'America/Vancouver',
    'America/Mexico_City',
    'America/Bogota',
    'America/Lima',
    'America/Santiago',
    'America/Buenos_Aires',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Dublin',
    'Europe/Lisbon',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Amsterdam',
    'Europe/Brussels',
    'Europe/Madrid',
    'Europe/Rome',
    'Europe/Zurich',
    'Europe/Vienna',
    'Europe/Warsaw',
    'Europe/Prague',
    'Europe/Stockholm',
    'Europe/Oslo',
    'Europe/Helsinki',
    'Europe/Athens',
    'Europe/Istanbul',
    'Europe/Moscow',
    'Asia/Dubai',
    'Asia/Karachi',
    'Asia/Kolkata',
    'Asia/Dhaka',
    'Asia/Bangkok',
    'Asia/Jakarta',
    'Asia/Singapore',
    'Asia/Hong_Kong',
    'Asia/Shanghai',
    'Asia/Taipei',
    'Asia/Seoul',
    'Asia/Tokyo',
    'Australia/Perth',
    'Australia/Adelaide',
    'Australia/Brisbane',
    'Australia/Sydney',
    'Australia/Melbourne',
    'Pacific/Auckland',
    'Pacific/Fiji',
  ];
}

/**
 * Format a full timezone description
 * e.g., "Pacific Time (PT) - Los Angeles"
 */
export function formatTimezoneFullName(timezone: string): string {
  const short = formatTimezoneShort(timezone);
  const city = timezone.split('/').pop()?.replace(/_/g, ' ') || timezone;
  return `${city} (${short})`;
}
