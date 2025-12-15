/**
 * Notification Service
 * Handles desktop notifications for:
 * - Chat mentions and replies
 * - Todo deadline reminders (3 days, 1 day, due date, overdue)
 */

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { getLocalStorage, setLocalStorage } from '../hooks/useLocalStorage';

// Notification types
export type NotificationType =
  | 'mention'
  | 'reply'
  | 'todo_3_days'
  | 'todo_1_day'
  | 'todo_due'
  | 'todo_overdue';

export interface NotificationPreferences {
  enabled: boolean;
  mentions: boolean;
  replies: boolean;
  todoReminders: boolean;
  // Track which todo notifications have been sent to avoid duplicates
  sentTodoNotifications: { [todoId: string]: string[] }; // todoId -> array of sent types
}

const NOTIFICATION_PREFS_KEY = 'notification_preferences';

// Default preferences
const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  mentions: true,
  replies: true,
  todoReminders: true,
  sentTodoNotifications: {},
};

/**
 * Get notification preferences from localStorage
 */
export function getNotificationPreferences(): NotificationPreferences {
  const saved = getLocalStorage<NotificationPreferences | null>(NOTIFICATION_PREFS_KEY, null);
  if (saved) {
    return { ...DEFAULT_PREFERENCES, ...saved };
  }
  return DEFAULT_PREFERENCES;
}

/**
 * Save notification preferences to localStorage
 */
export function saveNotificationPreferences(prefs: NotificationPreferences): void {
  setLocalStorage(NOTIFICATION_PREFS_KEY, prefs);
}

/**
 * Update a specific preference
 */
export function updateNotificationPreference(
  key: keyof Omit<NotificationPreferences, 'sentTodoNotifications'>,
  value: boolean
): void {
  const prefs = getNotificationPreferences();
  prefs[key] = value;
  saveNotificationPreferences(prefs);
}

/**
 * Check if we have permission and request if needed
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    let permissionGranted = await isPermissionGranted();

    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }

    return permissionGranted;
  } catch (e) {
    console.error('Failed to check/request notification permission:', e);
    return false;
  }
}

/**
 * Send a desktop notification
 */
export async function sendDesktopNotification(
  title: string,
  body: string,
  type: NotificationType
): Promise<boolean> {
  const prefs = getNotificationPreferences();

  // Check if notifications are enabled
  if (!prefs.enabled) return false;

  // Check specific notification type preferences
  if (type === 'mention' && !prefs.mentions) return false;
  if (type === 'reply' && !prefs.replies) return false;
  if (type.startsWith('todo_') && !prefs.todoReminders) return false;

  try {
    const hasPermission = await ensureNotificationPermission();
    if (!hasPermission) return false;

    await sendNotification({
      title,
      body,
    });

    return true;
  } catch (e) {
    console.error('Failed to send notification:', e);
    return false;
  }
}

/**
 * Send a mention notification
 */
export async function notifyMention(
  senderName: string,
  messagePreview: string,
  channelName: string
): Promise<boolean> {
  return sendDesktopNotification(
    `${senderName} mentioned you`,
    `${channelName}: ${messagePreview.substring(0, 100)}${messagePreview.length > 100 ? '...' : ''}`,
    'mention'
  );
}

/**
 * Send a reply notification
 */
export async function notifyReply(
  senderName: string,
  messagePreview: string,
  channelName: string
): Promise<boolean> {
  return sendDesktopNotification(
    `${senderName} replied to you`,
    `${channelName}: ${messagePreview.substring(0, 100)}${messagePreview.length > 100 ? '...' : ''}`,
    'reply'
  );
}

/**
 * Check if a todo notification has already been sent
 */
function hasSentTodoNotification(todoId: string, type: NotificationType): boolean {
  const prefs = getNotificationPreferences();
  const sent = prefs.sentTodoNotifications[todoId] || [];
  return sent.includes(type);
}

/**
 * Mark a todo notification as sent
 */
function markTodoNotificationSent(todoId: string, type: NotificationType): void {
  const prefs = getNotificationPreferences();
  if (!prefs.sentTodoNotifications[todoId]) {
    prefs.sentTodoNotifications[todoId] = [];
  }
  if (!prefs.sentTodoNotifications[todoId].includes(type)) {
    prefs.sentTodoNotifications[todoId].push(type);
  }
  saveNotificationPreferences(prefs);
}

/**
 * Clear sent notifications for a todo (e.g., when completed or deleted)
 */
export function clearTodoNotifications(todoId: string): void {
  const prefs = getNotificationPreferences();
  delete prefs.sentTodoNotifications[todoId];
  saveNotificationPreferences(prefs);
}

/**
 * Get days until due date (negative = overdue)
 */
function getDaysUntilDue(dueDate: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffTime = due.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check and send todo deadline notifications
 */
export async function checkTodoDeadlineNotifications(
  todos: Array<{
    id: string;
    title: string;
    completed: boolean;
    end_date?: string | null;
  }>
): Promise<void> {
  const prefs = getNotificationPreferences();
  if (!prefs.enabled || !prefs.todoReminders) return;

  for (const todo of todos) {
    // Skip completed todos or those without due dates
    if (todo.completed || !todo.end_date) continue;

    const dueDate = new Date(todo.end_date);
    const daysUntil = getDaysUntilDue(dueDate);

    // Determine which notification to send
    let notificationType: NotificationType | null = null;
    let message = '';

    if (daysUntil < 0) {
      // Overdue
      notificationType = 'todo_overdue';
      message = `"${todo.title}" is ${Math.abs(daysUntil)} day${Math.abs(daysUntil) > 1 ? 's' : ''} overdue!`;
    } else if (daysUntil === 0) {
      // Due today
      notificationType = 'todo_due';
      message = `"${todo.title}" is due today!`;
    } else if (daysUntil === 1) {
      // Due tomorrow
      notificationType = 'todo_1_day';
      message = `"${todo.title}" is due tomorrow!`;
    } else if (daysUntil <= 3) {
      // Due in 3 days or less
      notificationType = 'todo_3_days';
      message = `"${todo.title}" is due in ${daysUntil} days.`;
    }

    // Send notification if applicable and not already sent
    if (notificationType && !hasSentTodoNotification(todo.id, notificationType)) {
      const sent = await sendDesktopNotification(
        'Todo Reminder',
        message,
        notificationType
      );

      if (sent) {
        markTodoNotificationSent(todo.id, notificationType);
      }
    }
  }
}

/**
 * Check if a message mentions the current user
 */
export function messageContainsMention(
  messageContent: string,
  currentUserDisplayName: string,
  currentUserEmail: string
): boolean {
  const content = messageContent.toLowerCase();
  const displayName = currentUserDisplayName.toLowerCase();
  const emailPrefix = currentUserEmail.split('@')[0].toLowerCase();

  // Check for @mention patterns
  const mentionPatterns = [
    `@${displayName}`,
    `@${emailPrefix}`,
  ];

  return mentionPatterns.some(pattern => content.includes(pattern));
}

// Export a function to start periodic todo checks
let todoCheckInterval: ReturnType<typeof setInterval> | null = null;

export function startTodoNotificationChecker(
  getTodos: () => Promise<Array<{
    id: string;
    title: string;
    completed: boolean;
    end_date?: string | null;
  }>>
): void {
  // Clear existing interval if any
  if (todoCheckInterval) {
    clearInterval(todoCheckInterval);
  }

  // Check immediately on start
  getTodos().then(todos => checkTodoDeadlineNotifications(todos));

  // Check every hour
  todoCheckInterval = setInterval(async () => {
    const todos = await getTodos();
    await checkTodoDeadlineNotifications(todos);
  }, 60 * 60 * 1000); // 1 hour
}

export function stopTodoNotificationChecker(): void {
  if (todoCheckInterval) {
    clearInterval(todoCheckInterval);
    todoCheckInterval = null;
  }
}
