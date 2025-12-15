/**
 * PromoStatusBanner Component
 * Shows promo status, days remaining, and expiration warnings
 */

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { ActivePromoInfo } from '../../services/promoTypes';
import { getLocalStorage, setLocalStorage, removeLocalStorage } from '../../hooks/useLocalStorage';
import './PromoStatusBanner.css';

// localStorage key for dismissed banner
const PROMO_BANNER_DISMISSED_KEY = 'promo_banner_dismissed';
const PROMO_BANNER_THRESHOLD_DAYS = 3; // Re-show when 3 or fewer days remaining

interface PromoStatusBannerProps {
  promoInfo: ActivePromoInfo;
  onUpgradeClick?: () => void;
  compact?: boolean;
  teamId?: string; // Used to track dismissal per team
}

export const PromoStatusBanner: React.FC<PromoStatusBannerProps> = ({
  promoInfo,
  onUpgradeClick,
  compact = false,
  teamId,
}) => {
  const { type, partnerName, daysRemaining, isExpiringSoon } = promoInfo;
  const [isDismissed, setIsDismissed] = useState(false);

  // Check if banner was dismissed (but re-show if 3 or fewer days remaining)
  useEffect(() => {
    const storageKey = teamId ? `${PROMO_BANNER_DISMISSED_KEY}_${teamId}` : PROMO_BANNER_DISMISSED_KEY;
    const dismissed = getLocalStorage(storageKey, false);

    // Re-show banner if 3 or fewer days remaining, regardless of dismissal
    if (daysRemaining <= PROMO_BANNER_THRESHOLD_DAYS) {
      setIsDismissed(false);
      removeLocalStorage(storageKey);
    } else {
      setIsDismissed(dismissed);
    }
  }, [teamId, daysRemaining]);

  const handleDismiss = () => {
    const storageKey = teamId ? `${PROMO_BANNER_DISMISSED_KEY}_${teamId}` : PROMO_BANNER_DISMISSED_KEY;
    setLocalStorage(storageKey, true);
    setIsDismissed(true);
  };

  // Don't render if dismissed (and more than 3 days remaining)
  if (isDismissed && daysRemaining > PROMO_BANNER_THRESHOLD_DAYS) {
    return null;
  }

  const getTitle = () => {
    if (type === 'partnership' && partnerName) {
      return `${partnerName} Partnership`;
    }
    return 'Pro Trial Active';
  };

  const getMessage = () => {
    if (daysRemaining === 0) {
      return 'Expires today';
    }
    if (daysRemaining === 1) {
      return '1 day remaining';
    }
    return `${daysRemaining} days remaining`;
  };

  if (compact) {
    return (
      <div className={`promo-status-banner compact ${isExpiringSoon ? 'expiring' : ''}`}>
        <span className="promo-badge">PRO</span>
        <span className="promo-days">{getMessage()}</span>
        {isExpiringSoon && onUpgradeClick && (
          <button className="promo-upgrade-link" onClick={onUpgradeClick}>
            Upgrade
          </button>
        )}
        <button
          className="promo-dismiss-button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          title="Dismiss (will reappear when 3 days remaining)"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className={`promo-status-banner ${isExpiringSoon ? 'expiring' : ''}`}>
      <div className="promo-status-content">
        <div className="promo-status-header">
          <span className="promo-badge">PRO</span>
          <span className="promo-title">{getTitle()}</span>
        </div>
        <div className="promo-status-info">
          <span className={`promo-days ${isExpiringSoon ? 'warning' : ''}`}>
            {getMessage()}
          </span>
          {isExpiringSoon && (
            <span className="promo-expiry-warning">
              Your promo is ending soon!
            </span>
          )}
        </div>
      </div>
      <div className="promo-actions">
        {onUpgradeClick && (
          <button className="promo-upgrade-button" onClick={onUpgradeClick}>
            {isExpiringSoon ? 'Upgrade Now' : 'Upgrade to Pro'}
          </button>
        )}
        <button
          className="promo-dismiss-button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          title="Dismiss (will reappear when 3 days remaining)"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

/**
 * ReadOnlyBanner Component
 * Shows when user is in read-only mode (over 2GB, promo expired)
 */
interface ReadOnlyBannerProps {
  onUpgradeClick?: () => void;
  onDeleteClick?: () => void;
}

export const ReadOnlyBanner: React.FC<ReadOnlyBannerProps> = ({
  onUpgradeClick,
  onDeleteClick,
}) => {
  return (
    <div className="read-only-banner">
      <div className="read-only-content">
        <div className="read-only-icon">⚠️</div>
        <div className="read-only-text">
          <div className="read-only-title">Read-Only Mode</div>
          <div className="read-only-message">
            Your storage exceeds the free limit (2GB). You can view and delete files, but cannot add or edit.
          </div>
        </div>
      </div>
      <div className="read-only-actions">
        {onDeleteClick && (
          <button className="read-only-button secondary" onClick={onDeleteClick}>
            Manage Files
          </button>
        )}
        {onUpgradeClick && (
          <button className="read-only-button primary" onClick={onUpgradeClick}>
            Upgrade to Pro
          </button>
        )}
      </div>
    </div>
  );
};

export default PromoStatusBanner;
