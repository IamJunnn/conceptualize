/**
 * Storage Tracking Service
 * Tracks storage usage for teams and enforces limits
 */

import { ref, listAll, getMetadata } from 'firebase/storage';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { storage, db } from './firebase';
import {
  StorageUsage,
  STORAGE_LIMITS,
  formatBytes,
  getStorageStatus,
  getStoragePermissions,
  calculateMonthlyPrice,
} from './billingTypes';

// Cache storage calculations for 5 minutes
const CACHE_DURATION_MS = 5 * 60 * 1000;
const storageCache = new Map<string, { usage: StorageUsage; timestamp: number }>();

/**
 * Calculate total storage used by a team in Firebase Storage
 */
export async function calculateTeamStorageUsage(teamId: string): Promise<number> {
  try {
    console.log(`📊 Calculating storage for team: ${teamId}`);

    const teamStorageRef = ref(storage, `teams/${teamId}`);
    let totalBytes = 0;

    // Recursively calculate all files
    async function calculateFolderSize(folderRef: any): Promise<number> {
      let size = 0;

      try {
        const result = await listAll(folderRef);

        // Add file sizes
        for (const itemRef of result.items) {
          try {
            const metadata = await getMetadata(itemRef);
            size += metadata.size || 0;
          } catch (err) {
            console.warn(`Could not get metadata for ${itemRef.fullPath}:`, err);
          }
        }

        // Recurse into subfolders
        for (const prefixRef of result.prefixes) {
          size += await calculateFolderSize(prefixRef);
        }
      } catch (err) {
        console.warn(`Could not list folder ${folderRef.fullPath}:`, err);
      }

      return size;
    }

    totalBytes = await calculateFolderSize(teamStorageRef);
    console.log(`✅ Team ${teamId} storage: ${formatBytes(totalBytes)}`);

    return totalBytes;
  } catch (error) {
    console.error('Error calculating team storage:', error);
    return 0;
  }
}

/**
 * Get team member count from Firestore
 */
export async function getTeamMemberCount(teamId: string): Promise<number> {
  try {
    const teamDoc = await getDoc(doc(db, 'teams', teamId));
    if (!teamDoc.exists()) {
      return 1; // Default to 1 (owner)
    }

    const data = teamDoc.data();
    // memberEmails array contains all accepted members
    return data.memberEmails?.length || 1;
  } catch (error) {
    console.error('Error getting team member count:', error);
    return 1;
  }
}

// Internal domains that get automatic pro access
const INTERNAL_PRO_DOMAINS = ['ecoblox.build'];

/**
 * Check if an email belongs to an internal domain that gets auto pro access
 */
function isInternalProEmail(email: string): boolean {
  if (!email) return false;
  const domain = email.toLowerCase().split('@')[1];
  return INTERNAL_PRO_DOMAINS.includes(domain);
}

/**
 * Check if team has active paid subscription or promo/trial
 */
export async function isTeamPaid(teamId: string): Promise<boolean> {
  try {
    const teamDoc = await getDoc(doc(db, 'teams', teamId));
    if (!teamDoc.exists()) {
      return false;
    }

    const data = teamDoc.data();

    // Check if team owner has internal domain (auto-pro)
    const ownerEmail = data.createdBy;
    if (isInternalProEmail(ownerEmail)) {
      return true;
    }

    // Check for active subscription
    const subscriptionStatus = data.billing?.subscription?.status;
    if (subscriptionStatus === 'active') {
      return true;
    }

    // Check for active promo/trial
    const promoActive = data.billing?.promoActive;
    const promoExpiresAt = data.billing?.promoExpiresAt;
    if (promoActive && promoExpiresAt) {
      const expiresAt = promoExpiresAt?.toDate?.() || new Date(promoExpiresAt);
      if (new Date() < expiresAt) {
        return true; // Promo/trial is still active
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking team subscription:', error);
    return false;
  }
}

/**
 * Get comprehensive storage usage info for a team
 */
export async function getTeamStorageUsage(teamId: string, forceRefresh = false): Promise<StorageUsage> {
  // Check cache first
  const cached = storageCache.get(teamId);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
    console.log(`📦 Using cached storage data for team ${teamId}`);
    return cached.usage;
  }

  console.log(`🔄 Fetching fresh storage data for team ${teamId}`);

  // Get current data
  const [usedBytes, memberCount, isPaid] = await Promise.all([
    calculateTeamStorageUsage(teamId),
    getTeamMemberCount(teamId),
    isTeamPaid(teamId),
  ]);

  const limitBytes = isPaid ? STORAGE_LIMITS.PAID_TIER : STORAGE_LIMITS.FREE_TIER;
  const percentUsed = Math.round((usedBytes / limitBytes) * 100);
  const status = getStorageStatus(usedBytes, isPaid);
  const permissions = getStoragePermissions(status, isPaid);

  const usage: StorageUsage = {
    usedBytes,
    limitBytes,
    percentUsed: Math.min(percentUsed, 999), // Cap display at 999%
    status,
    permissions,
    usedFormatted: formatBytes(usedBytes),
    limitFormatted: formatBytes(limitBytes),
    requiresUpgrade: status === 'exceeded' && !isPaid,
    monthlyPrice: calculateMonthlyPrice(memberCount),
    memberCount,
  };

  // Update cache
  storageCache.set(teamId, { usage, timestamp: Date.now() });

  // Update Firestore with latest calculation
  try {
    await updateDoc(doc(db, 'teams', teamId), {
      'billing.storageUsedBytes': usedBytes,
      'billing.memberCount': memberCount,
      'billing.lastStorageCalculation': Timestamp.now(),
      'billing.monthlyPriceCents': Math.round(calculateMonthlyPrice(memberCount) * 100),
    });
  } catch (err) {
    console.warn('Could not update storage info in Firestore:', err);
  }

  return usage;
}

/**
 * Quick check if user can perform storage-increasing action
 * Uses cached data for speed, falls back to fresh calculation
 */
export async function canIncreaseStorage(teamId: string): Promise<boolean> {
  const usage = await getTeamStorageUsage(teamId);
  return usage.permissions.canCreateNotes;
}

/**
 * Check if a specific operation is allowed based on size
 */
export async function canUploadFile(teamId: string, fileSizeBytes: number): Promise<{
  allowed: boolean;
  reason?: string;
  currentUsage?: StorageUsage;
}> {
  const usage = await getTeamStorageUsage(teamId);

  if (!usage.permissions.canUploadFiles) {
    return {
      allowed: false,
      reason: `Storage limit exceeded. You're using ${usage.usedFormatted} of ${usage.limitFormatted}. Delete files or upgrade to continue.`,
      currentUsage: usage,
    };
  }

  // Check if this specific upload would exceed the limit
  const isPaid = await isTeamPaid(teamId);
  const limit = isPaid ? STORAGE_LIMITS.PAID_TIER : STORAGE_LIMITS.FREE_TIER;
  const projectedUsage = usage.usedBytes + fileSizeBytes;

  if (projectedUsage > limit) {
    return {
      allowed: false,
      reason: `This file (${formatBytes(fileSizeBytes)}) would exceed your storage limit. You have ${formatBytes(limit - usage.usedBytes)} remaining.`,
      currentUsage: usage,
    };
  }

  return { allowed: true, currentUsage: usage };
}

/**
 * Invalidate cache for a team (call after file operations)
 */
export function invalidateStorageCache(teamId: string): void {
  storageCache.delete(teamId);
  console.log(`🗑️ Invalidated storage cache for team ${teamId}`);
}

/**
 * Clear all storage caches
 */
export function clearAllStorageCache(): void {
  storageCache.clear();
  console.log('🗑️ Cleared all storage caches');
}
