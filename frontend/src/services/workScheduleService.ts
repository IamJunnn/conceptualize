/**
 * Work Schedule Service
 * Manages user work schedules with Firestore real-time sync
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
  Unsubscribe,
  getDocs,
} from 'firebase/firestore';
import { db } from './firebase';
import { getErrorMessage } from '../utils/errorUtils';
import {
  WorkSchedule,
  WorkScheduleDoc,
  TimeBlock,
  TimeBlockFormData,
  docToWorkSchedule,
  generateBlockId,
} from './workScheduleTypes';

/**
 * Get the work schedule document reference for a user
 */
function getScheduleDoc(userId: string) {
  return doc(db, 'workSchedules', userId);
}

/**
 * Create or update a user's work schedule
 */
export async function saveWorkSchedule(
  userId: string,
  email: string,
  displayName: string,
  timezone: string,
  weeklyBlocks: TimeBlock[],
  sharedWithTeams: string[]
): Promise<WorkSchedule> {
  try {
    const scheduleRef = getScheduleDoc(userId);
    const existingDoc = await getDoc(scheduleRef);
    const now = Timestamp.now();

    const scheduleData: any = {
      id: userId,
      userId,
      email: email.toLowerCase(),
      displayName,
      timezone,
      weeklyBlocks,
      sharedWithTeams,
      updatedAt: now,
    };

    if (!existingDoc.exists()) {
      scheduleData.createdAt = now;
    }

    await setDoc(scheduleRef, scheduleData, { merge: true });

    console.log(`✅ Saved work schedule for ${email}`);

    return {
      ...scheduleData,
      createdAt: existingDoc.exists()
        ? docToWorkSchedule(existingDoc.data() as WorkScheduleDoc).createdAt
        : now.toDate(),
      updatedAt: now.toDate(),
    };
  } catch (error) {
    console.error('Failed to save work schedule:', error);
    throw new Error(`Failed to save work schedule: ${getErrorMessage(error)}`);
  }
}

/**
 * Get a user's work schedule
 */
export async function getWorkSchedule(userId: string): Promise<WorkSchedule | null> {
  try {
    const scheduleRef = getScheduleDoc(userId);
    const snapshot = await getDoc(scheduleRef);

    if (!snapshot.exists()) {
      return null;
    }

    return docToWorkSchedule(snapshot.data() as WorkScheduleDoc);
  } catch (error) {
    console.error('Failed to get work schedule:', error);
    throw new Error(`Failed to get work schedule: ${getErrorMessage(error)}`);
  }
}

/**
 * Subscribe to a user's work schedule for real-time updates
 */
export function subscribeToWorkSchedule(
  userId: string,
  callback: (schedule: WorkSchedule | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const scheduleRef = getScheduleDoc(userId);

  return onSnapshot(
    scheduleRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      callback(docToWorkSchedule(snapshot.data() as WorkScheduleDoc));
    },
    (error) => {
      console.error('Error in work schedule subscription:', error);
      onError?.(error);
    }
  );
}

/**
 * Get all work schedules shared with a specific team
 */
export async function getTeamSchedules(teamId: string): Promise<WorkSchedule[]> {
  try {
    const schedulesRef = collection(db, 'workSchedules');
    const q = query(schedulesRef, where('sharedWithTeams', 'array-contains', teamId));
    const snapshot = await getDocs(q);

    const schedules = snapshot.docs.map(doc =>
      docToWorkSchedule(doc.data() as WorkScheduleDoc)
    );

    console.log(`✅ Fetched ${schedules.length} schedules for team ${teamId}`);
    return schedules;
  } catch (error) {
    console.error('Failed to get team schedules:', error);
    throw new Error(`Failed to get team schedules: ${getErrorMessage(error)}`);
  }
}

/**
 * Subscribe to all work schedules shared with a team
 */
export function subscribeToTeamSchedules(
  teamId: string,
  callback: (schedules: WorkSchedule[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const schedulesRef = collection(db, 'workSchedules');
  const q = query(schedulesRef, where('sharedWithTeams', 'array-contains', teamId));

  return onSnapshot(
    q,
    (snapshot) => {
      const schedules = snapshot.docs.map(doc =>
        docToWorkSchedule(doc.data() as WorkScheduleDoc)
      );
      callback(schedules);
    },
    (error) => {
      console.error('Error in team schedules subscription:', error);
      onError?.(error);
    }
  );
}

/**
 * Add a time block to a user's schedule
 */
export async function addTimeBlock(
  userId: string,
  blockData: TimeBlockFormData
): Promise<TimeBlock> {
  try {
    const scheduleRef = getScheduleDoc(userId);
    const snapshot = await getDoc(scheduleRef);

    if (!snapshot.exists()) {
      throw new Error('Work schedule not found. Please create a schedule first.');
    }

    const schedule = snapshot.data() as WorkScheduleDoc;
    const newBlock: TimeBlock = {
      id: generateBlockId(),
      ...blockData,
    };

    const updatedBlocks = [...(schedule.weeklyBlocks || []), newBlock];

    await updateDoc(scheduleRef, {
      weeklyBlocks: updatedBlocks,
      updatedAt: Timestamp.now(),
    });

    console.log(`✅ Added time block: ${blockData.activity}`);
    return newBlock;
  } catch (error) {
    console.error('Failed to add time block:', error);
    throw new Error(`Failed to add time block: ${getErrorMessage(error)}`);
  }
}

/**
 * Add multiple time blocks to a user's schedule (atomic operation)
 * Use this when adding the same activity to multiple days
 */
export async function addTimeBlocks(
  userId: string,
  blocksData: TimeBlockFormData[]
): Promise<TimeBlock[]> {
  try {
    const scheduleRef = getScheduleDoc(userId);
    const snapshot = await getDoc(scheduleRef);

    if (!snapshot.exists()) {
      throw new Error('Work schedule not found. Please create a schedule first.');
    }

    const schedule = snapshot.data() as WorkScheduleDoc;

    // Create all new blocks with unique IDs
    const newBlocks: TimeBlock[] = blocksData.map(blockData => ({
      id: generateBlockId(),
      ...blockData,
    }));

    const updatedBlocks = [...(schedule.weeklyBlocks || []), ...newBlocks];

    await updateDoc(scheduleRef, {
      weeklyBlocks: updatedBlocks,
      updatedAt: Timestamp.now(),
    });

    console.log(`✅ Added ${newBlocks.length} time blocks: ${blocksData[0]?.activity}`);
    return newBlocks;
  } catch (error) {
    console.error('Failed to add time blocks:', error);
    throw new Error(`Failed to add time blocks: ${getErrorMessage(error)}`);
  }
}

/**
 * Update a time block
 */
export async function updateTimeBlock(
  userId: string,
  blockId: string,
  updates: Partial<TimeBlockFormData>
): Promise<void> {
  try {
    const scheduleRef = getScheduleDoc(userId);
    const snapshot = await getDoc(scheduleRef);

    if (!snapshot.exists()) {
      throw new Error('Work schedule not found');
    }

    const schedule = snapshot.data() as WorkScheduleDoc;
    const updatedBlocks = (schedule.weeklyBlocks || []).map(block =>
      block.id === blockId ? { ...block, ...updates } : block
    );

    await updateDoc(scheduleRef, {
      weeklyBlocks: updatedBlocks,
      updatedAt: Timestamp.now(),
    });

    console.log(`✅ Updated time block ${blockId}`);
  } catch (error) {
    console.error('Failed to update time block:', error);
    throw new Error(`Failed to update time block: ${getErrorMessage(error)}`);
  }
}

/**
 * Delete a time block
 */
export async function deleteTimeBlock(
  userId: string,
  blockId: string
): Promise<void> {
  try {
    const scheduleRef = getScheduleDoc(userId);
    const snapshot = await getDoc(scheduleRef);

    if (!snapshot.exists()) {
      throw new Error('Work schedule not found');
    }

    const schedule = snapshot.data() as WorkScheduleDoc;
    const updatedBlocks = (schedule.weeklyBlocks || []).filter(
      block => block.id !== blockId
    );

    await updateDoc(scheduleRef, {
      weeklyBlocks: updatedBlocks,
      updatedAt: Timestamp.now(),
    });

    console.log(`✅ Deleted time block ${blockId}`);
  } catch (error) {
    console.error('Failed to delete time block:', error);
    throw new Error(`Failed to delete time block: ${getErrorMessage(error)}`);
  }
}

/**
 * Update sharing settings for a schedule
 */
export async function updateScheduleSharing(
  userId: string,
  sharedWithTeams: string[]
): Promise<void> {
  try {
    const scheduleRef = getScheduleDoc(userId);

    await updateDoc(scheduleRef, {
      sharedWithTeams,
      updatedAt: Timestamp.now(),
    });

    console.log(`✅ Updated sharing for ${sharedWithTeams.length} teams`);
  } catch (error) {
    console.error('Failed to update schedule sharing:', error);
    throw new Error(`Failed to update schedule sharing: ${getErrorMessage(error)}`);
  }
}

/**
 * Update timezone for a schedule
 */
export async function updateScheduleTimezone(
  userId: string,
  timezone: string
): Promise<void> {
  try {
    const scheduleRef = getScheduleDoc(userId);

    await updateDoc(scheduleRef, {
      timezone,
      updatedAt: Timestamp.now(),
    });

    console.log(`✅ Updated timezone to ${timezone}`);
  } catch (error) {
    console.error('Failed to update timezone:', error);
    throw new Error(`Failed to update timezone: ${getErrorMessage(error)}`);
  }
}

/**
 * Delete a user's entire work schedule
 */
export async function deleteWorkSchedule(userId: string): Promise<void> {
  try {
    const scheduleRef = getScheduleDoc(userId);
    await deleteDoc(scheduleRef);

    console.log(`✅ Deleted work schedule for user ${userId}`);
  } catch (error) {
    console.error('Failed to delete work schedule:', error);
    throw new Error(`Failed to delete work schedule: ${getErrorMessage(error)}`);
  }
}

/**
 * Copy time blocks from one day to another
 */
export async function copyBlocksToDay(
  userId: string,
  fromDay: number,
  toDay: number
): Promise<void> {
  try {
    const scheduleRef = getScheduleDoc(userId);
    const snapshot = await getDoc(scheduleRef);

    if (!snapshot.exists()) {
      throw new Error('Work schedule not found');
    }

    const schedule = snapshot.data() as WorkScheduleDoc;
    const blocksFromDay = (schedule.weeklyBlocks || []).filter(
      block => block.dayOfWeek === fromDay
    );

    const newBlocks: TimeBlock[] = blocksFromDay.map(block => ({
      ...block,
      id: generateBlockId(),
      dayOfWeek: toDay as any,
    }));

    const updatedBlocks = [...(schedule.weeklyBlocks || []), ...newBlocks];

    await updateDoc(scheduleRef, {
      weeklyBlocks: updatedBlocks,
      updatedAt: Timestamp.now(),
    });

    console.log(`✅ Copied ${newBlocks.length} blocks from day ${fromDay} to day ${toDay}`);
  } catch (error) {
    console.error('Failed to copy blocks:', error);
    throw new Error(`Failed to copy blocks: ${getErrorMessage(error)}`);
  }
}

/**
 * Clear all blocks from a specific day
 */
export async function clearDayBlocks(
  userId: string,
  dayOfWeek: number
): Promise<void> {
  try {
    const scheduleRef = getScheduleDoc(userId);
    const snapshot = await getDoc(scheduleRef);

    if (!snapshot.exists()) {
      throw new Error('Work schedule not found');
    }

    const schedule = snapshot.data() as WorkScheduleDoc;
    const updatedBlocks = (schedule.weeklyBlocks || []).filter(
      block => block.dayOfWeek !== dayOfWeek
    );

    await updateDoc(scheduleRef, {
      weeklyBlocks: updatedBlocks,
      updatedAt: Timestamp.now(),
    });

    console.log(`✅ Cleared all blocks from day ${dayOfWeek}`);
  } catch (error) {
    console.error('Failed to clear day blocks:', error);
    throw new Error(`Failed to clear day blocks: ${getErrorMessage(error)}`);
  }
}

/**
 * Add a custom color to user's saved colors (max 8)
 */
export async function addCustomColor(
  userId: string,
  color: string
): Promise<string[]> {
  try {
    const scheduleRef = getScheduleDoc(userId);
    const snapshot = await getDoc(scheduleRef);

    if (!snapshot.exists()) {
      throw new Error('Work schedule not found');
    }

    const schedule = snapshot.data() as WorkScheduleDoc;
    const currentColors = schedule.customColors || [];

    // Check if color already exists
    if (currentColors.includes(color)) {
      return currentColors;
    }

    // Limit to 8 custom colors
    const updatedColors = [...currentColors, color].slice(-8);

    await updateDoc(scheduleRef, {
      customColors: updatedColors,
      updatedAt: Timestamp.now(),
    });

    console.log(`✅ Added custom color: ${color}`);
    return updatedColors;
  } catch (error) {
    console.error('Failed to add custom color:', error);
    throw new Error(`Failed to add custom color: ${getErrorMessage(error)}`);
  }
}

/**
 * Remove a custom color from user's saved colors
 */
export async function removeCustomColor(
  userId: string,
  color: string
): Promise<string[]> {
  try {
    const scheduleRef = getScheduleDoc(userId);
    const snapshot = await getDoc(scheduleRef);

    if (!snapshot.exists()) {
      throw new Error('Work schedule not found');
    }

    const schedule = snapshot.data() as WorkScheduleDoc;
    const currentColors = schedule.customColors || [];
    const updatedColors = currentColors.filter(c => c !== color);

    await updateDoc(scheduleRef, {
      customColors: updatedColors,
      updatedAt: Timestamp.now(),
    });

    console.log(`✅ Removed custom color: ${color}`);
    return updatedColors;
  } catch (error) {
    console.error('Failed to remove custom color:', error);
    throw new Error(`Failed to remove custom color: ${getErrorMessage(error)}`);
  }
}
