/**
 * CallConflictModal - Shows when receiving a call while already in one
 * Asks user if they want to hang up current call to answer new one
 */

import { Phone, PhoneOff, X, Video } from 'lucide-react';
import { Call } from '../../../services/callTypes';
import './CallConflictModal.css';

interface CallConflictModalProps {
  currentCall: Call;
  currentCallName: string; // Channel or participant name
  incomingCall: Call;
  incomingCallName: string;
  incomingCallerName: string;
  onAccept: () => void; // Hang up current, answer new
  onDecline: () => void; // Stay on current call
}

export default function CallConflictModal({
  currentCall: _currentCall,
  currentCallName,
  incomingCall,
  incomingCallName,
  incomingCallerName,
  onAccept,
  onDecline,
}: CallConflictModalProps) {
  void _currentCall; // Reserved for future use (e.g., showing current call duration)
  const isVideoCall = incomingCall.type === 'video';

  return (
    <div className="call-conflict-overlay">
      <div className="call-conflict-modal">
        {/* Header */}
        <div className="conflict-header">
          <div className={`conflict-icon ${isVideoCall ? 'video' : 'voice'}`}>
            {isVideoCall ? <Video size={28} /> : <Phone size={28} />}
          </div>
          <h3>Incoming {isVideoCall ? 'Video' : 'Voice'} Call</h3>
        </div>

        {/* Caller info */}
        <div className="conflict-caller">
          <div className="caller-avatar">
            {incomingCallerName.charAt(0).toUpperCase()}
          </div>
          <div className="caller-details">
            <span className="caller-name">{incomingCallerName}</span>
            <span className="caller-channel">in {incomingCallName}</span>
          </div>
        </div>

        {/* Warning message */}
        <div className="conflict-warning">
          <p>You're currently in a call with</p>
          <span className="current-call-name">{currentCallName}</span>
          <p>Do you want to hang up and answer this call?</p>
        </div>

        {/* Actions */}
        <div className="conflict-actions">
          <button className="conflict-btn decline" onClick={onDecline}>
            <X size={20} />
            <span>Stay on Current Call</span>
          </button>
          <button className="conflict-btn accept" onClick={onAccept}>
            <PhoneOff size={20} />
            <span>Hang Up & Answer</span>
          </button>
        </div>
      </div>
    </div>
  );
}
