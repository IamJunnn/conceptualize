/**
 * Billing Service
 * Handles Stripe integration for subscription management
 */

import { doc, getDoc, updateDoc, setDoc, onSnapshot, Timestamp, collection } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from './firebase';
import {
  STORAGE_LIMITS,
  calculateMonthlyPrice,
  calculateCloudStorageLimit,
  getChatStorageLimit,
  canUploadToChat,
  SubscriptionStatus,
  TeamBilling,
} from './billingTypes';
import { getTeamMemberCount } from './storageTrackingService';
import { getPromoStatusFromBilling, getPromoAwareStatus } from './promoService';
import type { PromoAwareStatus, ActivePromoInfo } from './promoTypes';
import { getErrorMessage } from '../utils/errorUtils';

// Stripe price ID for the per-member subscription
// Set VITE_STRIPE_PRICE_ID in your .env file (create price at https://dashboard.stripe.com/prices)
const STRIPE_PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_ID || 'price_your_price_id';

/**
 * Initialize team billing record if it doesn't exist
 */
export async function initializeTeamBilling(
  teamId: string,
  ownerId: string,
  ownerEmail: string
): Promise<void> {
  try {
    const teamDoc = await getDoc(doc(db, 'teams', teamId));
    if (!teamDoc.exists()) {
      throw new Error('Team not found');
    }

    const data = teamDoc.data();

    // Skip if billing already initialized
    if (data.billing?.ownerId) {
      return;
    }

    const memberCount = data.memberEmails?.length || 1;

    await updateDoc(doc(db, 'teams', teamId), {
      billing: {
        memberCount,
        storageUsedBytes: 0,
        chatStorageUsedBytes: 0,
        cloudStorageLimitBytes: STORAGE_LIMITS.FREE_CLOUD_STORAGE,
        chatStorageLimitBytes: 0, // No chat for free tier
        lastStorageCalculation: Timestamp.now(),
        subscription: {
          status: 'free' as SubscriptionStatus,
        },
        ownerId,
        ownerEmail,
        monthlyPriceCents: Math.round(calculateMonthlyPrice(memberCount) * 100),
      },
    });
  } catch (error) {
    console.error('Error initializing team billing:', error);
    throw error;
  }
}

/**
 * Helper to convert Firestore Timestamp or milliseconds to Date
 */
function toDate(value: any): Date | undefined {
  if (!value) return undefined;
  // If it's a Firestore Timestamp with toDate method
  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }
  // If it's already a Date
  if (value instanceof Date) {
    return value;
  }
  // If it's a number (milliseconds)
  if (typeof value === 'number') {
    return new Date(value);
  }
  // If it's an object with seconds (Firestore Timestamp structure)
  if (value?.seconds) {
    return new Date(value.seconds * 1000);
  }
  return undefined;
}

/**
 * Get team billing info
 */
export async function getTeamBilling(teamId: string): Promise<TeamBilling | null> {
  try {
    const teamDoc = await getDoc(doc(db, 'teams', teamId));
    if (!teamDoc.exists()) {
      return null;
    }

    const data = teamDoc.data();
    if (!data.billing) {
      return null;
    }

    return {
      ...data.billing,
      lastStorageCalculation: toDate(data.billing.lastStorageCalculation),
      subscription: {
        ...data.billing.subscription,
        currentPeriodStart: toDate(data.billing.subscription?.currentPeriodStart),
        currentPeriodEnd: toDate(data.billing.subscription?.currentPeriodEnd),
      },
    } as TeamBilling;
  } catch (error) {
    console.error('Error getting team billing:', error);
    return null;
  }
}

/**
 * Create Stripe checkout session for team subscription
 * Uses Firestore trigger approach to bypass IAM/CORS issues with callable functions
 *
 * Flow:
 * 1. Write checkout request to Firestore
 * 2. Cloud Function (processCheckoutRequest) creates Stripe session
 * 3. Function updates document with session URL
 * 4. We listen for the update and return the URL
 */
export async function createCheckoutSession(
  teamId: string,
  successUrl?: string,
  cancelUrl?: string
): Promise<string> {
  const memberCount = await getTeamMemberCount(teamId);
  const billing = await getTeamBilling(teamId);

  if (!billing) {
    throw new Error('Team billing not initialized');
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }

  // Create a unique request ID
  const requestId = `${teamId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const requestRef = doc(db, 'checkoutRequests', requestId);

  // Write the checkout request to Firestore
  await setDoc(requestRef, {
    teamId,
    memberCount,
    customerEmail: billing.ownerEmail,
    successUrl: successUrl || `${window.location.origin}/?team=${teamId}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: cancelUrl || `${window.location.origin}/?team=${teamId}&canceled=true`,
    requestedBy: user.uid,
    requestedAt: Timestamp.now(),
    status: 'pending',
    metadata: {
      teamId,
      memberCount: memberCount.toString(),
    },
  });

  console.log('📝 Created checkout request:', requestId);

  // Wait for the Cloud Function to process the request
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Checkout request timed out. Please try again.'));
    }, 30000); // 30 second timeout

    const unsubscribe = onSnapshot(requestRef, (snapshot) => {
      const data = snapshot.data();

      if (!data) return;

      if (data.status === 'completed' && data.sessionUrl) {
        clearTimeout(timeout);
        unsubscribe();
        console.log('✅ Checkout session created:', data.sessionId);
        resolve(data.sessionUrl);
      } else if (data.status === 'error') {
        clearTimeout(timeout);
        unsubscribe();
        console.error('❌ Checkout request failed:', data.error);
        reject(new Error(data.error || 'Failed to create checkout session'));
      }
    }, (error) => {
      clearTimeout(timeout);
      unsubscribe();
      console.error('❌ Error listening to checkout request:', error);
      reject(error);
    });
  });
}

/**
 * Create Stripe customer portal session for managing subscription
 */
export async function createPortalSession(teamId: string): Promise<string> {
  try {
    const billing = await getTeamBilling(teamId);

    if (!billing?.subscription?.stripeCustomerId) {
      throw new Error('No active subscription found');
    }

    // Call Cloud Function to create portal session
    const createPortal = httpsCallable(functions, 'createStripePortal');
    const result = await createPortal({
      customerId: billing.subscription.stripeCustomerId,
      returnUrl: `${window.location.origin}/settings?team=${teamId}`,
    });

    const { portalUrl } = result.data as { portalUrl: string };
    return portalUrl;
  } catch (error) {
    console.error('Error creating portal session:', error);
    throw error;
  }
}

/**
 * Update subscription quantity when team member count changes
 */
export async function updateSubscriptionQuantity(teamId: string): Promise<void> {
  try {
    const billing = await getTeamBilling(teamId);

    if (!billing?.subscription?.stripeSubscriptionId) {
      return;
    }

    const memberCount = await getTeamMemberCount(teamId);

    // Call Cloud Function to update subscription
    const updateSubscription = httpsCallable(functions, 'updateStripeSubscription');
    await updateSubscription({
      subscriptionId: billing.subscription.stripeSubscriptionId,
      quantity: memberCount,
    });

    // Update local record
    await updateDoc(doc(db, 'teams', teamId), {
      'billing.memberCount': memberCount,
      'billing.monthlyPriceCents': Math.round(calculateMonthlyPrice(memberCount) * 100),
    });
  } catch (error) {
    console.error('Error updating subscription quantity:', error);
    throw error;
  }
}

/**
 * Cancel team subscription
 */
export async function cancelSubscription(teamId: string, immediately = false): Promise<void> {
  try {
    const billing = await getTeamBilling(teamId);

    if (!billing?.subscription?.stripeSubscriptionId) {
      throw new Error('No active subscription found');
    }

    // Call Cloud Function to cancel subscription
    const cancelSub = httpsCallable(functions, 'cancelStripeSubscription');
    await cancelSub({
      subscriptionId: billing.subscription.stripeSubscriptionId,
      immediately,
    });

    // Update local record
    await updateDoc(doc(db, 'teams', teamId), {
      'billing.subscription.cancelAtPeriodEnd': !immediately,
      'billing.subscription.status': immediately ? 'canceled' : 'active',
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw error;
  }
}

/**
 * Check if user needs to see upgrade prompt
 * Now promo-aware: won't show if team has active promo
 */
export async function shouldShowUpgradePrompt(teamId: string): Promise<{
  show: boolean;
  reason?: string;
  price?: number;
  memberCount?: number;
  promoInfo?: ActivePromoInfo;
  isReadOnly?: boolean;
}> {
  try {
    const billing = await getTeamBilling(teamId);

    if (!billing) {
      return { show: false };
    }

    // Already paying via subscription
    if (billing.subscription?.status === 'active') {
      return { show: false };
    }

    // Check for active promo
    const promoInfo = await getPromoStatusFromBilling(teamId);
    if (promoInfo) {
      // Has active promo - don't show upgrade prompt, but maybe show expiry warning
      if (promoInfo.isExpiringSoon) {
        return {
          show: true,
          reason: 'promo_expiring',
          price: calculateMonthlyPrice(billing.memberCount),
          memberCount: billing.memberCount,
          promoInfo,
        };
      }
      return { show: false, promoInfo };
    }

    const { STORAGE_LIMITS } = await import('./billingTypes');

    // Check if over free limit - this means READ-ONLY mode
    if (billing.storageUsedBytes > STORAGE_LIMITS.FREE_TIER) {
      return {
        show: true,
        reason: 'storage_exceeded',
        price: calculateMonthlyPrice(billing.memberCount),
        memberCount: billing.memberCount,
        isReadOnly: true,
      };
    }

    // Show warning at 80%
    const percentUsed = (billing.storageUsedBytes / STORAGE_LIMITS.FREE_TIER) * 100;
    if (percentUsed >= 80) {
      return {
        show: true,
        reason: 'storage_warning',
        price: calculateMonthlyPrice(billing.memberCount),
        memberCount: billing.memberCount,
      };
    }

    return { show: false };
  } catch (error) {
    console.error('Error checking upgrade prompt:', error);
    return { show: false };
  }
}

/**
 * Format price for display
 */
export function formatPrice(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Get subscription status text
 */
export function getSubscriptionStatusText(status: SubscriptionStatus): string {
  switch (status) {
    case 'free':
      return 'Free Plan';
    case 'active':
      return 'Pro Plan (Active)';
    case 'past_due':
      return 'Payment Failed';
    case 'canceled':
      return 'Canceled';
    case 'requires_payment':
      return 'Upgrade Required';
    default:
      return 'Unknown';
  }
}

/**
 * Sync subscription status from Stripe
 * Call this when the app loads to ensure Firestore is in sync
 */
export async function syncSubscriptionStatus(teamId: string): Promise<{
  status: SubscriptionStatus;
  synced: boolean;
}> {
  try {
    const syncStatus = httpsCallable(functions, 'syncSubscriptionStatus');
    const result = await syncStatus({ teamId });
    const data = result.data as {
      status: string;
      synced: boolean;
      subscriptionId?: string;
      currentPeriodEnd?: number;
      cancelAtPeriodEnd?: boolean;
    };

    return {
      status: data.status as SubscriptionStatus,
      synced: data.synced,
    };
  } catch (error) {
    console.error('Error syncing subscription status:', error);
    // Return current status from Firestore as fallback
    const billing = await getTeamBilling(teamId);
    return {
      status: billing?.subscription?.status || 'free',
      synced: false,
    };
  }
}

/**
 * Verify checkout session after redirect from Stripe
 * Call this on the success URL page
 *
 * Uses Firestore trigger approach to bypass IAM/CORS issues:
 * 1. Write verification request to Firestore
 * 2. Cloud Function trigger processes it and updates billing
 * 3. Listen for response via onSnapshot
 */
export async function verifyCheckoutSession(
  sessionId: string,
  teamId: string
): Promise<{ success: boolean; status?: SubscriptionStatus; error?: string }> {
  const user = auth.currentUser;
  if (!user) {
    return { success: false, error: 'User not authenticated' };
  }

  try {
    // Generate unique request ID
    const requestId = `${teamId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const requestRef = doc(db, 'verifyCheckoutRequests', requestId);

    console.log('Creating verify checkout request:', { requestId, sessionId, teamId });

    // Write the verification request to Firestore
    await setDoc(requestRef, {
      sessionId,
      teamId,
      requestedBy: user.uid,
      requestedAt: Timestamp.now(),
      status: 'pending',
    });

    // Listen for the Cloud Function to process the request
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        console.error('Verify checkout request timed out');
        resolve({ success: false, error: 'Verification request timed out' });
      }, 30000); // 30 second timeout

      const unsubscribe = onSnapshot(requestRef, (snapshot) => {
        const data = snapshot.data();
        if (!data) return;

        console.log('Verify checkout request update:', data);

        if (data.status === 'completed') {
          clearTimeout(timeout);
          unsubscribe();
          resolve({
            success: true,
            status: data.subscriptionStatus as SubscriptionStatus,
          });
        } else if (data.status === 'error') {
          clearTimeout(timeout);
          unsubscribe();
          resolve({
            success: false,
            error: data.error || 'Verification failed',
          });
        }
        // Still pending, keep listening
      }, (error) => {
        clearTimeout(timeout);
        unsubscribe();
        console.error('Snapshot error:', error);
        resolve({ success: false, error: getErrorMessage(error) });
      });
    });
  } catch (error) {
    console.error('Error verifying checkout session:', error);
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Handle payment redirect (success or canceled)
 * Extract session_id from URL and verify the checkout
 */
export async function handlePaymentSuccess(teamId: string): Promise<boolean> {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id');
  const canceled = urlParams.get('canceled');

  // Clean up URL parameters
  const cleanUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('session_id');
    url.searchParams.delete('canceled');
    window.history.replaceState({}, '', url.toString());
  };

  // Handle canceled checkout
  if (canceled) {
    cleanUrl();
    return false;
  }

  if (!sessionId) {
    // Still sync to check current status
    await syncSubscriptionStatus(teamId);
    return false;
  }

  const result = await verifyCheckoutSession(sessionId, teamId);
  cleanUrl();

  return result.success;
}

/**
 * Check if team can access chat feature (paid feature)
 * Now promo-aware: returns true if team has active promo OR active subscription
 */
export async function canAccessChat(teamId: string): Promise<boolean> {
  try {
    const billing = await getTeamBilling(teamId);
    if (!billing) {
      return false;
    }

    // Check subscription first
    if (billing.subscription?.status === 'active') {
      return true;
    }

    // Check for active promo
    const promoInfo = await getPromoStatusFromBilling(teamId);
    return promoInfo !== null;
  } catch (error) {
    console.error('Error checking chat access:', error);
    return false;
  }
}

/**
 * Check if team can upload files in chat (paid feature)
 * Now promo-aware
 */
export async function canUploadFiles(teamId: string): Promise<boolean> {
  // Same as chat access - promo-aware
  return canAccessChat(teamId);
}

/**
 * Check if team has paid access (subscription OR active promo)
 * Use this for feature gating
 */
export async function hasPaidAccess(teamId: string): Promise<boolean> {
  return canAccessChat(teamId);
}

/**
 * Get full promo-aware status for a team
 * Returns combined promo + subscription status for UI display
 */
export async function getFullBillingStatus(teamId: string): Promise<PromoAwareStatus> {
  const billing = await getTeamBilling(teamId);
  const subscriptionStatus = billing?.subscription?.status || 'free';
  const storageUsedBytes = billing?.storageUsedBytes || 0;

  return getPromoAwareStatus(teamId, subscriptionStatus, storageUsedBytes);
}

/**
 * Get file size limit for team (15MB for paid, 0 for free)
 */
export async function getFileSizeLimit(teamId: string): Promise<number> {
  const hasAccess = await canAccessChat(teamId);
  return hasAccess ? STORAGE_LIMITS.MAX_FILE_SIZE : 0; // 15MB for paid, 0 for free
}

/**
 * Check if files can be uploaded to chat (per-message limit check)
 * @param teamId - The team ID
 * @param files - Array of files to upload in this message
 */
export async function checkChatUploadAllowed(
  teamId: string,
  files: File[]
): Promise<{ canUpload: boolean; reason?: string }> {
  try {
    // Use promo-aware status which includes partnership/promo + subscription
    const status = await getFullBillingStatus(teamId);
    const isPaid = status.isPaid; // true if subscription OR active promo/partnership

    return canUploadToChat(files, isPaid);
  } catch (error) {
    console.error('Error checking chat upload:', error);
    return { canUpload: false, reason: 'Unable to verify upload. Please try again.' };
  }
}

/**
 * Update storage limits when subscription changes
 * Now promo-aware: considers both subscription and partnership/promo status
 */
export async function updateStorageLimits(teamId: string): Promise<void> {
  try {
    const billing = await getTeamBilling(teamId);
    if (!billing) return;

    // Use promo-aware status
    const status = await getFullBillingStatus(teamId);
    const isPaid = status.isPaid; // true if subscription OR active promo/partnership
    const memberCount = billing.memberCount || 1;

    const cloudStorageLimitBytes = calculateCloudStorageLimit(isPaid, memberCount);
    const chatStorageLimitBytes = getChatStorageLimit(isPaid);

    await updateDoc(doc(db, 'teams', teamId), {
      'billing.cloudStorageLimitBytes': cloudStorageLimitBytes,
      'billing.chatStorageLimitBytes': chatStorageLimitBytes,
    });
  } catch (error) {
    console.error('Error updating storage limits:', error);
    throw error;
  }
}
