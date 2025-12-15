/**
 * Billing & Storage Types
 * Defines all types for the billing and storage limit system
 */

// Storage limits in bytes
export const STORAGE_LIMITS = {
  // Cloud storage for notes sync (future feature)
  FREE_CLOUD_STORAGE: 2 * 1024 * 1024 * 1024,            // 2 GB for free tier
  PAID_CLOUD_STORAGE_PER_USER: 100 * 1024 * 1024 * 1024, // 100 GB per user for paid tier

  // Chat attachment limits (paid feature only)
  MAX_FILE_SIZE: 500 * 1024 * 1024,                     // 500 MB per file
  MAX_MESSAGE_ATTACHMENTS: 500 * 1024 * 1024,           // 500 MB total per message

  // Legacy aliases for backward compatibility
  FREE_TIER: 2 * 1024 * 1024 * 1024,                     // 2 GB
  PAID_TIER: 100 * 1024 * 1024 * 1024,                   // 100 GB (per user)
  ENTERPRISE_THRESHOLD: 100 * 1024 * 1024 * 1024,       // 100 GB+ requires enterprise
  CHAT_ATTACHMENT_LIMIT: 500 * 1024 * 1024,             // Legacy alias
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
  storageUsedBytes: number;      // Total cloud storage used (notes sync)
  chatStorageUsedBytes: number;  // Chat attachment storage used
  lastStorageCalculation: Date;

  // Storage limits (calculated based on tier and member count)
  cloudStorageLimitBytes: number;  // 2GB free, 30GB * memberCount for paid
  chatStorageLimitBytes: number;   // 0 for free, 500MB for paid

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

// Chat storage usage response
export interface ChatStorageUsage {
  usedBytes: number;
  limitBytes: number;
  percentUsed: number;
  remainingBytes: number;
  canUpload: boolean;
  usedFormatted: string;
  limitFormatted: string;
  remainingFormatted: string;
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
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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

/**
 * Calculate cloud storage limit based on tier and member count
 */
export function calculateCloudStorageLimit(isPaid: boolean, memberCount: number): number {
  if (!isPaid) {
    return STORAGE_LIMITS.FREE_CLOUD_STORAGE; // 2GB for free
  }
  return STORAGE_LIMITS.PAID_CLOUD_STORAGE_PER_USER * memberCount; // 30GB per user
}

/**
 * Get chat attachment storage limit based on tier
 * Free tier: 0 (no chat)
 * Paid tier: 500MB
 */
export function getChatStorageLimit(isPaid: boolean): number {
  return isPaid ? STORAGE_LIMITS.CHAT_ATTACHMENT_LIMIT : 0;
}

/**
 * Check if files can be uploaded to chat (per-message limit check)
 * @param files - Array of files or single file size to check
 * @param isPaid - Whether the team has an active subscription
 */
export function canUploadToChat(
  files: File[] | number,
  isPaid: boolean
): { canUpload: boolean; reason?: string } {
  // Free tier cannot upload to chat
  if (!isPaid) {
    return { canUpload: false, reason: 'Chat is a paid feature. Upgrade to upload files.' };
  }

  // Handle array of files or single size value
  const fileSizes = Array.isArray(files) ? files.map(f => f.size) : [files];
  const totalSize = fileSizes.reduce((sum, size) => sum + size, 0);

  // Check per-message total limit (500MB per message)
  if (totalSize > STORAGE_LIMITS.MAX_MESSAGE_ATTACHMENTS) {
    return {
      canUpload: false,
      reason: `Too many attachments. Maximum ${formatBytes(STORAGE_LIMITS.MAX_MESSAGE_ATTACHMENTS)} per message.`,
    };
  }

  return { canUpload: true };
}

/**
 * Get chat storage usage info
 */
export function getChatStorageUsage(usedBytes: number, isPaid: boolean): ChatStorageUsage {
  const limitBytes = getChatStorageLimit(isPaid);
  const remainingBytes = Math.max(0, limitBytes - usedBytes);
  const percentUsed = limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0;

  return {
    usedBytes,
    limitBytes,
    percentUsed: Math.min(100, percentUsed),
    remainingBytes,
    canUpload: isPaid && usedBytes < limitBytes,
    usedFormatted: formatBytes(usedBytes),
    limitFormatted: formatBytes(limitBytes),
    remainingFormatted: formatBytes(remainingBytes),
  };
}
