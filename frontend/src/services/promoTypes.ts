/**
 * Promo Code & Partnership Types
 * Defines all types for the promotional code system
 */

// Promo code types
export type PromoType = 'welcome' | 'partnership';
export type PromoStatus = 'active' | 'expired';

// Promo code document stored in Firestore: promoCodes/{codeId}
export interface PromoCode {
  code: string;                    // "WELCOME1" (uppercase)
  type: 'welcome';
  durationMonths: number;          // 1 for welcome codes
  maxRedemptions: number;          // 20 for welcome codes
  currentRedemptions: number;
  isActive: boolean;
  createdAt: Date;
  expiresAt: Date | null;          // null = never expires
}

// Partner domain document stored in Firestore: partnerDomains/{domain}
export interface PartnerDomain {
  domain: string;                  // "ecoblox.build"
  durationMonths: number;          // 12 for partnerships
  isActive: boolean;
  partnerName: string;             // "EcoBlox"
  createdAt: Date;
  notes: string;                   // Internal notes
}

// Promo redemption document stored in Firestore: promoRedemptions/{redemptionId}
export interface PromoRedemption {
  id: string;
  type: PromoType;
  code: string | null;             // "WELCOME1" or null for partnership
  domain: string | null;           // "ecoblox.build" or null for welcome code
  userId: string;
  userEmail: string;
  teamId: string;
  teamName: string;
  redeemedAt: Date;
  durationMonths: number;
  promoStartDate: Date;
  promoExpiresAt: Date;
  status: PromoStatus;
}

// Validation response for promo codes
export interface PromoValidation {
  valid: boolean;
  code?: string;
  type?: PromoType;
  durationMonths?: number;
  remainingRedemptions?: number;
  error?: string;
}

// Partner domain check response
export interface PartnerCheck {
  isPartner: boolean;
  domain?: string;
  partnerName?: string;
  durationMonths?: number;
}

// Redeem promo code request
export interface RedeemPromoRequest {
  teamId: string;
  code: string;
}

// Redeem promo code response
export interface RedeemPromoResponse {
  success: boolean;
  redemption?: PromoRedemption;
  error?: string;
}

// Active promo info for UI display
export interface ActivePromoInfo {
  type: PromoType;
  partnerName?: string;            // For partnership promos
  code?: string;                   // For welcome promos
  daysRemaining: number;
  expiresAt: Date;
  isExpiringSoon: boolean;         // < 7 days remaining
}

// Promo-aware permissions (extends base StoragePermissions concept)
export interface PromoAwareStatus {
  hasActivePromo: boolean;
  hasActiveSubscription: boolean;
  isPaid: boolean;                 // true if either promo or subscription active
  promoInfo?: ActivePromoInfo;

  // Storage-based restrictions (for expired promo + over 2GB)
  isReadOnly: boolean;             // true if over 2GB and no active promo/subscription
  readOnlyReason?: string;
}

// Helper function to check if promo is expiring soon (within 7 days)
export function isPromoExpiringSoon(expiresAt: Date): boolean {
  const now = new Date();
  const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
}

// Helper function to calculate days remaining
export function getDaysRemaining(expiresAt: Date): number {
  const now = new Date();
  const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, daysRemaining);
}

// Helper function to check if promo is expired
export function isPromoExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

// Helper function to extract domain from email
export function extractDomain(email: string): string {
  const parts = email.toLowerCase().split('@');
  return parts.length === 2 ? parts[1] : '';
}

// Helper function to format promo status for display
export function formatPromoStatus(info: ActivePromoInfo): string {
  if (info.type === 'partnership' && info.partnerName) {
    return `${info.partnerName} Partnership - ${info.daysRemaining} days remaining`;
  }
  return `Promo Code Active - ${info.daysRemaining} days remaining`;
}
