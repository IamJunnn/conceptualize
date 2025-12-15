/**
 * PromoCodeInput Component
 * Reusable promo code input with validation and redemption
 */

import React, { useState, useCallback } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { validatePromoCode, redeemPromoCode } from '../../services/promoService';
import type { PromoValidation } from '../../services/promoTypes';
import './PromoCodeInput.css';

interface PromoCodeInputProps {
  teamId: string;
  onSuccess?: (durationMonths: number) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

export const PromoCodeInput: React.FC<PromoCodeInputProps> = ({
  teamId,
  onSuccess,
  onError,
  disabled = false,
}) => {
  const [code, setCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [validation, setValidation] = useState<PromoValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newCode = e.target.value.toUpperCase().trim();
    setCode(newCode);
    setValidation(null);
    setError(null);
    setSuccess(false);
  }, []);

  const handleValidate = useCallback(async () => {
    if (!code || code.length < 3) {
      setError('Please enter a valid promo code');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const result = await validatePromoCode(code);
      setValidation(result);

      if (!result.valid) {
        setError(result.error || 'Invalid promo code');
      }
    } catch (err) {
      setError('Failed to validate promo code');
    } finally {
      setIsValidating(false);
    }
  }, [code]);

  const handleRedeem = useCallback(async () => {
    if (!validation?.valid) {
      await handleValidate();
      return;
    }

    setIsRedeeming(true);
    setError(null);

    try {
      const result = await redeemPromoCode(teamId, code);

      if (result.success) {
        setSuccess(true);
        setCode('');
        setValidation(null);
        onSuccess?.(validation.durationMonths || 1);
      } else {
        setError(result.error || 'Failed to redeem promo code');
        onError?.(result.error || 'Failed to redeem promo code');
      }
    } catch (err) {
      const errorMsg = 'Failed to redeem promo code';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsRedeeming(false);
    }
  }, [code, teamId, validation, handleValidate, onSuccess, onError]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (validation?.valid) {
        handleRedeem();
      } else {
        handleValidate();
      }
    }
  }, [validation, handleValidate, handleRedeem]);

  if (success) {
    return (
      <div className="promo-code-input success">
        <div className="promo-success-message">
          <Check size={18} />
          <span>Promo code applied successfully!</span>
        </div>
      </div>
    );
  }

  return (
    <div className="promo-code-input">
      <div className="promo-input-row">
        <input
          type="text"
          value={code}
          onChange={handleCodeChange}
          onKeyDown={handleKeyDown}
          placeholder="Enter promo code"
          disabled={disabled || isValidating || isRedeeming}
          className={`promo-input ${error ? 'error' : ''} ${validation?.valid ? 'valid' : ''}`}
          maxLength={20}
        />
        {validation?.valid ? (
          <button
            onClick={handleRedeem}
            disabled={disabled || isRedeeming}
            className="promo-button apply"
          >
            {isRedeeming ? 'Applying...' : 'Apply'}
          </button>
        ) : (
          <button
            onClick={handleValidate}
            disabled={disabled || isValidating || !code}
            className="promo-button validate"
          >
            {isValidating ? 'Checking...' : 'Check'}
          </button>
        )}
      </div>

      {error && (
        <div className="promo-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {validation?.valid && (
        <div className="promo-valid-info">
          <Check size={16} />
          <span>
            {validation.durationMonths} month{validation.durationMonths !== 1 ? 's' : ''} free Pro access
            {validation.remainingRedemptions !== undefined && validation.remainingRedemptions <= 5 && (
              <span className="promo-limited"> · Only {validation.remainingRedemptions} left!</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
};

export default PromoCodeInput;
