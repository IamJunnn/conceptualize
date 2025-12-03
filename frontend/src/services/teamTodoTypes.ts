/**
 * Team Todo Types
 * Defines all types for the team collaborative todo system
 */

// Priority levels (P1 = urgent, P4 = low)
export type TodoPriority = 1 | 2 | 3 | 4;

// Priority configuration
export const PRIORITY_CONFIG = {
  1: { label: 'P1 - Urgent', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.15)' },
  2: { label: 'P2 - High', color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.15)' },
  3: { label: 'P3 - Medium', color: '#eab308', bgColor: 'rgba(234, 179, 8, 0.15)' },
  4: { label: 'P4 - Low', color: '#6b7280', bgColor: 'rgba(107, 114, 128, 0.15)' },
} as const;

// Filter options for todo list
export type TodoFilter = 'all' | 'my-tasks' | 'unassigned';

// Main Team Todo interface
export interface TeamTodo {
  id: string;
  text: string;
  completed: boolean;
  priority: TodoPriority;
  startDate?: string;  // YYYY-MM-DD format
  endDate?: string;    // YYYY-MM-DD format
  description?: string;
  assignees: string[]; // Array of member emails
  createdBy: string;   // Email of creator
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  completedBy?: string; // Email of who completed
}

// Data for creating/updating a todo
export interface TeamTodoFormData {
  text: string;
  priority: TodoPriority;
  startDate?: string;
  endDate?: string;
  description?: string;
  assignees: string[];
}

// Firestore document data (raw from database)
export interface TeamTodoDoc {
  id: string;
  text: string;
  completed: boolean;
  priority: TodoPriority;
  startDate?: string;
  endDate?: string;
  description?: string;
  assignees: string[];
  createdBy: string;
  createdAt: { seconds: number; nanoseconds: number } | Date;
  updatedAt: { seconds: number; nanoseconds: number } | Date;
  completedAt?: { seconds: number; nanoseconds: number } | Date;
  completedBy?: string;
}

// Helper to convert Firestore timestamp to Date
export function firestoreTimestampToDate(
  timestamp: { seconds: number; nanoseconds: number } | Date | undefined
): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return new Date(timestamp.seconds * 1000);
}

// Convert Firestore doc to TeamTodo
export function docToTeamTodo(doc: TeamTodoDoc): TeamTodo {
  return {
    id: doc.id,
    text: doc.text,
    completed: doc.completed,
    priority: doc.priority || 4,
    startDate: doc.startDate,
    endDate: doc.endDate,
    description: doc.description,
    assignees: doc.assignees || [],
    createdBy: doc.createdBy,
    createdAt: firestoreTimestampToDate(doc.createdAt) || new Date(),
    updatedAt: firestoreTimestampToDate(doc.updatedAt) || new Date(),
    completedAt: firestoreTimestampToDate(doc.completedAt),
    completedBy: doc.completedBy,
  };
}

// Check if a todo is overdue
export function isTodoOverdue(todo: TeamTodo): boolean {
  if (todo.completed || !todo.endDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(todo.endDate);
  return endDate < today;
}

// Check if a todo is due soon (within 3 days)
export function isTodoDueSoon(todo: TeamTodo): boolean {
  if (todo.completed || !todo.endDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(todo.endDate);
  const threeDaysFromNow = new Date(today);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  return endDate >= today && endDate <= threeDaysFromNow;
}

// Get initials from email
export function getInitialsFromEmail(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

// Format date for display
export function formatTodoDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateOnly = new Date(dateStr);
  dateOnly.setHours(0, 0, 0, 0);

  if (dateOnly.getTime() === today.getTime()) {
    return 'Today';
  }
  if (dateOnly.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  }

  // Format as "Dec 15" or "Dec 15, 2025" if different year
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== today.getFullYear()) {
    options.year = 'numeric';
  }
  return date.toLocaleDateString('en-US', options);
}
