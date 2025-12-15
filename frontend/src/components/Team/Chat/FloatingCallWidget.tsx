/**
 * FloatingCallWidget - Persistent floating call indicator
 * Shows when user navigates away from the active call's channel
 * Allows quick access to call controls without losing the call
 */

import { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Maximize2,
  Users,
} from 'lucide-react';
import { Track } from 'livekit-client';
import { Call, CallParticipant, formatCallDuration } from '../../../services/callTypes';
import {
  toggleMute,
  toggleVideo,
  endCall,
  getRoom,
  getCallStartTime,
} from '../../../services/callService';
import './FloatingCallWidget.css';

interface FloatingCallWidgetProps {
  call: Call;
  participants: CallParticipant[];
  isMuted: boolean;
  isVideoOff: boolean;
  onExpand: () => void; // Navigate back to call's channel and expand
  channelName?: string;
}

export default function FloatingCallWidget({
  call,
  participants,
  isMuted,
  isVideoOff,
  onExpand,
  channelName,
}: FloatingCallWidgetProps) {
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState({ x: 24, y: window.innerHeight - 180 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const widgetRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const room = getRoom();

  // Update call duration every second using stable start time from callService
  useEffect(() => {
    // Use the stable call start time from callService, fallback to call.createdAt
    const globalStartTime = getCallStartTime();
    const startTime = globalStartTime || (call.createdAt ? new Date(call.createdAt).getTime() : Date.now());

    // Set initial duration immediately
    setDuration(Math.floor((Date.now() - startTime) / 1000));

    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [call.createdAt]); // Use createdAt as dependency since it's always set

  // Attach local video preview
  useEffect(() => {
    if (!room || !localVideoRef.current || isVideoOff) return;

    const attachLocalVideo = () => {
      const cameraTrack = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (cameraTrack?.track && !cameraTrack.isMuted && localVideoRef.current) {
        cameraTrack.track.attach(localVideoRef.current);
      }
    };

    attachLocalVideo();
    room.on('trackMuted', attachLocalVideo);
    room.on('trackUnmuted', attachLocalVideo);

    return () => {
      room.off('trackMuted', attachLocalVideo);
      room.off('trackUnmuted', attachLocalVideo);
    };
  }, [room, isVideoOff]);

  // Dragging logic
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return; // Don't drag when clicking buttons

    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const newX = Math.max(0, Math.min(window.innerWidth - 200, e.clientX - dragOffset.current.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 150, e.clientY - dragOffset.current.y));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleToggleMute = async () => {
    try {
      await toggleMute();
    } catch (error) {
      console.error('Failed to toggle mute:', error);
    }
  };

  const handleToggleVideo = async () => {
    try {
      await toggleVideo();
    } catch (error) {
      console.error('Failed to toggle video:', error);
    }
  };

  const handleEndCall = async () => {
    try {
      await endCall();
    } catch (error) {
      console.error('Failed to end call:', error);
    }
  };

  const isVideoCall = call.type === 'video';

  return (
    <div
      ref={widgetRef}
      className={`floating-call-widget ${isDragging ? 'dragging' : ''}`}
      style={{ left: position.x, bottom: window.innerHeight - position.y - 140 }}
      onMouseDown={handleMouseDown}
    >
      {/* Video preview for video calls */}
      {isVideoCall && (
        <div className={`floating-video-preview ${isVideoOff ? 'video-off' : ''}`}>
          {isVideoOff ? (
            <div className="video-off-placeholder">
              <VideoOff size={20} />
            </div>
          ) : (
            <video ref={localVideoRef} autoPlay playsInline muted />
          )}
        </div>
      )}

      {/* Call info */}
      <div className="floating-call-info">
        <div className="floating-call-header">
          <span className="floating-call-name">{channelName || 'Call'}</span>
          <span className="floating-call-timer">{formatCallDuration(duration)}</span>
        </div>

        <div className="floating-participants">
          <Users size={12} />
          <span>{participants.length} in call</span>
        </div>
      </div>

      {/* Controls */}
      <div className="floating-controls">
        <button
          className={`floating-btn ${isMuted ? 'muted' : ''}`}
          onClick={handleToggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>

        {isVideoCall && (
          <button
            className={`floating-btn ${isVideoOff ? 'video-off' : ''}`}
            onClick={handleToggleVideo}
            title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
          >
            {isVideoOff ? <VideoOff size={16} /> : <Video size={16} />}
          </button>
        )}

        <button
          className="floating-btn end-call"
          onClick={handleEndCall}
          title="End call"
        >
          <PhoneOff size={16} />
        </button>

        <button
          className="floating-btn expand"
          onClick={onExpand}
          title="Return to call"
        >
          <Maximize2 size={16} />
        </button>
      </div>
    </div>
  );
}
