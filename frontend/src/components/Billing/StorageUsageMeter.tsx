/**
 * StorageUsageMeter Component
 * Displays current storage usage with visual progress bar
 */

import React from 'react';
import { StorageUsage } from '../../services/billingTypes';
import './StorageUsageMeter.css';

interface StorageUsageMeterProps {
  usage: StorageUsage;
  compact?: boolean;
  showUpgradeButton?: boolean;
  onUpgradeClick?: () => void;
}

const StorageUsageMeter: React.FC<StorageUsageMeterProps> = ({
  usage,
  compact = false,
  showUpgradeButton = true,
  onUpgradeClick,
}) => {
  const getStatusColor = () => {
    switch (usage.status) {
      case 'ok':
        return 'var(--color-success, #10b981)';
      case 'warning':
        return 'var(--color-warning, #f59e0b)';
      case 'exceeded':
      case 'enterprise':
        return 'var(--color-error, #ef4444)';
      default:
        return 'var(--color-primary, #6366f1)';
    }
  };

  const getStatusText = () => {
    switch (usage.status) {
      case 'ok':
        return '';
      case 'warning':
        return 'Approaching limit';
      case 'exceeded':
        return 'Storage full - Upgrade to continue';
      case 'enterprise':
        return 'Contact us for Enterprise';
      default:
        return '';
    }
  };

  if (compact) {
    return (
      <div className="storage-meter-compact">
        <div className="storage-meter-bar-compact">
          <div
            className="storage-meter-fill-compact"
            style={{
              width: `${Math.min(usage.percentUsed, 100)}%`,
              backgroundColor: getStatusColor(),
            }}
          />
        </div>
        <span className="storage-meter-text-compact">
          {usage.usedFormatted} / {usage.limitFormatted}
        </span>
      </div>
    );
  }

  return (
    <div className={`storage-meter ${usage.status}`}>
      <div className="storage-meter-header">
        <span className="storage-meter-label">Storage</span>
        <span className="storage-meter-value">
          {usage.usedFormatted} of {usage.limitFormatted}
        </span>
      </div>

      <div className="storage-meter-bar">
        <div
          className="storage-meter-fill"
          style={{
            width: `${Math.min(usage.percentUsed, 100)}%`,
            backgroundColor: getStatusColor(),
          }}
        />
      </div>

      <div className="storage-meter-footer">
        {usage.status !== 'ok' && (
          <span
            className="storage-meter-status"
            style={{ color: getStatusColor() }}
          >
            {getStatusText()}
          </span>
        )}

        {usage.percentUsed < 100 && (
          <span className="storage-meter-percent">
            {usage.percentUsed}% used
          </span>
        )}

        {showUpgradeButton && usage.requiresUpgrade && onUpgradeClick && (
          <button
            className="storage-meter-upgrade-btn"
            onClick={onUpgradeClick}
          >
            Upgrade
          </button>
        )}
      </div>
    </div>
  );
};

export default StorageUsageMeter;
