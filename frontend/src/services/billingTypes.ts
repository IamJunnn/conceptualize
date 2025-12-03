/**
 * Billing & Storage Types
 * Defines all types for the billing and storage limit system
 */

// Storage limits in bytes
export const STORAGE_LIMITS = {
  FREE_TIER: 2 * 1024 * 1024 * 1024,      // 2 GB
  PAID_TIER: 20 * 1024 * 1024 * 1024,     // 20 GB
  ENTERPRISE_THRESHOLD: 20 * 1024 * 1024 * 1024, // 20+ GB requires enterprise
} as const;

// Pricing
export const PRICING = {
  PER_MEMBER_MONTHLY: 3.00,  // $3 per member per month
  CURRENCY: 'usd',
} as const;

// Subscription status
export type SubscriptionStatus =
  | 'free'           // Not paying, under 2GB
  | 'active'         // Paying, subscription active
  | 'past_due'       // Payment failed, grace period
  | 'canceled'       // Subscription canceled
  | 'requires_payment'; // Over 2GB, needs to pay

// Storage status
export type StorageStatus =
  | 'ok'             // Under limit, full access
  | 'warning'        // 80%+ of limit
  | 'exceeded'       // Over limit, restricted access
  | 'enterprise';    // Over 20GB, needs enterprise

// What users can do based on storage status
export interface StoragePermissions {
  canCreateNotes: boolean;
  canUploadFiles: boolean;
  canEditNotes: boolean;
  canDeleteFiles: boolean;
  canInviteMembers: boolean;
}

// User billing info stored in Firestore: users/{uid}/billing
export interface UserBilling {
  // Stripe customer info
  stripeCustomerId?: string;

  // Storage tracking (across all owned teams)
  totalStorageUsedBytes: number;
  lastStorageCalculation: Date;

  // Overall status
  requiresPayment: boolean;

  // Created/updated timestamps
  createdAt: Date;
  updatedAt: Date;
}

// Team billing info stored in Firestore: teams/{teamId}
export interface TeamBilling {
  // Member count for billing
  memberCount: number;           // Total accepted members (including owner)

  // Storage for this team
  storageUsedBytes: number;
  lastStorageCalculation: Date;

  // Subscription info (owner's subscription for this team)
  subscription: {
    status: SubscriptionStatus;
    stripeSubscriptionId?: string;
    stripeCustomerId?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    cancelAtPeriodEnd?: boolean;
  };

  // Billing history reference
  ownerId: string;               // User UID who pays
  ownerEmail: string;            // For display/contact

  // Computed monthly cost (memberCount * $3)
  monthlyPriceCents: number;
}

// Storage usage response
export interface StorageUsage {
  usedBytes: number;
  limitBytes: number;
  percentUsed: number;
  status: StorageStatus;
  permissions: StoragePermissions;

  // Formatted strings for display
  usedFormatted: string;         // e.g., "1.5 GB"
  limitFormatted: string;        // e.g., "2 GB"

  // For upgrade prompts
  requiresUpgrade: boolean;
  monthlyPrice?: number;         // If upgrade needed, how much
  memberCount?: number;          // For price calculation display
}

// Stripe checkout session request
export interface CreateCheckoutRequest {
  teamId: string;
  memberCount: number;
  successUrl: string;
  cancelUrl: string;
}

// Stripe portal request
export interface CreatePortalRequest {
  teamId: string;
  returnUrl: string;
}

// Webhook event types we handle
export type BillingWebhookEvent =
  | 'checkout.session.completed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.paid'
  | 'invoice.payment_failed';

// Helper functions
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getStorageStatus(usedBytes: number, isPaid: boolean): StorageStatus {
  const limit = isPaid ? STORAGE_LIMITS.PAID_TIER : STORAGE_LIMITS.FREE_TIER;
  const percent = (usedBytes / limit) * 100;

  if (usedBytes > STORAGE_LIMITS.ENTERPRISE_THRESHOLD) {
    return 'enterprise';
  }

  if (usedBytes > limit) {
    return 'exceeded';
  }

  if (percent >= 80) {
    return 'warning';
  }

  return 'ok';
}

export function getStoragePermissions(status: StorageStatus, isPaid: boolean): StoragePermissions {
  // If under limit or paid, full access
  if (status === 'ok' || status === 'warning' || isPaid) {
    return {
      canCreateNotes: true,
      canUploadFiles: true,
      canEditNotes: true,
      canDeleteFiles: true,
      canInviteMembers: true,
    };
  }

  // Exceeded but not paid - restricted access
  if (status === 'exceeded') {
    return {
      canCreateNotes: false,
      canUploadFiles: false,
      canEditNotes: true,      // Can still edit
      canDeleteFiles: true,    // Can delete to free space
      canInviteMembers: true,  // Can still invite (they might pay)
    };
  }

  // Enterprise needed - same as exceeded
  return {
    canCreateNotes: false,
    canUploadFiles: false,
    canEditNotes: true,
    canDeleteFiles: true,
    canInviteMembers: false,   // Need enterprise for more
  };
}

export function calculateMonthlyPrice(memberCount: number): number {
  return memberCount * PRICING.PER_MEMBER_MONTHLY;
}
