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
  // Get dynamic storage color based on usage percentage
  const getStatusColor = (): string => {
    const percentUsed = usage.percentUsed;

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
