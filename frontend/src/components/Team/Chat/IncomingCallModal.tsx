/**
 * IncomingCallModal - Shows when receiving a call
 * Displays caller info with accept/decline buttons
 */

import { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { Call } from '../../../services/callTypes';
import './IncomingCallModal.css';

interface IncomingCallModalProps {
  call: Call;
  onAccept: () => void;
  onDecline: () => void;
}

// Get proper initials from name (e.g., "JunSeop Son" → "JS")
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export default function IncomingCallModal({
  call,
  onAccept,
  onDecline,
}: IncomingCallModalProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Play ringtone when modal appears
  useEffect(() => {
    // Create and play ringtone
    const audio = new Audio('/ringtone.mp3');
    audio.loop = true;
    audio.volume = 0.5;

    // Try to play (may be blocked by browser)
    audio.play().catch(() => {
      // Ringtone playback may be blocked by browser
    });

    audioRef.current = audio;

    // Auto-decline after 30 seconds
    const timeout = setTimeout(() => {
      onDecline();
    }, 30000);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      clearTimeout(timeout);
    };
  }, [onDecline]);

  const isVideoCall = call.type === 'video';

  // Priority: customAvatar (DiceBear) > photoURL (Google) > initials
  const avatarUrl = call.initiatorCustomAvatar || call.initiatorPhotoURL;

  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-modal">
        <div className="incoming-call-header">
          <div className="call-type-icon">
            {isVideoCall ? <Video size={32} /> : <Phone size={32} />}
          </div>
          <h2>{isVideoCall ? 'Incoming Video Call' : 'Incoming Voice Call'}</h2>
        </div>

        <div className="incoming-call-caller">
          <div className="caller-avatar">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={call.initiatorName}
                className="caller-avatar-image"
              />
            ) : (
              <span className="caller-avatar-initials">
                {getInitials(call.initiatorName)}
              </span>
            )}
          </div>
          <div className="caller-name">{call.initiatorName}</div>
          <div className="caller-email">{call.initiatorEmail}</div>
        </div>

        <div className="incoming-call-animation">
          <div className="ring-animation"></div>
          <div className="ring-animation delay-1"></div>
          <div className="ring-animation delay-2"></div>
        </div>

        <div className="incoming-call-actions">
          <button
            className="call-action-btn decline"
            onClick={onDecline}
            title="Decline"
          >
            <PhoneOff size={28} />
          </button>
          <button
            className="call-action-btn accept"
            onClick={onAccept}
            title="Accept"
          >
            {isVideoCall ? <Video size={28} /> : <Phone size={28} />}
          </button>
        </div>
      </div>
    </div>
  );
}
