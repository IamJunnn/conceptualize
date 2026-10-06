/**
 * Team Todo Service
 * Manages team todos with Firestore real-time sync
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  Unsubscribe,
  getDocs,
} from 'firebase/firestore';
import { db } from './firebase';
import { getErrorMessage } from '../utils/errorUtils';
import {
  TeamTodo,
  TeamTodoFormData,
  TeamTodoDoc,
  TodoPriority,
  docToTeamTodo,
} from './teamTodoTypes';
import { createBulkNotifications } from './teamChatService';

/**
 * Get the todos collection reference for a team
 */
function getTodosCollection(teamId: string) {
  return collection(db, 'teams', teamId, 'todos');
}

/**
 * Get a single todo document reference
 */
function getTodoDoc(teamId: string, todoId: string) {
  return doc(db, 'teams', teamId, 'todos', todoId);
}

/**
 * Create a new todo
 */
export async function createTodo(
  teamId: string,
  todoData: TeamTodoFormData,
  userEmail: string,
  userName?: string
): Promise<TeamTodo> {
  try {
    const todosRef = getTodosCollection(teamId);
    const newDocRef = doc(todosRef);
    const todoId = newDocRef.id;

    const now = Timestamp.now();
    const isMeeting = todoData.type === 'meeting';

    const todoDoc: any = {
      id: todoId,
      text: todoData.text.trim(),
      completed: false,
      priority: todoData.priority || 4,
      startDate: todoData.startDate || null,
      endDate: todoData.endDate || null,
      description: todoData.description?.trim() || null,
      assignees: todoData.assignees || [],
      createdBy: userEmail,
      createdAt: now,
      updatedAt: now,
      type: todoData.type || 'task',
    };

    // Add meeting details if this is a meeting
    if (isMeeting && todoData.meetingDetails) {
      todoDoc.meetingDetails = todoData.meetingDetails;
    }

    await setDoc(newDocRef, todoDoc);

    console.log(`✅ Created ${isMeeting ? 'meeting' : 'todo'} "${todoData.text}" in team ${teamId}`);

    // Send notifications to assignees (excluding the creator)
    const assigneesToNotify = (todoData.assignees || []).filter(email => email !== userEmail);
    if (assigneesToNotify.length > 0) {
      const senderName = userName || userEmail.split('@')[0];
      const todoTitle = todoData.text.length > 50
        ? todoData.text.substring(0, 50) + '...'
        : todoData.text;

      if (isMeeting) {
        // Send meeting invite notification
        const meetingTime = todoData.meetingDetails?.startTime || '';
        const meetingDate = todoData.startDate || todoData.endDate || '';

        createBulkNotifications(teamId, assigneesToNotify, {
          type: 'meeting_invite',
          title: 'Meeting Invitation',
          message: `${senderName} invited you to: "${todoTitle}" on ${meetingDate} at ${meetingTime}`,
          senderEmail: userEmail,
          senderName,
          todoId,
          todoTitle: todoData.text,
        }).catch(err => console.error('Error sending meeting invite notifications:', err));
      } else {
        // Send task assignment notification
        createBulkNotifications(teamId, assigneesToNotify, {
          type: 'todo_assigned',
          title: 'Task Assigned to You',
          message: `${senderName} assigned you: "${todoTitle}"`,
          senderEmail: userEmail,
          senderName,
          todoId,
          todoTitle: todoData.text,
        }).catch(err => console.error('Error sending todo assignment notifications:', err));
      }
    }

    return {
      ...todoDoc,
      createdAt: now.toDate(),
      updatedAt: now.toDate(),
    } as TeamTodo;
  } catch (error) {
    console.error('Failed to create todo:', error);
    throw new Error(`Failed to create todo: ${getErrorMessage(error)}`);
  }
}

/**
 * Update a todo
 */
export async function updateTodo(
  teamId: string,
  todoId: string,
  updates: Partial<TeamTodoFormData>,
  updaterEmail?: string,
  updaterName?: string
): Promise<void> {
  try {
    const todoRef = getTodoDoc(teamId, todoId);

    // Get current todo data to check for new assignees
    const currentTodoSnap = await getDoc(todoRef);
    const currentTodo = currentTodoSnap.data() as TeamTodoDoc | undefined;

    const updateData: any = {
      updatedAt: Timestamp.now(),
    };

    if (updates.text !== undefined) {
      updateData.text = updates.text.trim();
    }
    if (updates.priority !== undefined) {
      updateData.priority = updates.priority;
    }
    if (updates.startDate !== undefined) {
      updateData.startDate = updates.startDate || null;
    }
    if (updates.endDate !== undefined) {
      updateData.endDate = updates.endDate || null;
    }
    if (updates.description !== undefined) {
      updateData.description = updates.description?.trim() || null;
    }
    if (updates.assignees !== undefined) {
      updateData.assignees = updates.assignees;
    }
    if (updates.type !== undefined) {
      updateData.type = updates.type;
    }
    if (updates.meetingDetails !== undefined) {
      updateData.meetingDetails = updates.meetingDetails;
    }

    await updateDoc(todoRef, updateData);

    console.log(`✅ Updated todo ${todoId} in team ${teamId}`);

    // Send notifications to newly added assignees
    if (updates.assignees !== undefined && updaterEmail && currentTodo) {
      const currentAssignees = currentTodo.assignees || [];
      const newAssignees = updates.assignees.filter(
        email => !currentAssignees.includes(email) && email !== updaterEmail
      );

      if (newAssignees.length > 0) {
        const senderName = updaterName || updaterEmail.split('@')[0];
        const todoTitle = (updates.text || currentTodo.text || 'Task').substring(0, 50);

        createBulkNotifications(teamId, newAssignees, {
          type: 'todo_assigned',
          title: 'Task Assigned to You',
          message: `${senderName} assigned you: "${todoTitle}"`,
          senderEmail: updaterEmail,
          senderName,
          todoId,
          todoTitle: updates.text || currentTodo.text,
        }).catch(err => console.error('Error sending todo assignment notifications:', err));
      }
    }
  } catch (error) {
    console.error('Failed to update todo:', error);
    throw new Error(`Failed to update todo: ${getErrorMessage(error)}`);
  }
}

/**
 * Delete a todo
 */
export async function deleteTodo(
  teamId: string,
  todoId: string
): Promise<void> {
  try {
    const todoRef = getTodoDoc(teamId, todoId);
    await deleteDoc(todoRef);

    console.log(`✅ Deleted todo ${todoId} from team ${teamId}`);
  } catch (error) {
    console.error('Failed to delete todo:', error);
    throw new Error(`Failed to delete todo: ${getErrorMessage(error)}`);
  }
}

/**
 * Toggle todo completion status
 */
export async function toggleTodo(
  teamId: string,
  todoId: string,
  userEmail: string
): Promise<void> {
  try {
    const todoRef = getTodoDoc(teamId, todoId);
    const todoSnap = await getDoc(todoRef);

    if (!todoSnap.exists()) {
      throw new Error('Todo not found');
    }

    const todo = todoSnap.data();
    const newCompleted = !todo.completed;

    const updateData: any = {
      completed: newCompleted,
      updatedAt: Timestamp.now(),
    };

    if (newCompleted) {
      updateData.completedAt = Timestamp.now();
      updateData.completedBy = userEmail;
    } else {
      updateData.completedAt = null;
      updateData.completedBy = null;
    }

    await updateDoc(todoRef, updateData);

    console.log(`✅ Toggled todo ${todoId} to ${newCompleted ? 'completed' : 'incomplete'}`);
  } catch (error) {
    console.error('Failed to toggle todo:', error);
    throw new Error(`Failed to toggle todo: ${getErrorMessage(error)}`);
  }
}

/**
 * Get all todos for a team (one-time fetch)
 */
export async function getTodos(teamId: string): Promise<TeamTodo[]> {
  try {
    const todosRef = getTodosCollection(teamId);
    const q = query(todosRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    const todos = snapshot.docs.map(docSnap => {
      const data = docSnap.data() as TeamTodoDoc;
      return docToTeamTodo(data);
    });

    console.log(`✅ Fetched ${todos.length} todos for team ${teamId}`);
    return todos;
  } catch (error) {
    console.error('Failed to get todos:', error);
    throw new Error(`Failed to get todos: ${getErrorMessage(error)}`);
  }
}

/**
 * Subscribe to real-time todo updates
 * Returns an unsubscribe function
 */
export function subscribeToTodos(
  teamId: string,
  callback: (todos: TeamTodo[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const todosRef = getTodosCollection(teamId);
  const q = query(todosRef, orderBy('createdAt', 'desc'));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const todos = snapshot.docs.map(docSnap => {
        const data = docSnap.data() as TeamTodoDoc;
        return docToTeamTodo(data);
      });
      callback(todos);
    },
    (error) => {
      console.error('Error in todos subscription:', error);
      onError?.(error);
    }
  );

  console.log(`📡 Subscribed to todos for team ${teamId}`);
  return unsubscribe;
}

/**
 * Get a single todo by ID
 */
export async function getTodoById(
  teamId: string,
  todoId: string
): Promise<TeamTodo | null> {
  try {
    const todoRef = getTodoDoc(teamId, todoId);
    const todoSnap = await getDoc(todoRef);

    if (!todoSnap.exists()) {
      return null;
    }

    const data = todoSnap.data() as TeamTodoDoc;
    return docToTeamTodo(data);
  } catch (error) {
    console.error('Failed to get todo:', error);
    throw new Error(`Failed to get todo: ${getErrorMessage(error)}`);
  }
}

/**
 * Assign a todo to members
 */
export async function assignTodo(
  teamId: string,
  todoId: string,
  assignees: string[]
): Promise<void> {
  try {
    const todoRef = getTodoDoc(teamId, todoId);
    await updateDoc(todoRef, {
      assignees,
      updatedAt: Timestamp.now(),
    });

    console.log(`✅ Assigned todo ${todoId} to ${assignees.length} members`);
  } catch (error) {
    console.error('Failed to assign todo:', error);
    throw new Error(`Failed to assign todo: ${getErrorMessage(error)}`);
  }
}

/**
 * Update todo priority
 */
export async function updateTodoPriority(
  teamId: string,
  todoId: string,
  priority: TodoPriority
): Promise<void> {
  try {
    const todoRef = getTodoDoc(teamId, todoId);
    await updateDoc(todoRef, {
      priority,
      updatedAt: Timestamp.now(),
    });

    console.log(`✅ Updated priority for todo ${todoId} to P${priority}`);
  } catch (error) {
    console.error('Failed to update priority:', error);
    throw new Error(`Failed to update priority: ${getErrorMessage(error)}`);
  }
}

/**
 * Update todo due date
 */
export async function updateTodoDueDate(
  teamId: string,
  todoId: string,
  endDate: string | null
): Promise<void> {
  try {
    const todoRef = getTodoDoc(teamId, todoId);
    await updateDoc(todoRef, {
      endDate,
      updatedAt: Timestamp.now(),
    });

    console.log(`✅ Updated due date for todo ${todoId}`);
  } catch (error) {
    console.error('Failed to update due date:', error);
    throw new Error(`Failed to update due date: ${getErrorMessage(error)}`);
  }
}

/**
 * Batch delete completed todos
 */
export async function deleteCompletedTodos(teamId: string): Promise<number> {
  try {
    const todosRef = getTodosCollection(teamId);
    const snapshot = await getDocs(todosRef);

    let deletedCount = 0;
    const completedDocs = snapshot.docs.filter(docSnap => docSnap.data().completed);
    deletedCount = completedDocs.length;

    // Delete in Firestore batches (max 500 per batch)
    for (let i = 0; i < completedDocs.length; i += 500) {
      const batch = writeBatch(db);
      completedDocs.slice(i, i + 500).forEach(docSnap => batch.delete(docSnap.ref));
      await batch.commit();
    }

    console.log(`✅ Deleted ${deletedCount} completed todos from team ${teamId}`);
    return deletedCount;
  } catch (error) {
    console.error('Failed to delete completed todos:', error);
    throw new Error(`Failed to delete completed todos: ${getErrorMessage(error)}`);
  }
}
