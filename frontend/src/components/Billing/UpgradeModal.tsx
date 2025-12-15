/**
 * UpgradeModal Component
 * Modal for upgrading to paid plan
 */

import React, { useState } from 'react';
import { X, Check, Zap, Users, Shield, Mail, Phone, ChevronRight, Gift } from 'lucide-react';
import { StorageUsage, PRICING, STORAGE_LIMITS, formatBytes } from '../../services/billingTypes';
import { createCheckoutSession, formatPrice } from '../../services/billingService';
import { setLocalStorage, removeLocalStorage } from '../../hooks/useLocalStorage';
import PromoCodeInput from './PromoCodeInput';
import './UpgradeModal.css';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  teamName: string;
  usage: StorageUsage;
  onPromoSuccess?: () => void;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  teamId,
  teamName,
  usage,
  onPromoSuccess,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPromoInput, setShowPromoInput] = useState(false);
  const [promoApplied, setPromoApplied] = useState(false);

  const handlePromoSuccess = (durationMonths: number) => {
    setPromoApplied(true);
    console.log(`🎉 Promo code applied: ${durationMonths} month(s) free`);
    // Delay closing to show success message
    setTimeout(() => {
      onPromoSuccess?.();
      onClose();
    }, 1500);
  };

  if (!isOpen) return null;

  const memberCount = usage.memberCount || 1;
  const monthlyPrice = memberCount * PRICING.PER_MEMBER_MONTHLY;

  const handleUpgrade = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Store the team ID in localStorage so we can return to it after Stripe redirect
      // This is necessary because Tauri apps may not reliably preserve URL params across redirects
      setLocalStorage('pendingUpgradeTeamId', teamId);

      // Comprehensive logging for debugging payment flow
      console.log('💳 === UPGRADE FLOW STARTED ===');
      console.log('💳 Team:', teamName, '(ID:', teamId, ')');
      console.log('💳 Members:', memberCount);
      console.log('💳 Price:', formatPrice(monthlyPrice), '/month');
      console.log('💳 Stored pendingUpgradeTeamId in localStorage:', teamId);

      const checkoutUrl = await createCheckoutSession(teamId);
      console.log('💳 Checkout URL received, redirecting to Stripe...');

      // Redirect to Stripe Checkout
      window.location.href = checkoutUrl;
    } catch (err) {
      console.error('❌ Error creating checkout session:', err);
      setError('Failed to start checkout. Please try again.');
      setIsLoading(false);
      // Clear the stored team ID if checkout fails
      removeLocalStorage('pendingUpgradeTeamId');
      console.log('🧹 Cleared pendingUpgradeTeamId due to error');
    }
  };

  // Get dynamic storage color based on usage percentage
  const getStorageColor = (percentUsed: number): string => {
    if (percentUsed <= 50) {
      // 0-50%: Conceptualize teal
      return '#64c8ca';
    } else if (percentUsed <= 85) {
      // 50-85%: Transition from teal to amber
      const progress = (percentUsed - 50) / 35; // 0 to 1
      const r = Math.round(100 + progress * (245 - 100)); // 100 → 245
      const g = Math.round(200 + progress * (158 - 200)); // 200 → 158
      const b = Math.round(202 + progress * (11 - 202)); // 202 → 11
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // 85-100%: Transition from amber to red
      const progress = (percentUsed - 85) / 15; // 0 to 1
      const r = Math.round(245 + progress * (239 - 245)); // 245 → 239
      const g = Math.round(158 - progress * 90); // 158 → 68
      const b = Math.round(11 - progress * (11 - 68)); // 11 → 68
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  return (
    <div className="upgrade-modal-overlay">
      <div className="upgrade-modal">
        {/* Header - Fixed */}
        <div className="upgrade-modal-header">
          <div className="header-content">
            <Zap className="header-icon" size={24} />
            <h2>Upgrade Your Plan</h2>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Current Status - Fixed */}
        <div className="current-status">
          <div className="status-item">
            <span className="status-label">Team</span>
            <span className="status-value">{teamName}</span>
          </div>
          <div className="status-item">
            <span className="status-label">Members</span>
            <span className="status-value">{memberCount}</span>
          </div>
          <div className="status-item">
            <span className="status-label">Storage Used</span>
            <span
              className="status-value"
              style={{ color: getStorageColor(usage.percentUsed) }}
            >
              {usage.usedFormatted} / {usage.limitFormatted}
            </span>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="upgrade-modal-content">
        {/* Pricing Card */}
        <div className="pricing-card">
          <div className="pricing-header">
            <h3>Pro Plan</h3>
            <div className="price">
              <span className="amount">{formatPrice(monthlyPrice)}</span>
              <span className="period">/month</span>
            </div>
            <p className="price-breakdown">
              {formatPrice(PRICING.PER_MEMBER_MONTHLY)} per member × {memberCount} member{memberCount > 1 ? 's' : ''}
            </p>
          </div>

          <div className="pricing-features">
            <div className="feature">
              <Check className="feature-icon" size={16} />
              <span>Up to {formatBytes(STORAGE_LIMITS.PAID_TIER)} storage</span>
            </div>
            <div className="feature">
              <Check className="feature-icon" size={16} />
              <span>Team chat with channels & DMs</span>
            </div>
            <div className="feature">
              <Check className="feature-icon" size={16} />
              <span>File sharing (8MB per file)</span>
            </div>
            <div className="feature">
              <Check className="feature-icon" size={16} />
              <span>Unlimited message history</span>
            </div>
            <div className="feature">
              <Check className="feature-icon" size={16} />
              <span>@mentions & notifications</span>
            </div>
            <div className="feature">
              <Check className="feature-icon" size={16} />
              <span>Priority support</span>
            </div>
          </div>

          <p className="billing-note">
            <Users size={14} />
            Billing automatically adjusts when team members join or leave
          </p>
        </div>

        {/* Promo Code Section */}
        <div className="promo-code-section">
          {!showPromoInput && !promoApplied ? (
            <button
              className="promo-toggle-button"
              onClick={() => setShowPromoInput(true)}
            >
              <Gift size={16} />
              Have a promo code?
            </button>
          ) : promoApplied ? (
            <div className="promo-applied-message">
              <Check size={18} />
              <span>Promo code applied! Redirecting...</span>
            </div>
          ) : (
            <div className="promo-input-container">
              <div className="promo-input-header">
                <Gift size={16} />
                <span>Enter Promo Code</span>
              </div>
              <PromoCodeInput
                teamId={teamId}
                onSuccess={handlePromoSuccess}
                disabled={isLoading}
              />
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="upgrade-actions">
          <button
            className="upgrade-button primary"
            onClick={handleUpgrade}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="loading-spinner" />
            ) : (
              <>
                <Zap size={16} />
                Upgrade Now
              </>
            )}
          </button>

          <button className="upgrade-button secondary" onClick={onClose}>
            Maybe Later
          </button>
        </div>

        {/* Enterprise Option */}
        <div className="enterprise-option">
          <div className="enterprise-header">
            <Shield size={16} />
            <span>Need more than {formatBytes(STORAGE_LIMITS.PAID_TIER)}?</span>
          </div>
          <div className="contact-sales-section">
            <div className="contact-sales-header">
              <span className="contact-sales-title">Contact Sales</span>
              <ChevronRight size={16} />
            </div>
            <div className="contact-info">
              <a href="mailto:lovejsson@gmail.com" className="contact-item">
                <Mail size={14} />
                <span>lovejsson@gmail.com</span>
              </a>
              <a href="tel:+18016040403" className="contact-item">
                <Phone size={14} />
                <span>+1 801 604 0403</span>
              </a>
            </div>
          </div>
        </div>

        {/* Secure Badge */}
        <div className="secure-badge">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
          </svg>
          <span>Secure payment powered by Stripe</span>
        </div>
        </div>
        {/* End Scrollable Content */}
      </div>
    </div>
  );
};

export default UpgradeModal;
