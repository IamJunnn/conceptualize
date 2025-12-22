/**
 * CallButton - Button to initiate voice/video calls
 * Shows in chat header for DM and group chats
 */

import { useState } from 'react';
import { Phone, Video, Loader } from 'lucide-react';
import { CallType } from '../../../services/callTypes';
import './CallButton.css';

interface CallButtonProps {
  onStartCall: (type: CallType) => void | Promise<void>;
  disabled?: boolean;
  isInCall?: boolean;
}

export default function CallButton({
  onStartCall,
  disabled = false,
  isInCall = false,
}: CallButtonProps) {
  const [starting, setStarting] = useState<CallType | null>(null);

  const handleStartCall = async (type: CallType) => {
    if (disabled || starting || isInCall) return;

    setStarting(type);
    try {
      await onStartCall(type);
    } catch (error) {
      console.error('Failed to start call:', error);
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="call-buttons">
      <button
        className={`call-button voice ${starting === 'audio' ? 'starting' : ''}`}
        onClick={() => handleStartCall('audio')}
        disabled={disabled || !!starting || isInCall}
        title={isInCall ? 'Already in a call' : 'Start voice call'}
      >
        {starting === 'audio' ? (
          <Loader size={18} className="spin" />
        ) : (
          <Phone size={18} />
        )}
      </button>
      <button
        className={`call-button video ${starting === 'video' ? 'starting' : ''}`}
        onClick={() => handleStartCall('video')}
        disabled={disabled || !!starting || isInCall}
        title={isInCall ? 'Already in a call' : 'Start video call'}
      >
        {starting === 'video' ? (
          <Loader size={18} className="spin" />
        ) : (
          <Video size={18} />
        )}
      </button>
    </div>
  );
}
