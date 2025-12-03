/**
 * UpgradeModal Component
 * Modal for upgrading to paid plan
 */

import React, { useState } from 'react';
import { X, Check, Zap, Users, HardDrive, Shield } from 'lucide-react';
import { StorageUsage, PRICING, STORAGE_LIMITS, formatBytes } from '../../services/billingTypes';
import { createCheckoutSession, formatPrice } from '../../services/billingService';
import './UpgradeModal.css';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  teamName: string;
  usage: StorageUsage;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  teamId,
  teamName,
  usage,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const memberCount = usage.memberCount || 1;
  const monthlyPrice = memberCount * PRICING.PER_MEMBER_MONTHLY;

  const handleUpgrade = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const checkoutUrl = await createCheckoutSession(teamId);
      // Redirect to Stripe Checkout
      window.location.href = checkoutUrl;
    } catch (err) {
      console.error('Error creating checkout session:', err);
      setError('Failed to start checkout. Please try again.');
      setIsLoading(false);
    }
  };

  const handleContactSales = () => {
    // Open email client or contact form
    window.open('mailto:sales@conceptualize.app?subject=Enterprise%20Plan%20Inquiry', '_blank');
  };

  return (
    <div className="upgrade-modal-overlay" onClick={onClose}>
      <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="upgrade-modal-header">
          <div className="header-content">
            <Zap className="header-icon" size={24} />
            <h2>Upgrade Your Plan</h2>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Current Status */}
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
            <span className="status-value warning">
              {usage.usedFormatted} / {usage.limitFormatted}
            </span>
          </div>
        </div>

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
          <Shield size={16} />
          <span>Need more than {formatBytes(STORAGE_LIMITS.PAID_TIER)}?</span>
          <button className="enterprise-link" onClick={handleContactSales}>
            Contact Sales
          </button>
        </div>

        {/* Secure Badge */}
        <div className="secure-badge">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
          </svg>
          <span>Secure payment powered by Stripe</span>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
