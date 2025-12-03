/**
 * StorageLimitBanner Component
 * Shows a banner when storage limit is exceeded
 */

import React from 'react';
import { AlertTriangle, X, Zap } from 'lucide-react';
import { StorageUsage } from '../../services/billingTypes';
import { formatPrice } from '../../services/billingService';
import './StorageLimitBanner.css';

interface StorageLimitBannerProps {
  usage: StorageUsage;
  onUpgradeClick: () => void;
  onDismiss?: () => void;
  dismissable?: boolean;
}

const StorageLimitBanner: React.FC<StorageLimitBannerProps> = ({
  usage,
  onUpgradeClick,
  onDismiss,
  dismissable = false,
}) => {
  // Don't show if under limit
  if (usage.status === 'ok') {
    return null;
  }

  const isExceeded = usage.status === 'exceeded' || usage.status === 'enterprise';
  const isWarning = usage.status === 'warning';

  return (
    <div className={`storage-limit-banner ${isExceeded ? 'exceeded' : 'warning'}`}>
      <div className="banner-content">
        <AlertTriangle className="banner-icon" size={20} />

        <div className="banner-text">
          {isExceeded ? (
            <>
              <strong>Storage limit reached</strong>
              <span>
                You're using {usage.usedFormatted} of {usage.limitFormatted}.
                You can edit and delete files, but cannot create new content until you upgrade.
              </span>
            </>
          ) : (
            <>
              <strong>Running low on storage</strong>
              <span>
                You've used {usage.percentUsed}% of your {usage.limitFormatted} storage.
                Consider upgrading to avoid interruptions.
              </span>
            </>
          )}
        </div>

        <div className="banner-actions">
          <button className="upgrade-button" onClick={onUpgradeClick}>
            <Zap size={14} />
            {usage.monthlyPrice !== undefined ? (
              <>Upgrade - {formatPrice(usage.monthlyPrice)}/mo</>
            ) : (
              <>Upgrade</>
            )}
          </button>

          {dismissable && onDismiss && isWarning && (
            <button className="dismiss-button" onClick={onDismiss} aria-label="Dismiss">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {isExceeded && (
        <div className="banner-restrictions">
          <span className="restriction-item allowed">
            <span className="dot green" /> Edit existing notes
          </span>
          <span className="restriction-item allowed">
            <span className="dot green" /> Delete files
          </span>
          <span className="restriction-item blocked">
            <span className="dot red" /> Create new notes
          </span>
          <span className="restriction-item blocked">
            <span className="dot red" /> Upload files
          </span>
        </div>
      )}
    </div>
  );
};

export default StorageLimitBanner;
