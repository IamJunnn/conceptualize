/**
 * CallOverlay - Active call UI overlay
 * Shows participants, video feeds, and call controls
 * Features: Full-screen mode, Speaker/Gallery layouts, Connection quality indicator
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Monitor,
  MonitorOff,
  Users,
  Minimize2,
  Maximize2,
  LayoutTemplate,
  Grid3X3,
  Circle,
  Square,
  ChevronDown,
  Image,
} from 'lucide-react';
import { Track, Room, ConnectionQuality, Participant } from 'livekit-client';
import { Call, CallParticipant, formatCallDuration } from '../../../services/callTypes';
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
import './CallOverlay.css';

// Layout modes
type LayoutMode = 'speaker' | 'gallery' | 'screenshare';

interface CallOverlayProps {
  call: Call;
  participants: CallParticipant[];
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  onMinimize?: () => void;
  currentUserEmail: string;
  currentUserName: string;
  channelName: string;
}

export default function CallOverlay({
  call,
  participants,
  isMuted,
  isVideoOff,
  isScreenSharing,
  onMinimize,
  currentUserEmail,
  currentUserName,
  channelName,
}: CallOverlayProps) {
  const [duration, setDuration] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>('gallery');
  const [previousLayout, setPreviousLayout] = useState<LayoutMode>('gallery');
  const [pinnedParticipant, setPinnedParticipant] = useState<string | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [showScreenShareMenu, setShowScreenShareMenu] = useState(false);
  const [showMicMenu, setShowMicMenu] = useState(false);
  const [showCameraMenu, setShowCameraMenu] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>('');
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [recordingState, setRecordingState] = useState<RecordingState | null>(null);
  const [callRecording, setCallRecording] = useState<Recording | null>(null);
  const [backgroundMode, setBackgroundModeState] = useState<BackgroundMode>('none');
  const [showBackgroundSelector, setShowBackgroundSelector] = useState(false);
  const [isMirrored, setIsMirrored] = useState(getMirrorMode());
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const screenShareMenuRef = useRef<HTMLDivElement>(null);
  const micMenuRef = useRef<HTMLDivElement>(null);
  const cameraMenuRef = useRef<HTMLDivElement>(null);
  const room = getRoom();

  // Determine if recording is active (either from local state or call subscription)
  const isRecording = recordingState?.isRecording || !!callRecording;
  const recordingStartedBy = callRecording?.startedByName || recordingState?.activeRecording?.startedByName;

  // Derive blur state from background mode
  const isBackgroundBlurred = backgroundMode === 'blur';

  // Find participant who is screen sharing
  const screenSharingParticipant = participants.find(p => p.isScreenSharing);
  const anyoneScreenSharing = !!screenSharingParticipant || isScreenSharing;

  // Subscribe to background mode changes
  useEffect(() => {
    const unsubscribe = subscribeToBackgroundMode((mode) => {
      setBackgroundModeState(mode);
    });
    return unsubscribe;
  }, []);

  // Subscribe to mirror mode changes
  useEffect(() => {
    const unsubscribe = subscribeToMirrorMode((mirrored) => {
      setIsMirrored(mirrored);
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

  // Hide controls after inactivity
  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (screenShareMenuRef.current && !screenShareMenuRef.current.contains(e.target as Node)) {
        setShowScreenShareMenu(false);
      }
      if (micMenuRef.current && !micMenuRef.current.contains(e.target as Node)) {
        setShowMicMenu(false);
      }
      if (cameraMenuRef.current && !cameraMenuRef.current.contains(e.target as Node)) {
        setShowCameraMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Track active speaker from LiveKit
  useEffect(() => {
    if (!room) return;

    const handleActiveSpeakerChange = (speakers: Participant[]) => {
      if (speakers.length > 0) {
        setActiveSpeaker(speakers[0].identity);
      }
    };

    room.on('activeSpeakersChanged', handleActiveSpeakerChange);
    return () => {
      room.off('activeSpeakersChanged', handleActiveSpeakerChange);
    };
  }, [room]);

  // Auto-switch to screenshare layout when someone starts sharing
  useEffect(() => {
    if (anyoneScreenSharing && layout !== 'screenshare') {
      setPreviousLayout(layout);
      setLayout('screenshare');
    } else if (!anyoneScreenSharing && layout === 'screenshare') {
      // Restore previous layout when screen sharing stops
      setLayout(previousLayout);
    }
  }, [anyoneScreenSharing]);

  // Subscribe to local recording state
  useEffect(() => {
    const unsubscribe = subscribeToRecordingState((state) => {
      setRecordingState(state);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to call recording (to see if someone else started recording)
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


  // Fullscreen handlers
  const enterFullscreen = useCallback(async () => {
    try {
      if (overlayRef.current) {
        await overlayRef.current.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Exit fullscreen error:', err);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  // Pin/unpin participant (for speaker view)
  const handlePinParticipant = (email: string) => {
    if (pinnedParticipant === email) {
      setPinnedParticipant(null);
    } else {
      setPinnedParticipant(email);
      setLayout('speaker'); // Auto-switch to speaker view when pinning
    }
  };

  const handleEndCall = async () => {
    try {
      await endCall();
    } catch (error) {
      console.error('Failed to end call:', error);
    }
  };

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

  // Handle recording toggle
  const handleToggleRecording = async () => {
    try {
      if (isRecording) {
        // Check activeRecording first (always current), then callRecording (Firestore subscription)
        const recordingToStop = recordingState?.activeRecording || callRecording;
        await stopRecording(recordingToStop);
      } else {
        // Check if anyone is screen sharing - if so, record as video regardless of call type
        const anyoneIsSharing = isScreenSharing || participants.some(p => p.isScreenSharing);
        await startRecording(call, currentUserEmail, currentUserName, channelName, anyoneIsSharing);
      }
    } catch (error) {
      console.error('Failed to toggle recording:', error);
    }
  };

  // Stop current screen share
  const handleStopScreenShare = async () => {
    setShowScreenShareMenu(false);
    try {
      await toggleScreenShare(); // This will stop the current share
    } catch (error) {
      console.error('Failed to stop screen share:', error);
    }
  };

  // Share a different screen (stop current, then start new)
  const handleShareDifferentScreen = async () => {
    setShowScreenShareMenu(false);
    try {
      // First stop current share
      await toggleScreenShare();
      // Small delay then start new share
      setTimeout(async () => {
        await toggleScreenShare();
      }, 100);
    } catch (error) {
      console.error('Failed to share different screen:', error);
    }
  };

  // Handle device selection
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

  const handleMinimize = () => {
    setIsMinimized(true);
    onMinimize?.();
  };

  const handleMaximize = () => {
    setIsMinimized(false);
  };

  const isVideoCall = call.type === 'video';

  // Minimized view (picture-in-picture style)
  if (isMinimized) {
    return (
      <div className="call-overlay-minimized" onClick={handleMaximize}>
        <div className="minimized-info">
          <div className="minimized-icon">
            {isVideoCall ? <Video size={18} /> : <Mic size={18} />}
          </div>
          <div className="minimized-duration">{formatCallDuration(duration)}</div>
          <div className="minimized-participants">
            <Users size={14} />
            <span>{participants.length}</span>
          </div>
        </div>
        <button className="minimized-expand" title="Expand">
          <Maximize2 size={16} />
        </button>
      </div>
    );
  }

  // Get the main speaker for speaker view
  const mainSpeaker = pinnedParticipant
    ? participants.find(p => p.email === pinnedParticipant)
    : activeSpeaker
      ? participants.find(p => p.email === activeSpeaker)
      : participants[0];

  const otherParticipants = mainSpeaker
    ? participants.filter(p => p.email !== mainSpeaker.email)
    : participants.slice(1);

  return (
    <div className="call-overlay" ref={overlayRef}>
      {/* Call header */}
      <div className={`call-header ${showControls ? 'visible' : ''}`}>
        <div className="call-info">
          <div className="call-type">
            {isVideoCall ? <Video size={18} /> : <Mic size={18} />}
            <span>{isVideoCall ? 'Video Call' : 'Voice Call'}</span>
          </div>
          <div className="call-duration">{formatCallDuration(duration)}</div>
          {/* Recording indicator */}
          {isRecording && (
            <div className="recording-indicator">
              <Circle size={10} fill="#ef4444" className="recording-dot" />
              <span>Recording{recordingStartedBy ? ` by ${recordingStartedBy}` : ''}</span>
            </div>
          )}
        </div>

        <div className="call-header-controls">
          {/* Layout toggle */}
          <div className="layout-toggle">
            {anyoneScreenSharing && (
              <button
                className={`layout-btn ${layout === 'screenshare' ? 'active' : ''}`}
                onClick={() => setLayout('screenshare')}
                title="Screen Share View"
              >
                <Monitor size={18} />
              </button>
            )}
            <button
              className={`layout-btn ${layout === 'speaker' ? 'active' : ''}`}
              onClick={() => setLayout('speaker')}
              title="Speaker View"
            >
              <LayoutTemplate size={18} />
            </button>
            <button
              className={`layout-btn ${layout === 'gallery' ? 'active' : ''}`}
              onClick={() => setLayout('gallery')}
              title="Gallery View"
            >
              <Grid3X3 size={18} />
            </button>
          </div>

          {/* Fullscreen toggle */}
          <button
            className="header-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            <Maximize2 size={20} />
          </button>

          {/* Minimize */}
          <button className="header-btn" onClick={handleMinimize} title="Minimize">
            <Minimize2 size={20} />
          </button>
        </div>
      </div>

      {/* Participants - Speaker View */}
      {layout === 'speaker' && participants.length > 0 && (
        <div className="call-participants speaker-layout">
          {/* Main speaker */}
          <div className="main-speaker">
            {mainSpeaker && (
              <ParticipantTile
                participant={mainSpeaker}
                isVideoCall={isVideoCall}
                room={room}
                isMainSpeaker
                isPinned={pinnedParticipant === mainSpeaker.email}
                onPin={handlePinParticipant}
                onDoubleClick={() => handlePinParticipant(mainSpeaker.email)}
                isMirrored={isMirrored}
                backgroundMode={backgroundMode}
              />
            )}
          </div>

          {/* Filmstrip of others */}
          {otherParticipants.length > 0 && (
            <div className="speaker-filmstrip">
              {otherParticipants.map((participant) => (
                <ParticipantTile
                  key={participant.email}
                  participant={participant}
                  isVideoCall={isVideoCall}
                  room={room}
                  onPin={handlePinParticipant}
                  onDoubleClick={() => handlePinParticipant(participant.email)}
                  isMirrored={isMirrored}
                  backgroundMode={backgroundMode}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Participants - Gallery View */}
      {layout === 'gallery' && (
        <div className={`call-participants gallery-layout gallery-${Math.min(participants.length, 9)}`}>
          {participants.map((participant) => (
            <ParticipantTile
              key={participant.email}
              participant={participant}
              isVideoCall={isVideoCall}
              room={room}
              onPin={handlePinParticipant}
              onDoubleClick={() => handlePinParticipant(participant.email)}
              isMirrored={isMirrored}
              backgroundMode={backgroundMode}
            />
          ))}
        </div>
      )}

      {/* Participants - Screen Share View */}
      {layout === 'screenshare' && anyoneScreenSharing && (
        <div className="call-participants screenshare-layout">
          {/* Main screen share view */}
          <div className="screenshare-main">
            <ScreenShareTile
              sharingParticipant={screenSharingParticipant}
              room={room}
              isLocalSharing={isScreenSharing}
            />
          </div>

          {/* Filmstrip of all participants */}
          <div className="screenshare-filmstrip">
            {participants.map((participant) => (
              <ParticipantTile
                key={participant.email}
                participant={participant}
                isVideoCall={isVideoCall}
                room={room}
                onPin={handlePinParticipant}
                onDoubleClick={() => handlePinParticipant(participant.email)}
                isMirrored={isMirrored}
                backgroundMode={backgroundMode}
              />
            ))}
          </div>
        </div>
      )}

      {/* Call controls */}
      <div className={`call-controls ${showControls ? 'visible' : ''}`}>
        {/* Mic button with dropdown */}
        <div className="control-group" ref={micMenuRef}>
          <button
            className={`control-btn ${isMuted ? 'muted' : ''}`}
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>
          <button
            className="control-dropdown"
            onClick={() => setShowMicMenu(!showMicMenu)}
            title="Select microphone"
          >
            <ChevronDown size={14} />
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
            className={`control-btn ${isVideoOff ? 'video-off' : ''}`}
            onClick={handleToggleVideo}
            title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
          >
            {isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
          </button>
          <button
            className="control-dropdown"
            onClick={() => setShowCameraMenu(!showCameraMenu)}
            title="Select camera"
          >
            <ChevronDown size={14} />
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

        {/* Screen share button */}
        <div className="screen-share-control" ref={screenShareMenuRef}>
          <button
            className={`control-btn ${isScreenSharing ? 'screen-sharing' : ''}`}
            onClick={handleScreenShareClick}
            title={isScreenSharing ? 'Screen share options' : 'Share screen'}
          >
            <Monitor size={22} />
          </button>

          {/* Screen share dropdown menu */}
          {showScreenShareMenu && isScreenSharing && (
            <div className="screen-share-menu">
              <button className="screen-share-menu-item" onClick={handleStopScreenShare}>
                <MonitorOff size={18} />
                <span>Stop sharing</span>
              </button>
              <button className="screen-share-menu-item" onClick={handleShareDifferentScreen}>
                <Monitor size={18} />
                <span>Share different screen</span>
              </button>
            </div>
          )}
        </div>

        {/* Record button */}
        <button
          className={`control-btn ${isRecording ? 'recording' : ''}`}
          onClick={handleToggleRecording}
          disabled={recordingState?.isStarting || recordingState?.isStopping}
          title={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording ? <Square size={20} fill="#ef4444" /> : <Circle size={24} />}
        </button>

        <div className="control-divider" />

        {/* End call */}
        <button
          className="control-btn end-call"
          onClick={handleEndCall}
          title="End call"
        >
          <PhoneOff size={24} />
        </button>
      </div>

      {/* Background Selector Modal */}
      <BackgroundSelectorModal
        isOpen={showBackgroundSelector}
        onClose={() => setShowBackgroundSelector(false)}
        teamId={call.teamId}
        userEmail={currentUserEmail}
      />
    </div>
  );
}

// Connection Quality Indicator Component
function ConnectionQualityIndicator({ quality }: { quality: ConnectionQuality }) {
  const getQualityInfo = () => {
    switch (quality) {
      case ConnectionQuality.Excellent:
        return { bars: 4, color: '#22c55e', label: 'Excellent' };
      case ConnectionQuality.Good:
        return { bars: 3, color: '#22c55e', label: 'Good' };
      case ConnectionQuality.Poor:
        return { bars: 2, color: '#eab308', label: 'Poor' };
      case ConnectionQuality.Lost:
        return { bars: 1, color: '#ef4444', label: 'Lost' };
      default:
        return { bars: 0, color: '#6b7280', label: 'Unknown' };
    }
  };

  const { bars, color, label } = getQualityInfo();

  return (
    <div className="connection-quality" title={`Connection: ${label}`}>
      {[1, 2, 3, 4].map((bar) => (
        <div
          key={bar}
          className="quality-bar"
          style={{
            height: `${bar * 3 + 2}px`,
            backgroundColor: bar <= bars ? color : 'rgba(255,255,255,0.2)',
          }}
        />
      ))}
    </div>
  );
}

// Individual participant tile
interface ParticipantTileProps {
  participant: CallParticipant;
  isVideoCall: boolean;
  room: Room | null;
  isMainSpeaker?: boolean;
  isPinned?: boolean;
  onPin?: (email: string) => void;
  onDoubleClick?: () => void;
  isMirrored?: boolean;
  backgroundMode?: BackgroundMode;
}

function ParticipantTile({
  participant,
  isVideoCall: _isVideoCall,
  room,
  isMainSpeaker,
  isPinned,
  onPin,
  onDoubleClick,
  isMirrored = true,
  backgroundMode = 'none',
}: ParticipantTileProps) {
  void _isVideoCall; // Reserved for conditional video-specific UI
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(ConnectionQuality.Unknown);
  const [isLocal, setIsLocal] = useState(false);

  // Attach video and audio tracks for this participant
  useEffect(() => {
    if (!room) return;

    const attachTracks = () => {
      // Find participant in room
      const isLocalParticipant = participant.email === room.localParticipant.identity;
      setIsLocal(isLocalParticipant);
      const roomParticipant = isLocalParticipant
        ? room.localParticipant
        : Array.from(room.remoteParticipants.values()).find(p => p.identity === participant.email);

      if (!roomParticipant) return;

      // Update connection quality
      setConnectionQuality(roomParticipant.connectionQuality);

      // Attach camera track to video element
      if (videoRef.current) {
        const cameraTrack = roomParticipant.getTrackPublication(Track.Source.Camera);
        if (cameraTrack?.track && !cameraTrack.isMuted) {
          // Detach from any previous elements first, then attach to this one
          cameraTrack.track.detach();
          cameraTrack.track.attach(videoRef.current);
        }
      }

      // Attach audio track for remote participants only
      if (!isLocalParticipant && audioRef.current) {
        const audioTrack = roomParticipant.getTrackPublication(Track.Source.Microphone);
        if (audioTrack?.track) {
          audioTrack.track.attach(audioRef.current);
        }
      }
    };

    // Small delay to ensure component is fully mounted and previous elements detached
    const attachTimeout = setTimeout(() => {
      attachTracks();
    }, 50);

    // Re-attach on track changes
    const handleTrackChange = () => attachTracks();
    room.on('trackSubscribed', handleTrackChange);
    room.on('trackUnsubscribed', handleTrackChange);
    room.on('trackMuted', handleTrackChange);
    room.on('trackUnmuted', handleTrackChange);
    room.on('localTrackPublished', handleTrackChange);

    // Listen for connection quality changes
    const handleQualityChange = () => {
      const isLocal = participant.email === room.localParticipant.identity;
      const roomParticipant = isLocal
        ? room.localParticipant
        : Array.from(room.remoteParticipants.values()).find(p => p.identity === participant.email);
      if (roomParticipant) {
        setConnectionQuality(roomParticipant.connectionQuality);
      }
    };
    room.on('connectionQualityChanged', handleQualityChange);

    return () => {
      clearTimeout(attachTimeout);
      room.off('trackSubscribed', handleTrackChange);
      room.off('trackUnsubscribed', handleTrackChange);
      room.off('trackMuted', handleTrackChange);
      room.off('trackUnmuted', handleTrackChange);
      room.off('localTrackPublished', handleTrackChange);
      room.off('connectionQualityChanged', handleQualityChange);
    };
  }, [room, participant.email, participant.isVideoOff]);

  // Show video whenever camera is on (even in voice calls that upgrade to video)
  const showVideo = !participant.isVideoOff;

  const tileClasses = [
    'participant-tile',
    participant.isSpeaking && 'speaking',
    isMainSpeaker && 'main-speaker-tile',
    isPinned && 'pinned',
  ].filter(Boolean).join(' ');

  return (
    <div className={tileClasses} onDoubleClick={onDoubleClick}>
      {/* Hidden audio element for remote participants */}
      {!isLocal && <audio ref={audioRef} autoPlay />}

      {showVideo ? (
        <video
          ref={videoRef}
          className={`participant-video ${isLocal && isMirrored && backgroundMode !== 'image' ? 'mirrored' : ''}`}
          autoPlay
          playsInline
          muted={isLocal}
        />
      ) : (
        <div className="participant-avatar">
          {participant.photoURL ? (
            <img src={participant.photoURL} alt={participant.name} />
          ) : (
            <span>{participant.name.substring(0, 2).toUpperCase()}</span>
          )}
        </div>
      )}

      {/* Connection quality indicator - top left */}
      <div className="tile-top-left">
        <ConnectionQualityIndicator quality={connectionQuality} />
      </div>

      {/* Pin indicator - top right (show on hover) */}
      {onPin && (
        <div className="tile-top-right">
          <button
            className={`pin-btn ${isPinned ? 'pinned' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onPin(participant.email);
            }}
            title={isPinned ? 'Unpin' : 'Pin'}
          >
            <LayoutTemplate size={14} />
          </button>
        </div>
      )}

      <div className="participant-info">
        <span className="participant-name">
          {participant.name}
          {isLocal && ' (You)'}
        </span>
        <div className="participant-status">
          {participant.isMuted && <MicOff size={14} />}
          {participant.isVideoOff && <VideoOff size={14} />}
          {participant.isScreenSharing && <Monitor size={14} />}
        </div>
      </div>

      {participant.isSpeaking && <div className="speaking-indicator" />}
    </div>
  );
}

// Screen Share Tile Component
interface ScreenShareTileProps {
  sharingParticipant?: CallParticipant;
  room: Room | null;
  isLocalSharing: boolean;
}

function ScreenShareTile({ sharingParticipant, room, isLocalSharing }: ScreenShareTileProps) {
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!room || !screenVideoRef.current) return;

    const attachScreenShare = () => {
      if (!screenVideoRef.current) return;

      // If local is sharing, attach local screen share track
      if (isLocalSharing) {
        const localScreenTrack = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
        if (localScreenTrack?.track) {
          localScreenTrack.track.detach();
          localScreenTrack.track.attach(screenVideoRef.current);
        }
        return;
      }

      // Otherwise find remote participant who is sharing
      if (sharingParticipant) {
        const remoteParticipant = Array.from(room.remoteParticipants.values())
          .find(p => p.identity === sharingParticipant.email);

        if (remoteParticipant) {
          const screenTrack = remoteParticipant.getTrackPublication(Track.Source.ScreenShare);
          if (screenTrack?.track) {
            screenTrack.track.detach();
            screenTrack.track.attach(screenVideoRef.current);
          }
        }
      }
    };

    // Attach with small delay
    const timeout = setTimeout(attachScreenShare, 50);

    // Listen for track changes
    room.on('trackSubscribed', attachScreenShare);
    room.on('trackUnsubscribed', attachScreenShare);
    room.on('localTrackPublished', attachScreenShare);

    return () => {
      clearTimeout(timeout);
      room.off('trackSubscribed', attachScreenShare);
      room.off('trackUnsubscribed', attachScreenShare);
      room.off('localTrackPublished', attachScreenShare);
    };
  }, [room, sharingParticipant, isLocalSharing]);

  const sharerName = isLocalSharing ? 'You' : sharingParticipant?.name || 'Someone';

  return (
    <div className="screenshare-tile">
      <video
        ref={screenVideoRef}
        className="screenshare-video"
        autoPlay
        playsInline
      />
      <div className="screenshare-info">
        <Monitor size={16} />
        <span>{sharerName}'s screen</span>
      </div>
    </div>
  );
}
