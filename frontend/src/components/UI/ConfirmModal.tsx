import React from 'react';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import './ConfirmModal.css';

export type ModalVariant = 'confirm' | 'danger' | 'success' | 'info' | 'warning';

interface ConfirmModalProps {
  title: string;
  message: string;
  hint?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isOpen: boolean;
  isDanger?: boolean; // Legacy prop, use variant instead
  variant?: ModalVariant;
  icon?: React.ReactNode;
  hideCancel?: boolean; // For single-button modals (success, info)
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  message,
  hint,
  confirmText,
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isOpen,
  isDanger = false,
  variant,
  icon,
  hideCancel = false
}) => {
  if (!isOpen) return null;

  // Determine effective variant (backwards compatible with isDanger)
  const effectiveVariant: ModalVariant = variant || (isDanger ? 'danger' : 'confirm');

  // Default icons based on variant
  const getDefaultIcon = () => {
    switch (effectiveVariant) {
      case 'success':
        return <CheckCircle size={20} />;
      case 'danger':
      case 'warning':
        return <AlertTriangle size={20} />;
      case 'info':
        return <Info size={20} />;
      default:
        return null;
    }
  };

  // Default confirm button text based on variant
  const getDefaultConfirmText = () => {
    switch (effectiveVariant) {
      case 'success':
      case 'info':
        return 'OK';
      case 'danger':
        return 'Delete';
      default:
        return 'Confirm';
    }
  };

  const displayIcon = icon !== undefined ? icon : getDefaultIcon();
  const buttonText = confirmText || getDefaultConfirmText();
  const showCancel = !hideCancel && effectiveVariant !== 'success' && effectiveVariant !== 'info';

  return (
    <div className="confirm-modal-overlay" onClick={onCancel}>
      <div className={`confirm-modal ${effectiveVariant}`} onClick={(e) => e.stopPropagation()}>
        <div className={`confirm-modal-header ${effectiveVariant}`}>
          {displayIcon && <span className="confirm-modal-icon">{displayIcon}</span>}
          <h3>{title}</h3>
        </div>
        <div className="confirm-modal-body">
          <p>{message}</p>
          {hint && <p className="confirm-modal-hint">{hint}</p>}
        </div>
        <div className={`confirm-modal-footer ${!showCancel ? 'single-button' : ''}`}>
          {showCancel && (
            <button className="confirm-modal-button cancel" onClick={onCancel}>
              {cancelText}
            </button>
          )}
          <button className={`confirm-modal-button confirm ${effectiveVariant}`} onClick={onConfirm}>
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
