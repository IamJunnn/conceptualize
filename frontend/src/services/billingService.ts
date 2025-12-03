/**
 * Billing Service
 * Handles Stripe integration for subscription management
 */

import { doc, getDoc, updateDoc, setDoc, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import {
  PRICING,
  calculateMonthlyPrice,
  SubscriptionStatus,
  TeamBilling,
} from './billingTypes';
import { getTeamMemberCount } from './storageTrackingService';

// Stripe publishable key (safe to expose in frontend)
// TODO: Replace with your actual Stripe publishable key
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_your_key_here';

// Stripe price ID for the per-member subscription
// TODO: Create this in Stripe Dashboard and add here
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
      console.log('Team billing already initialized');
      return;
    }

    const memberCount = data.memberEmails?.length || 1;

    await updateDoc(doc(db, 'teams', teamId), {
      billing: {
        memberCount,
        storageUsedBytes: 0,
        lastStorageCalculation: Timestamp.now(),
        subscription: {
          status: 'free' as SubscriptionStatus,
        },
        ownerId,
        ownerEmail,
        monthlyPriceCents: Math.round(calculateMonthlyPrice(memberCount) * 100),
      },
    });

    console.log(`✅ Initialized billing for team ${teamId}`);
  } catch (error) {
    console.error('Error initializing team billing:', error);
    throw error;
  }
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
      lastStorageCalculation: data.billing.lastStorageCalculation?.toDate(),
      subscription: {
        ...data.billing.subscription,
        currentPeriodStart: data.billing.subscription?.currentPeriodStart?.toDate(),
        currentPeriodEnd: data.billing.subscription?.currentPeriodEnd?.toDate(),
      },
    } as TeamBilling;
  } catch (error) {
    console.error('Error getting team billing:', error);
    return null;
  }
}

/**
 * Create Stripe checkout session for team subscription
 * This calls a Firebase Cloud Function that creates the checkout session
 */
export async function createCheckoutSession(
  teamId: string,
  successUrl?: string,
  cancelUrl?: string
): Promise<string> {
  try {
    const memberCount = await getTeamMemberCount(teamId);
    const billing = await getTeamBilling(teamId);

    if (!billing) {
      throw new Error('Team billing not initialized');
    }

    // Call Cloud Function to create checkout session
    // Note: {CHECKOUT_SESSION_ID} is a Stripe placeholder that gets replaced with actual session ID
    const createCheckout = httpsCallable(functions, 'createStripeCheckout');
    const result = await createCheckout({
      teamId,
      memberCount,
      priceId: STRIPE_PRICE_ID,
      successUrl: successUrl || `${window.location.origin}/?team=${teamId}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: cancelUrl || `${window.location.origin}/?team=${teamId}&canceled=true`,
      customerEmail: billing.ownerEmail,
      metadata: {
        teamId,
        memberCount: memberCount.toString(),
      },
    });

    const { sessionUrl } = result.data as { sessionUrl: string };
    return sessionUrl;
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
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
      console.log('No active subscription to update');
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

    console.log(`✅ Updated subscription quantity to ${memberCount} members`);
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

    console.log(`✅ Subscription ${immediately ? 'canceled immediately' : 'set to cancel at period end'}`);
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw error;
  }
}

/**
 * Check if user needs to see upgrade prompt
 */
export async function shouldShowUpgradePrompt(teamId: string): Promise<{
  show: boolean;
  reason?: string;
  price?: number;
  memberCount?: number;
}> {
  try {
    const billing = await getTeamBilling(teamId);

    if (!billing) {
      return { show: false };
    }

    // Already paying
    if (billing.subscription?.status === 'active') {
      return { show: false };
    }

    const { STORAGE_LIMITS } = await import('./billingTypes');

    // Check if over free limit
    if (billing.storageUsedBytes > STORAGE_LIMITS.FREE_TIER) {
      return {
        show: true,
        reason: 'storage_exceeded',
        price: calculateMonthlyPrice(billing.memberCount),
        memberCount: billing.memberCount,
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

    console.log(`✅ Subscription synced for team ${teamId}: ${data.status}`);
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
 */
export async function verifyCheckoutSession(
  sessionId: string,
  teamId: string
): Promise<{ success: boolean; status?: SubscriptionStatus; error?: string }> {
  try {
    const verifyCheckout = httpsCallable(functions, 'verifyCheckoutSession');
    const result = await verifyCheckout({ sessionId, teamId });
    const data = result.data as {
      success: boolean;
      status?: string;
      error?: string;
    };

    if (data.success) {
      console.log(`✅ Checkout verified for team ${teamId}`);
      return {
        success: true,
        status: data.status as SubscriptionStatus,
      };
    } else {
      return {
        success: false,
        error: data.error || 'Unknown error',
      };
    }
  } catch (error: any) {
    console.error('Error verifying checkout session:', error);
    return {
      success: false,
      error: error.message || 'Failed to verify checkout',
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
    console.log('Checkout was canceled');
    cleanUrl();
    return false;
  }

  if (!sessionId) {
    console.log('No session_id found in URL');
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
 */
export async function canAccessChat(teamId: string): Promise<boolean> {
  try {
    const billing = await getTeamBilling(teamId);
    if (!billing) {
      return false;
    }
    return billing.subscription?.status === 'active';
  } catch (error) {
    console.error('Error checking chat access:', error);
    return false;
  }
}

/**
 * Check if team can upload files in chat (paid feature)
 */
export async function canUploadFiles(teamId: string): Promise<boolean> {
  // Same as chat access for now
  return canAccessChat(teamId);
}

/**
 * Get file size limit for team (8MB for paid, 0 for free)
 */
export async function getFileSizeLimit(teamId: string): Promise<number> {
  const hasAccess = await canAccessChat(teamId);
  return hasAccess ? 8 * 1024 * 1024 : 0; // 8MB for paid, 0 for free
}
