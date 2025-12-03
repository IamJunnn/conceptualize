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
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  Unsubscribe,
  getDocs,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  TeamTodo,
  TeamTodoFormData,
  TeamTodoDoc,
  TodoPriority,
  docToTeamTodo,
} from './teamTodoTypes';

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
  userEmail: string
): Promise<TeamTodo> {
  try {
    const todosRef = getTodosCollection(teamId);
    const newDocRef = doc(todosRef);
    const todoId = newDocRef.id;

    const now = Timestamp.now();
    const todoDoc = {
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
    };

    await setDoc(newDocRef, todoDoc);

    console.log(`✅ Created todo "${todoData.text}" in team ${teamId}`);

    return {
      ...todoDoc,
      createdAt: now.toDate(),
      updatedAt: now.toDate(),
    } as TeamTodo;
  } catch (error: any) {
    console.error('Failed to create todo:', error);
    throw new Error(`Failed to create todo: ${error.message}`);
  }
}

/**
 * Update a todo
 */
export async function updateTodo(
  teamId: string,
  todoId: string,
  updates: Partial<TeamTodoFormData>
): Promise<void> {
  try {
    const todoRef = getTodoDoc(teamId, todoId);

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

    await updateDoc(todoRef, updateData);

    console.log(`✅ Updated todo ${todoId} in team ${teamId}`);
  } catch (error: any) {
    console.error('Failed to update todo:', error);
    throw new Error(`Failed to update todo: ${error.message}`);
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
  } catch (error: any) {
    console.error('Failed to delete todo:', error);
    throw new Error(`Failed to delete todo: ${error.message}`);
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
  } catch (error: any) {
    console.error('Failed to toggle todo:', error);
    throw new Error(`Failed to toggle todo: ${error.message}`);
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
  } catch (error: any) {
    console.error('Failed to get todos:', error);
    throw new Error(`Failed to get todos: ${error.message}`);
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
  } catch (error: any) {
    console.error('Failed to get todo:', error);
    throw new Error(`Failed to get todo: ${error.message}`);
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
  } catch (error: any) {
    console.error('Failed to assign todo:', error);
    throw new Error(`Failed to assign todo: ${error.message}`);
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
  } catch (error: any) {
    console.error('Failed to update priority:', error);
    throw new Error(`Failed to update priority: ${error.message}`);
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
  } catch (error: any) {
    console.error('Failed to update due date:', error);
    throw new Error(`Failed to update due date: ${error.message}`);
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
    const deletePromises: Promise<void>[] = [];

    snapshot.docs.forEach(docSnap => {
      const todo = docSnap.data();
      if (todo.completed) {
        deletePromises.push(deleteDoc(docSnap.ref));
        deletedCount++;
      }
    });

    await Promise.all(deletePromises);

    console.log(`✅ Deleted ${deletedCount} completed todos from team ${teamId}`);
    return deletedCount;
  } catch (error: any) {
    console.error('Failed to delete completed todos:', error);
    throw new Error(`Failed to delete completed todos: ${error.message}`);
  }
}
