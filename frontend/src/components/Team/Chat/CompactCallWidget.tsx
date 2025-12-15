/**
 * CompactCallWidget - Compact call controls that show below chat header
 * Discord/Slack style call interface
 */

import { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Monitor,
  MonitorOff,
  ChevronDown,
  Maximize2,
  Circle,
  Square,
  Image,
} from 'lucide-react';
import { Track } from 'livekit-client';
import { Call, formatCallDuration } from '../../../services/callTypes';
import {
  toggleMute,
  toggleVideo,
  toggleScreenShare,
  endCall,
  getRoom,
  getCallStartTime,
  setBackgroundMode,
  subscribeToBackgroundMode,
  BackgroundMode,
  getMirrorMode,
  subscribeToMirrorMode,
} from '../../../services/callService';
import {
  startRecording,
  stopRecording,
  subscribeToRecordingState,
  subscribeToCallRecording,
} from '../../../services/recordingService';
import { Recording, RecordingState } from '../../../services/recordingTypes';
import BackgroundSelectorModal from './BackgroundSelectorModal';
import './CompactCallWidget.css';

interface CompactCallWidgetProps {
  call: Call;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  onExpand?: () => void;
  userEmail?: string;
  userName?: string;
  channelName?: string;
}

export default function CompactCallWidget({
  call,
  isMuted,
  isVideoOff,
  isScreenSharing,
  onExpand,
  userEmail,
  userName,
  channelName,
}: CompactCallWidgetProps) {
  const [duration, setDuration] = useState(0);
  const [showMicMenu, setShowMicMenu] = useState(false);
  const [showCameraMenu, setShowCameraMenu] = useState(false);
  const [showScreenShareMenu, setShowScreenShareMenu] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>('');
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [recordingState, setRecordingState] = useState<RecordingState | null>(null);
  const [callRecording, setCallRecording] = useState<Recording | null>(null);
  const [backgroundMode, setBackgroundModeState] = useState<BackgroundMode>('none');
  const [showBackgroundSelector, setShowBackgroundSelector] = useState(false);
  const [isMirrored, setIsMirrored] = useState(getMirrorMode());
  const room = getRoom();
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenShareRef = useRef<HTMLVideoElement>(null);
  const micMenuRef = useRef<HTMLDivElement>(null);
  const cameraMenuRef = useRef<HTMLDivElement>(null);
  const screenShareMenuRef = useRef<HTMLDivElement>(null);

  // Derive blur state from background mode
  const isBackgroundBlurred = backgroundMode === 'blur';

  // Subscribe to background mode changes
  useEffect(() => {
    const unsubscribe = subscribeToBackgroundMode((mode) => {
      setBackgroundModeState(mode);
    });
    return unsubscribe;
  }, []);

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

  // Get available devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioDevices(devices.filter(d => d.kind === 'audioinput'));
        setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
      } catch (error) {
        console.error('Failed to enumerate devices:', error);
      }
    };
    getDevices();
  }, []);

  // Subscribe to recording state
  useEffect(() => {
    const unsubscribe = subscribeToRecordingState((state) => {
      setRecordingState(state);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to call recording (for when someone else starts recording)
  useEffect(() => {
    const unsubscribe = subscribeToCallRecording(
      call.teamId,
      call.id,
      (recording) => {
        setCallRecording(recording);
      }
    );
    return () => unsubscribe();
  }, [call.teamId, call.id]);

  // Subscribe to mirror mode changes
  useEffect(() => {
    const unsubscribe = subscribeToMirrorMode((mirrored) => {
      setIsMirrored(mirrored);
    });
    return unsubscribe;
  }, []);

  // Determine if recording is active
  const isRecording = recordingState?.isRecording || !!callRecording;
  const isRecordingStarting = recordingState?.isStarting || false;
  const isRecordingStopping = recordingState?.isStopping || false;

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (micMenuRef.current && !micMenuRef.current.contains(e.target as Node)) {
        setShowMicMenu(false);
      }
      if (cameraMenuRef.current && !cameraMenuRef.current.contains(e.target as Node)) {
        setShowCameraMenu(false);
      }
      if (screenShareMenuRef.current && !screenShareMenuRef.current.contains(e.target as Node)) {
        setShowScreenShareMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Attach local video preview
  useEffect(() => {
    if (!room || !localVideoRef.current) return;

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

  // Attach screen share preview
  useEffect(() => {
    if (!room || !screenShareRef.current || !isScreenSharing) return;

    const attachScreenShare = () => {
      const screenTrack = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
      if (screenTrack?.track && screenShareRef.current) {
        screenTrack.track.attach(screenShareRef.current);
      }
    };

    attachScreenShare();

    room.on('localTrackPublished', attachScreenShare);

    return () => {
      room.off('localTrackPublished', attachScreenShare);
      // Detach when stopping screen share
      if (screenShareRef.current) {
        screenShareRef.current.srcObject = null;
      }
    };
  }, [room, isScreenSharing]);

  // Attach audio for remote participants
  useEffect(() => {
    if (!room) return;

    const attachAudioTracks = () => {
      room.remoteParticipants.forEach((participant) => {
        const audioTrack = participant.getTrackPublication(Track.Source.Microphone);
        if (audioTrack?.track) {
          let audioEl = audioRefs.current.get(participant.identity);
          if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.autoplay = true;
            audioRefs.current.set(participant.identity, audioEl);
          }
          audioTrack.track.attach(audioEl);
        }
      });
    };

    attachAudioTracks();

    room.on('trackSubscribed', attachAudioTracks);
    room.on('participantConnected', attachAudioTracks);

    return () => {
      room.off('trackSubscribed', attachAudioTracks);
      room.off('participantConnected', attachAudioTracks);
      // Clean up audio elements
      audioRefs.current.forEach((el) => {
        el.srcObject = null;
      });
      audioRefs.current.clear();
    };
  }, [room]);

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

  const handleToggleScreenShare = async () => {
    try {
      await toggleScreenShare();
    } catch (error) {
      console.error('Failed to toggle screen share:', error);
    }
  };

  // Handle screen share button click - show menu if already sharing
  const handleScreenShareClick = () => {
    if (isScreenSharing) {
      setShowScreenShareMenu(!showScreenShareMenu);
    } else {
      handleToggleScreenShare();
    }
  };

  // Stop current screen share
  const handleStopScreenShare = async () => {
    setShowScreenShareMenu(false);
    try {
      await toggleScreenShare();
    } catch (error) {
      console.error('Failed to stop screen share:', error);
    }
  };

  // Share a different screen (stop current, then start new)
  const handleShareDifferentScreen = async () => {
    setShowScreenShareMenu(false);
    try {
      await toggleScreenShare();
      setTimeout(async () => {
        await toggleScreenShare();
      }, 100);
    } catch (error) {
      console.error('Failed to share different screen:', error);
    }
  };

  const handleEndCall = async () => {
    try {
      await endCall();
    } catch (error) {
      console.error('Failed to end call:', error);
    }
  };

  // Handle recording toggle
  const handleToggleRecording = async () => {
    if (isRecordingStarting || isRecordingStopping) return;

    try {
      if (isRecording) {
        // Stop recording
        const targetRecording = recordingState?.activeRecording || callRecording;
        await stopRecording(targetRecording);
      } else {
        // Start recording
        if (!userEmail || !userName) {
          console.error('Cannot start recording: Missing user info');
          return;
        }
        // If screen sharing is active, record as video regardless of call type
        await startRecording(
          call,
          userEmail,
          userName,
          channelName || 'Unknown Channel',
          isScreenSharing
        );
      }
    } catch (error) {
      console.error('Failed to toggle recording:', error);
    }
  };

  const handleSelectMic = async (deviceId: string) => {
    try {
      if (room) {
        await room.switchActiveDevice('audioinput', deviceId);
        setSelectedMic(deviceId);
      }
      setShowMicMenu(false);
    } catch (error) {
      console.error('Failed to switch microphone:', error);
    }
  };

  const handleSelectCamera = async (deviceId: string) => {
    try {
      if (room) {
        await room.switchActiveDevice('videoinput', deviceId);
        setSelectedCamera(deviceId);
      }
      setShowCameraMenu(false);
    } catch (error) {
      console.error('Failed to switch camera:', error);
    }
  };

  const isVideoCall = call.type === 'video';

  return (
    <div className="compact-call-widget">
      {/* Local video preview for video calls */}
      {isVideoCall && (
        <div className={`call-video-preview ${isVideoOff ? 'video-off' : ''}`}>
          {isVideoOff ? (
            <VideoOff size={16} className="video-off-icon" />
          ) : (
            <video ref={localVideoRef} className={isMirrored && backgroundMode !== 'image' ? 'mirrored' : ''} autoPlay playsInline muted />
          )}
        </div>
      )}

      {/* Call timer */}
      <div className="call-timer-section">
        <span className="call-timer">{formatCallDuration(duration)}</span>
      </div>

      {/* Controls */}
      <div className="call-controls-compact">
        {/* Mic button with dropdown */}
        <div className="control-group" ref={micMenuRef}>
          <button
            className={`call-control-btn ${isMuted ? 'muted' : ''}`}
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            className="call-control-dropdown"
            onClick={() => setShowMicMenu(!showMicMenu)}
            title="Select microphone"
          >
            <ChevronDown size={12} />
          </button>
          {showMicMenu && audioDevices.length > 0 && (
            <div className="device-menu">
              <div className="device-menu-title">Select Microphone</div>
              {audioDevices.map((device) => (
                <button
                  key={device.deviceId}
                  className={`device-option ${selectedMic === device.deviceId ? 'selected' : ''}`}
                  onClick={() => handleSelectMic(device.deviceId)}
                >
                  {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Camera button with dropdown */}
        <div className="control-group" ref={cameraMenuRef}>
          <button
            className={`call-control-btn ${isVideoOff ? 'video-off' : ''}`}
            onClick={handleToggleVideo}
            title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
          >
            {isVideoOff ? <VideoOff size={18} /> : <Video size={18} />}
          </button>
          <button
            className="call-control-dropdown"
            onClick={() => setShowCameraMenu(!showCameraMenu)}
            title="Select camera"
          >
            <ChevronDown size={12} />
          </button>
          {showCameraMenu && videoDevices.length > 0 && (
            <div className="device-menu">
              <div className="device-menu-title">Select Camera</div>
              {videoDevices.map((device) => (
                <button
                  key={device.deviceId}
                  className={`device-option ${selectedCamera === device.deviceId ? 'selected' : ''}`}
                  onClick={() => handleSelectCamera(device.deviceId)}
                >
                  {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                </button>
              ))}
              <div className="device-menu-divider" />
              <button
                className={`device-option blur-toggle ${isBackgroundBlurred ? 'active' : ''}`}
                onClick={() => setBackgroundMode(isBackgroundBlurred ? 'none' : 'blur')}
              >
                <span className="blur-toggle-icon">{isBackgroundBlurred ? '✓' : ''}</span>
                Blur bkg
              </button>
              <button
                className="device-option select-bg-btn"
                onClick={() => {
                  setShowCameraMenu(false);
                  setShowBackgroundSelector(true);
                }}
              >
                <Image size={14} />
                Select bkg
              </button>
            </div>
          )}
        </div>

        <div className="control-divider" />

        {/* Screen share with dropdown */}
        <div className="screen-share-group" ref={screenShareMenuRef}>
          <button
            className={`call-control-btn ${isScreenSharing ? 'screen-sharing' : ''}`}
            onClick={handleScreenShareClick}
            title={isScreenSharing ? 'Screen share options' : 'Share screen'}
          >
            <Monitor size={18} />
          </button>

          {/* Screen share dropdown menu */}
          {showScreenShareMenu && isScreenSharing && (
            <div className="screen-share-menu compact">
              <button className="screen-share-menu-item" onClick={handleStopScreenShare}>
                <MonitorOff size={16} />
                <span>Stop sharing</span>
              </button>
              <button className="screen-share-menu-item" onClick={handleShareDifferentScreen}>
                <Monitor size={16} />
                <span>Share different screen</span>
              </button>
            </div>
          )}
        </div>

        {/* Screen share preview */}
        {isScreenSharing && (
          <div className="call-screen-preview">
            <video ref={screenShareRef} autoPlay playsInline muted />
          </div>
        )}

        {/* Record button */}
        <button
          className={`call-control-btn ${isRecording ? 'recording' : ''} ${isRecordingStarting || isRecordingStopping ? 'loading' : ''}`}
          onClick={handleToggleRecording}
          disabled={isRecordingStarting || isRecordingStopping}
          title={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording ? <Square size={18} /> : <Circle size={18} />}
        </button>

        <div className="control-divider" />

        {/* End call */}
        <button
          className="call-control-btn end-call"
          onClick={handleEndCall}
          title="End call"
        >
          <PhoneOff size={18} />
        </button>

        <div className="control-divider" />

        {/* Expand to full screen */}
        <button
          className="call-control-btn expand"
          onClick={onExpand}
          title="Expand call"
        >
          <Maximize2 size={18} />
        </button>
      </div>

      {/* Background Selector Modal */}
      <BackgroundSelectorModal
        isOpen={showBackgroundSelector}
        onClose={() => setShowBackgroundSelector(false)}
        teamId={call.teamId}
        userEmail={userEmail || ''}
      />
    </div>
  );
}
