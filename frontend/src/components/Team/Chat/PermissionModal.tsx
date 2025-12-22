/**
 * PermissionModal - Custom pre-permission modal for camera/microphone access
 * Shows before the native browser permission prompt for better UX
 */

import { useState } from 'react';
import { Mic, Video, Shield, X, Check } from 'lucide-react';
import './PermissionModal.css';

// Keys for localStorage
const PERMISSION_KEY_AUDIO = 'conceptualize_permission_audio';
const PERMISSION_KEY_VIDEO = 'conceptualize_permission_video';

// Check if user has previously granted permission
// Accepts both 'audio'/'video' (CallType) and 'voice'/'video' (PermissionModal)
export function hasStoredPermission(callType: 'audio' | 'video' | 'voice'): boolean {
  const key = callType === 'video' ? PERMISSION_KEY_VIDEO : PERMISSION_KEY_AUDIO;
  return localStorage.getItem(key) === 'granted';
}

// Clear stored permissions (useful for settings)
export function clearStoredPermissions(): void {
  localStorage.removeItem(PERMISSION_KEY_AUDIO);
  localStorage.removeItem(PERMISSION_KEY_VIDEO);
}

interface PermissionModalProps {
  isOpen: boolean;
  callType: 'voice' | 'video';
  onAllow: () => void;
  onDeny: () => void;
}

export default function PermissionModal({
  isOpen,
  callType,
  onAllow,
  onDeny,
}: PermissionModalProps) {
  const [rememberChoice, setRememberChoice] = useState(true);

  if (!isOpen) return null;

  // Save preference and proceed
  const handleAllow = () => {
    if (rememberChoice) {
      const key = callType === 'video' ? PERMISSION_KEY_VIDEO : PERMISSION_KEY_AUDIO;
      localStorage.setItem(key, 'granted');
      // Video permission also implies audio permission
      if (callType === 'video') {
        localStorage.setItem(PERMISSION_KEY_AUDIO, 'granted');
      }
    }
    onAllow();
  };

  const isVideoCall = callType === 'video';

  return (
    <div className="permission-modal-overlay">
      <div className="permission-modal">
        <button className="permission-close" onClick={onDeny}>
          <X size={20} />
        </button>

        <div className="permission-icon-container">
          <div className="permission-icon">
            {isVideoCall ? <Video size={32} /> : <Mic size={32} />}
          </div>
          <div className="permission-shield">
            <Shield size={16} />
          </div>
        </div>

        <h2 className="permission-title">
          {isVideoCall ? 'Camera & Microphone Access' : 'Microphone Access'}
        </h2>

        <p className="permission-description">
          Conceptualize needs access to your {isVideoCall ? 'camera and microphone' : 'microphone'} to
          {isVideoCall ? ' make video calls' : ' make voice calls'}.
          Your privacy is important to us.
        </p>

        <div className="permission-info">
          <div className="permission-info-item">
            <Mic size={16} />
            <span>Microphone for voice communication</span>
          </div>
          {isVideoCall && (
            <div className="permission-info-item">
              <Video size={16} />
              <span>Camera for video calls</span>
            </div>
          )}
        </div>

        <label className="permission-remember">
          <div
            className={`permission-checkbox ${rememberChoice ? 'checked' : ''}`}
            onClick={() => setRememberChoice(!rememberChoice)}
          >
            {rememberChoice && <Check size={12} />}
          </div>
          <span onClick={() => setRememberChoice(!rememberChoice)}>
            Remember my choice
          </span>
        </label>

        <div className="permission-buttons">
          <button
            className="permission-btn permission-btn-deny"
            onClick={onDeny}
          >
            Not Now
          </button>
          <button
            className="permission-btn permission-btn-allow"
            onClick={handleAllow}
          >
            Allow Access
          </button>
        </div>

        <p className="permission-note">
          You can change this anytime in Settings.
        </p>
      </div>
    </div>
  );
}
