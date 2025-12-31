/**
 * Work Schedule Types
 * Defines types for the team availability/work schedule feature
 */

// Days of the week (0 = Sunday, 1 = Monday, etc.)
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAY_NAMES: Record<DayOfWeek, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export const DAY_SHORT_NAMES: Record<DayOfWeek, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

// Color presets for time blocks
export const SCHEDULE_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Cyan', value: '#06b6d4' },
] as const;

// A single time block within a schedule
export interface TimeBlock {
  id: string;
  dayOfWeek: DayOfWeek;
  startTime: string; // HH:MM format (24h)
  endTime: string;   // HH:MM format (24h)
  activity: string;  // e.g., "Conceptualizer coding"
  color: string;     // Hex color
}

// User's complete work schedule
export interface WorkSchedule {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  timezone: string;           // IANA timezone (e.g., "America/Los_Angeles")
  weeklyBlocks: TimeBlock[];  // All time blocks for the week
  sharedWithTeams: string[];  // Team IDs this schedule is shared with
  customColors: string[];     // User's saved custom colors (max 8)
  createdAt: Date;
  updatedAt: Date;
}

// Form data for creating/updating time blocks
export interface TimeBlockFormData {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  activity: string;
  color: string;
}

// Firestore document structure
export interface WorkScheduleDoc {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  timezone: string;
  weeklyBlocks: TimeBlock[];
  sharedWithTeams: string[];
  customColors?: string[];
  createdAt: { seconds: number; nanoseconds: number } | Date;
  updatedAt: { seconds: number; nanoseconds: number } | Date;
}

// Convert Firestore timestamp to Date
export function firestoreTimestampToDate(
  timestamp: { seconds: number; nanoseconds: number } | Date | undefined
): Date {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  return new Date(timestamp.seconds * 1000);
}

// Convert Firestore doc to WorkSchedule
export function docToWorkSchedule(doc: WorkScheduleDoc): WorkSchedule {
  return {
    id: doc.id,
    userId: doc.userId,
    email: doc.email,
    displayName: doc.displayName,
    timezone: doc.timezone,
    weeklyBlocks: doc.weeklyBlocks || [],
    sharedWithTeams: doc.sharedWithTeams || [],
    customColors: doc.customColors || [],
    createdAt: firestoreTimestampToDate(doc.createdAt),
    updatedAt: firestoreTimestampToDate(doc.updatedAt),
  };
}

// Generate a unique ID for time blocks
export function generateBlockId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Format time for display (24h to 12h)
export function formatTime12h(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${suffix}`;
}

// Parse 12h time to 24h format
export function parseTime24h(time12: string): string {
  const match = time12.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return time12;

  let hours = parseInt(match[1]);
  const minutes = match[2];
  const period = match[3].toUpperCase();

  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

// Check if two time blocks overlap
export function doBlocksOverlap(block1: TimeBlock, block2: TimeBlock): boolean {
  if (block1.dayOfWeek !== block2.dayOfWeek) return false;

  const start1 = timeToMinutes(block1.startTime);
  const end1 = timeToMinutes(block1.endTime);
  const start2 = timeToMinutes(block2.startTime);
  const end2 = timeToMinutes(block2.endTime);

  return start1 < end2 && start2 < end1;
}

// Convert HH:MM to minutes since midnight
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Convert minutes since midnight to HH:MM
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// Get hours array for grid display (6 AM to 11 PM)
export function getHoursArray(): string[] {
  const hours: string[] = [];
  for (let h = 6; h <= 23; h++) {
    hours.push(`${h.toString().padStart(2, '0')}:00`);
  }
  return hours;
}

// Common timezone options
export const TIMEZONE_OPTIONS = [
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central European (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Tokyo', label: 'Japan (JST)' },
  { value: 'Asia/Seoul', label: 'Korea (KST)' },
  { value: 'Asia/Shanghai', label: 'China (CST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEST)' },
  { value: 'Pacific/Auckland', label: 'New Zealand (NZST)' },
] as const;
