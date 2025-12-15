/**
 * Promo Code Service
 * Handles promo code validation, redemption, and partner domain detection
 */

import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, collection, query, where, getDocs, limit, runTransaction, increment, Timestamp, getDocFromServer } from 'firebase/firestore';
import { auth } from './firebase';
import { functions, db } from './firebase';
import {
  PromoValidation,
  PromoRedemption,
  PartnerCheck,
  RedeemPromoResponse,
  ActivePromoInfo,
  PromoAwareStatus,
  getDaysRemaining,
  isPromoExpiringSoon,
  extractDomain,
} from './promoTypes';
import { STORAGE_LIMITS } from './billingTypes';

// Cloud Function references
const checkPartnerDomainFn = httpsCallable<Record<string, never>, PartnerCheck>(functions, 'checkPartnerDomain');
const redeemPartnerPromoFn = httpsCallable<{ teamId: string }, RedeemPromoResponse & { partnerName?: string }>(functions, 'redeemPartnerPromo');
const getActivePromoFn = httpsCallable<{ teamId: string }, { hasActivePromo: boolean; promo?: ActivePromoInfo; expired?: boolean }>(functions, 'getActivePromo');

/**
 * Validate a promo code without redeeming it
 * Reads directly from Firestore (no Cloud Function needed)
 * @param code - The promo code to validate
 * @returns Validation result with code details if valid
 */
export async function validatePromoCode(code: string): Promise<PromoValidation> {
  try {
    if (!code || code.trim().length < 3) {
      return { valid: false, error: 'Please enter a valid promo code' };
    }

    const normalizedCode = code.toUpperCase().trim();

    // Read directly from Firestore (bypass cache)
    const codeDoc = await getDocFromServer(doc(db, 'promoCodes', normalizedCode));

    if (!codeDoc.exists()) {
      return { valid: false, error: 'Invalid promo code' };
    }

    const codeData = codeDoc.data();

    // Check if code is active
    if (!codeData?.isActive) {
      return { valid: false, error: 'This promo code is no longer active' };
    }

    // Check if code has expired
    if (codeData.expiresAt) {
      const expiresAt = codeData.expiresAt?.toDate?.() || new Date(codeData.expiresAt);
      if (new Date() > expiresAt) {
        return { valid: false, error: 'This promo code has expired' };
      }
    }

    // Check if max redemptions reached
    const currentRedemptions = codeData.currentRedemptions || 0;
    const maxRedemptions = codeData.maxRedemptions || 0;
    if (maxRedemptions > 0 && currentRedemptions >= maxRedemptions) {
      return { valid: false, error: 'This promo code has reached its maximum redemptions' };
    }

    // Code is valid!
    return {
      valid: true,
      code: normalizedCode,
      type: codeData.type || 'welcome',
      durationMonths: codeData.durationMonths || 1,
      remainingRedemptions: maxRedemptions > 0 ? maxRedemptions - currentRedemptions : undefined,
    };
  } catch (error: unknown) {
    console.error('Error validating promo code:', error);
    return {
      valid: false,
      error: 'Failed to validate promo code. Please try again.',
    };
  }
}

/**
 * Redeem a promo code for a team
 * Uses Firestore transactions directly (no Cloud Function needed)
 * @param teamId - The team ID to apply the promo to
 * @param code - The promo code to redeem
 * @returns Redemption result
 */
export async function redeemPromoCode(teamId: string, code: string): Promise<RedeemPromoResponse> {
  try {
    const user = auth.currentUser;
    if (!user || !user.email) {
      return { success: false, error: 'Please sign in to use promo codes.' };
    }

    const normalizedCode = code.toUpperCase().trim();

    // Run as a transaction to ensure atomicity
    const result = await runTransaction(db, async (transaction) => {
      // 1. Get the promo code document
      const codeRef = doc(db, 'promoCodes', normalizedCode);
      const codeDoc = await transaction.get(codeRef);

      if (!codeDoc.exists()) {
        throw new Error('Invalid promo code');
      }

      const codeData = codeDoc.data();

      // 2. Validate the code
      if (!codeData?.isActive) {
        throw new Error('This promo code is no longer active');
      }

      if (codeData.expiresAt) {
        const expiresAt = codeData.expiresAt?.toDate?.() || new Date(codeData.expiresAt);
        if (new Date() > expiresAt) {
          throw new Error('This promo code has expired');
        }
      }

      const currentRedemptions = codeData.currentRedemptions || 0;
      const maxRedemptions = codeData.maxRedemptions || 0;
      if (maxRedemptions > 0 && currentRedemptions >= maxRedemptions) {
        throw new Error('This promo code has reached its maximum redemptions');
      }

      // 3. Get the team document
      const teamRef = doc(db, 'teams', teamId);
      const teamDoc = await transaction.get(teamRef);

      if (!teamDoc.exists()) {
        throw new Error('Team not found');
      }

      const teamData = teamDoc.data();

      // 4. Check if team already has an active promo
      if (teamData.billing?.promoActive) {
        const existingExpiry = teamData.billing.promoExpiresAt?.toDate?.() || new Date(teamData.billing.promoExpiresAt);
        if (new Date() < existingExpiry) {
          throw new Error('This team already has an active promo');
        }
      }

      // 5. Calculate promo dates
      const durationMonths = codeData.durationMonths || 1;
      const promoStartDate = new Date();
      const promoExpiresAt = new Date();
      promoExpiresAt.setMonth(promoExpiresAt.getMonth() + durationMonths);

      // 6. Increment the redemption counter
      transaction.update(codeRef, {
        currentRedemptions: increment(1),
      });

      // 7. Create the redemption record
      const redemptionId = `${teamId}_${normalizedCode}_${Date.now()}`;
      const redemptionRef = doc(db, 'promoRedemptions', redemptionId);
      const redemption: Omit<PromoRedemption, 'id'> = {
        type: codeData.type || 'welcome',
        code: normalizedCode,
        domain: null,
        userId: user.uid,
        userEmail: user.email || '',
        teamId,
        teamName: teamData.name || 'Unknown Team',
        redeemedAt: promoStartDate,
        durationMonths,
        promoStartDate,
        promoExpiresAt,
        status: 'active',
      };
      transaction.set(redemptionRef, {
        ...redemption,
        redeemedAt: Timestamp.fromDate(promoStartDate),
        promoStartDate: Timestamp.fromDate(promoStartDate),
        promoExpiresAt: Timestamp.fromDate(promoExpiresAt),
      });

      // 8. Update team billing with promo info
      transaction.update(teamRef, {
        'billing.promoActive': true,
        'billing.promoType': codeData.type || 'welcome',
        'billing.promoCode': normalizedCode,
        'billing.promoStartDate': Timestamp.fromDate(promoStartDate),
        'billing.promoExpiresAt': Timestamp.fromDate(promoExpiresAt),
        'billing.promoDurationMonths': durationMonths,
      });

      return {
        success: true,
        redemption: { ...redemption, id: redemptionId } as PromoRedemption,
      };
    });

    return result;
  } catch (error: unknown) {
    console.error('Error redeeming promo code:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to redeem promo code',
    };
  }
}

/**
 * Check if the current user's email domain is a partner domain
 * @returns Partner check result
 */
export async function checkPartnerDomain(): Promise<PartnerCheck> {
  try {
    const result = await checkPartnerDomainFn({});
    return result.data;
  } catch (error: unknown) {
    console.error('Error checking partner domain:', error);
    return {
      isPartner: false,
    };
  }
}

/**
 * Redeem a partner promo for a team (auto-applied for partner domains)
 * @param teamId - The team ID to apply the promo to
 * @returns Redemption result with partner name
 */
export async function redeemPartnerPromo(teamId: string): Promise<RedeemPromoResponse & { partnerName?: string }> {
  try {
    const result = await redeemPartnerPromoFn({ teamId });
    return result.data;
  } catch (error: unknown) {
    console.error('Error redeeming partner promo:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to redeem partner promo',
    };
  }
}

/**
 * Get active promo for a team
 * @param teamId - The team ID to check
 * @returns Active promo info if one exists
 */
export async function getActivePromo(teamId: string): Promise<ActivePromoInfo | null> {
  try {
    const result = await getActivePromoFn({ teamId });

    if (result.data.hasActivePromo && result.data.promo) {
      return result.data.promo;
    }

    return null;
  } catch (error: unknown) {
    console.error('Error getting active promo:', error);
    return null;
  }
}

/**
 * Check promo status from local Firestore (faster, cached)
 * Use this for quick checks; use getActivePromo for authoritative status
 * @param teamId - The team ID to check
 * @returns Active promo info from team billing data
 */
export async function getPromoStatusFromBilling(teamId: string): Promise<ActivePromoInfo | null> {
  try {
    const teamDoc = await getDoc(doc(db, 'teams', teamId));

    if (!teamDoc.exists()) {
      return null;
    }

    const teamData = teamDoc.data();
    const billing = teamData?.billing;

    if (!billing?.promoActive || !billing?.promoExpiresAt) {
      return null;
    }

    // Convert Firestore timestamp to Date
    const expiresAt = billing.promoExpiresAt?.toDate?.() || new Date(billing.promoExpiresAt);

    // Check if actually expired
    if (new Date() > expiresAt) {
      return null;
    }

    const daysRemaining = getDaysRemaining(expiresAt);

    return {
      type: billing.promoType || 'welcome',
      partnerName: billing.promoPartnerName,
      code: billing.promoCode,
      daysRemaining,
      expiresAt,
      isExpiringSoon: isPromoExpiringSoon(expiresAt),
    };
  } catch (error: unknown) {
    console.error('Error getting promo status from billing:', error);
    return null;
  }
}

/**
 * Check if a user should get a partner promo auto-applied
 * @param email - The user's email
 * @returns Partner domain info if applicable
 */
export async function checkLocalPartnerDomain(email: string): Promise<PartnerCheck> {
  try {
    const domain = extractDomain(email);

    if (!domain) {
      return { isPartner: false };
    }

    const domainDoc = await getDoc(doc(db, 'partnerDomains', domain));

    if (!domainDoc.exists()) {
      return { isPartner: false };
    }

    const domainData = domainDoc.data();

    if (!domainData?.isActive) {
      return { isPartner: false };
    }

    return {
      isPartner: true,
      domain,
      partnerName: domainData.partnerName,
      durationMonths: domainData.durationMonths,
    };
  } catch (error: unknown) {
    console.error('Error checking local partner domain:', error);
    return { isPartner: false };
  }
}

/**
 * Check if team has an existing promo redemption
 * @param teamId - The team ID to check
 * @returns True if team already has an active promo
 */
export async function teamHasActivePromo(teamId: string): Promise<boolean> {
  try {
    const promoQuery = query(
      collection(db, 'promoRedemptions'),
      where('teamId', '==', teamId),
      where('status', '==', 'active'),
      limit(1)
    );

    const snapshot = await getDocs(promoQuery);
    return !snapshot.empty;
  } catch (error: unknown) {
    console.error('Error checking team promo status:', error);
    return false;
  }
}

/**
 * Get promo-aware status for a team
 * Combines promo status with subscription status for permission checks
 * Also checks if team owner is from a partner domain (fallback for unapplied promos)
 * @param teamId - The team ID
 * @param subscriptionStatus - Current subscription status
 * @param storageUsedBytes - Current storage usage in bytes
 * @returns Combined promo and subscription status
 */
export async function getPromoAwareStatus(
  teamId: string,
  subscriptionStatus: string,
  storageUsedBytes: number
): Promise<PromoAwareStatus> {
  let promoInfo = await getPromoStatusFromBilling(teamId);
  let hasActivePromo = promoInfo !== null;
  const hasActiveSubscription = subscriptionStatus === 'active';

  // If no promo found, check if team owner is from a partner domain
  // This is a fallback for cases where partner promo wasn't auto-applied
  if (!hasActivePromo && !hasActiveSubscription) {
    try {
      const teamDoc = await getDoc(doc(db, 'teams', teamId));
      if (teamDoc.exists()) {
        const teamData = teamDoc.data();
        const ownerEmail = teamData?.createdBy || '';

        if (ownerEmail) {
          const partnerCheck = await checkLocalPartnerDomain(ownerEmail);
          if (partnerCheck.isPartner) {
            hasActivePromo = true;
            // Create synthetic promo info for partner domain
            promoInfo = {
              type: 'partnership',
              partnerName: partnerCheck.partnerName,
              daysRemaining: partnerCheck.durationMonths ? partnerCheck.durationMonths * 30 : 365,
              expiresAt: new Date(Date.now() + (partnerCheck.durationMonths || 12) * 30 * 24 * 60 * 60 * 1000),
              isExpiringSoon: false,
            };
          }
        }
      }
    } catch (error) {
      console.error('Error checking partner domain fallback:', error);
    }
  }

  const isPaid = hasActivePromo || hasActiveSubscription;

  // Determine read-only status
  // Read-only if: over 2GB AND no active promo AND no active subscription
  const isOverFreeLimit = storageUsedBytes > STORAGE_LIMITS.FREE_CLOUD_STORAGE;
  const isReadOnly = isOverFreeLimit && !isPaid;

  return {
    hasActivePromo,
    hasActiveSubscription,
    isPaid,
    promoInfo: promoInfo || undefined,
    isReadOnly,
    readOnlyReason: isReadOnly
      ? 'Your storage exceeds the free tier limit (2GB). Please delete files or upgrade to continue editing.'
      : undefined,
  };
}

/**
 * Get all promo redemptions for tracking (admin use)
 * Note: This requires appropriate Firestore rules or admin access
 * @returns Array of all promo redemptions
 */
export async function getAllPromoRedemptions(): Promise<PromoRedemption[]> {
  try {
    const snapshot = await getDocs(collection(db, 'promoRedemptions'));
    return snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      // Convert timestamps
      redeemedAt: doc.data().redeemedAt?.toDate?.() || doc.data().redeemedAt,
      promoStartDate: doc.data().promoStartDate?.toDate?.() || doc.data().promoStartDate,
      promoExpiresAt: doc.data().promoExpiresAt?.toDate?.() || doc.data().promoExpiresAt,
    })) as PromoRedemption[];
  } catch (error: unknown) {
    console.error('Error getting all promo redemptions:', error);
    return [];
  }
}
