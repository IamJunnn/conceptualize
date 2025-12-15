/**
 * RecordingsPanel - View and manage call recordings
 * Shows list of past recordings with playback, download, and delete options
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video,
  Mic,
  Download,
  Trash2,
  Clock,
  Loader2,
  AlertCircle,
  Circle,
  X,
  Forward,
  CheckSquare,
  Square,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  Lock,
  Zap,
  History,
  MonitorPlay,
} from 'lucide-react';
import {
  Recording,
  RecordingState,
  formatRecordingDuration,
  formatRecordingSize,
} from '../../services/recordingTypes';
import {
  subscribeToTeamRecordings,
  deleteRecording,
  subscribeToRecordingState,
  fixRecordingsWithoutUrl,
} from '../../services/recordingService';
import { subscribeToChannels, getOrCreateDMChannel } from '../../services/teamChatService';
import { Channel, SharedRecording } from '../../services/teamChatTypes';
import ConfirmModal from '../UI/ConfirmModal';
import ShareToChatModal from './Chat/ShareToChatModal';
import { TeamMember } from '../../services/teamService';
import './RecordingsPanel.css';

interface RecordingsPanelProps {
  teamId: string;
  currentUserEmail: string;
  teamMembers?: { [email: string]: TeamMember };
  // Auto-play a specific recording when navigating from shared recording in chat
  autoPlayRecordingId?: string | null;
  onAutoPlayComplete?: () => void;
  // Pro feature gating
  hasPaidAccess?: boolean;
  onUpgradeClick?: () => void;
}

type FilterType = 'all' | 'video' | 'voice';

// Format date as MM.DD-HH:MM AM/PM
const formatExactTime = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // Handle midnight
  return `${month}.${day}-${hours}:${minutes} ${ampm}`;
};

// Format participants as "Call with A and B" or "Call with A, B, and C"
const formatParticipants = (
  participants: string[] | undefined,
  participantNames?: string[],
  teamMembers?: { [email: string]: TeamMember }
): string => {
  if (!participants || participants.length === 0) return 'Call recording';

  // Use display names if available, otherwise look up from team members, or extract from email
  const names = participants.map((email, index) => {
    // First check if we have a stored display name
    if (participantNames && participantNames[index]) {
      return participantNames[index];
    }
    // Then try to look up from team members
    const normalizedEmail = email.toLowerCase();
    if (teamMembers && teamMembers[normalizedEmail]?.displayName) {
      return teamMembers[normalizedEmail].displayName;
    }
    // Fallback to extracting name from email
    const name = email.split('@')[0];
    // Capitalize first letter
    return name.charAt(0).toUpperCase() + name.slice(1);
  });

  if (names.length === 1) return `Call with ${names[0]}`;
  if (names.length === 2) return `Call with ${names[0]} and ${names[1]}`;

  const lastPerson = names.pop();
  return `Call with ${names.join(', ')}, and ${lastPerson}`;
};

const RecordingsPanel: React.FC<RecordingsPanelProps> = ({
  teamId,
  currentUserEmail,
  teamMembers,
  autoPlayRecordingId,
  onAutoPlayComplete,
  hasPaidAccess = true,
  onUpgradeClick,
}) => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [activeRecordingState, setActiveRecordingState] = useState<RecordingState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Recording | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeRecordingDuration, setActiveRecordingDuration] = useState(0);
  const [filter, setFilter] = useState<FilterType>('all');
  const [videoModalRecording, setVideoModalRecording] = useState<Recording | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [shareRecording, setShareRecording] = useState<Recording | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);

  // Video player state
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoVolume, setVideoVolume] = useState(1);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);
  const [showVideoControls, setShowVideoControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedRecordings, setSelectedRecordings] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Subscribe to recordings list
  useEffect(() => {
    setIsLoading(true);
    setError(null);

    const unsubscribe = subscribeToTeamRecordings(
      teamId,
      (newRecordings) => {
        setRecordings(newRecordings);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [teamId]);

  // Subscribe to active recording state
  useEffect(() => {
    const unsubscribe = subscribeToRecordingState((state) => {
      setActiveRecordingState(state);
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to channels for forward modal
  useEffect(() => {
    const unsubscribe = subscribeToChannels(teamId, (newChannels) => {
      setChannels(newChannels);
    });

    return () => unsubscribe();
  }, [teamId]);

  // Auto-fix recordings missing fileUrl (handles recording, processing, completed statuses)
  useEffect(() => {
    const recordingsWithoutUrl = recordings.filter(r => !r.fileUrl && r.status !== 'failed');
    if (recordingsWithoutUrl.length > 0 && !isLoading) {
      fixRecordingsWithoutUrl(teamId).catch(err => {
        console.error('Failed to auto-fix recordings:', err);
      });
    }
  }, [recordings, teamId, isLoading]);

  // Track active recording duration
  useEffect(() => {
    if (!activeRecordingState?.isRecording || !activeRecordingState.activeRecording) {
      setActiveRecordingDuration(0);
      return;
    }

    const startTime = activeRecordingState.activeRecording.startedAt.getTime();
    setActiveRecordingDuration(Math.floor((Date.now() - startTime) / 1000));

    const interval = setInterval(() => {
      setActiveRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [activeRecordingState?.isRecording, activeRecordingState?.activeRecording?.startedAt]);

  // Auto-play a recording when navigating from a shared recording in chat
  useEffect(() => {
    if (autoPlayRecordingId && recordings.length > 0 && !isLoading) {
      const recordingToPlay = recordings.find(r => r.id === autoPlayRecordingId);
      if (recordingToPlay && recordingToPlay.fileUrl) {
        if (recordingToPlay.type === 'video') {
          // Open video modal
          setVideoModalRecording(recordingToPlay);
        } else {
          // For audio, start playback directly
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
          }
          const audio = new Audio(recordingToPlay.fileUrl);
          audio.play();
          audio.onended = () => setPlayingId(null);
          audioRef.current = audio;
          setPlayingId(recordingToPlay.id);
        }
        // Clear the auto-play request
        onAutoPlayComplete?.();
      }
    }
  }, [autoPlayRecordingId, recordings, isLoading, onAutoPlayComplete]);

  // Filter recordings
  const filteredRecordings = recordings.filter(rec => {
    if (filter === 'all') return true;
    if (filter === 'video') return rec.type === 'video';
    if (filter === 'voice') return rec.type === 'audio';
    return true;
  });

  // Count by type
  const videoCount = recordings.filter(r => r.type === 'video').length;
  const voiceCount = recordings.filter(r => r.type === 'audio').length;

  // Handle play/pause
  const handlePlayPause = (recording: Recording) => {
    if (!recording.fileUrl) return;

    if (recording.type === 'video') {
      // Open video modal
      setVideoModalRecording(recording);
    } else {
      // Handle audio playback
      if (playingId === recording.id) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        setPlayingId(null);
      } else {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        const audio = new Audio(recording.fileUrl);
        audio.play();
        audio.onended = () => setPlayingId(null);
        audioRef.current = audio;
        setPlayingId(recording.id);
      }
    }
  };

  // Handle card click - play if file URL exists (regardless of status)
  const handleCardClick = (recording: Recording) => {
    if (recording.fileUrl) {
      if (recording.type === 'video') {
        setVideoModalRecording(recording);
      } else {
        handlePlayPause(recording);
      }
    }
  };

  // Handle download
  const handleDownload = async (recording: Recording, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!recording.fileUrl) return;

    const fileName = recording.fileName || `recording-${recording.id}.${recording.type === 'video' ? 'mp4' : 'ogg'}`;

    try {
      // Try using Tauri's download API if available
      const { invoke } = await import('@tauri-apps/api/core');
      const { downloadDir } = await import('@tauri-apps/api/path');

      const downloadsPath = await downloadDir();
      // Use path.join equivalent - downloadDir already has trailing separator
      const savePath = downloadsPath.endsWith('\\') || downloadsPath.endsWith('/')
        ? `${downloadsPath}${fileName}`
        : `${downloadsPath}\\${fileName}`;

      // Use Tauri to download the file
      await invoke('download_file', {
        url: recording.fileUrl,
        savePath: savePath,
      });

      // Show success notification
      try {
        const { sendNotification } = await import('@tauri-apps/plugin-notification');
        await sendNotification({
          title: 'Download Complete',
          body: `Recording saved to Downloads folder`,
        });
      } catch {
        // Fallback to alert if notification fails
        alert(`Downloaded to: ${savePath}`);
      }
    } catch (_tauriErr) {
      // Fallback: Open in new tab (user can right-click save, or it may auto-download)
      const a = document.createElement('a');
      a.href = recording.fileUrl;
      a.download = fileName;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteConfirm) return;

    setIsDeleting(true);
    try {
      await deleteRecording(teamId, deleteConfirm.id);
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete recording:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Multi-select handlers
  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    setSelectedRecordings(new Set());
  };

  const toggleRecordingSelection = (recordingId: string) => {
    const newSelected = new Set(selectedRecordings);
    if (newSelected.has(recordingId)) {
      newSelected.delete(recordingId);
    } else {
      newSelected.add(recordingId);
    }
    setSelectedRecordings(newSelected);
  };

  const selectAllRecordings = () => {
    const filteredIds = filteredRecordings.map(r => r.id);
    setSelectedRecordings(new Set(filteredIds));
  };

  const deselectAllRecordings = () => {
    setSelectedRecordings(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedRecordings.size === 0) return;

    setIsDeleting(true);
    try {
      const deletePromises = Array.from(selectedRecordings).map(id =>
        deleteRecording(teamId, id)
      );
      await Promise.all(deletePromises);
      setSelectedRecordings(new Set());
      setIsSelectMode(false);
      setShowBulkDeleteConfirm(false);
    } catch (err) {
      console.error('Failed to delete recordings:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const allSelected = filteredRecordings.length > 0 &&
    filteredRecordings.every(r => selectedRecordings.has(r.id));

  // Create SharedRecording from Recording
  const createSharedRecording = (recording: Recording): SharedRecording => ({
    recordingId: recording.id,
    title: formatParticipants(recording.participants, recording.participantNames, teamMembers),
    type: recording.type === 'video' ? 'video' : 'audio',
    duration: recording.duration,
    fileUrl: recording.fileUrl || '',
    fileSize: recording.fileSize,
    createdAt: recording.createdAt,
  });

  // Render active recording indicator
  const renderActiveRecording = () => {
    if (!activeRecordingState?.isRecording || !activeRecordingState.activeRecording) {
      return null;
    }

    const recording = activeRecordingState.activeRecording;

    return (
      <div className="active-recording-banner">
        <div className="recording-pulse">
          <Circle size={12} fill="#ef4444" />
        </div>
        <span className="recording-label">Recording in progress</span>
        <span className="recording-duration">{formatRecordingDuration(activeRecordingDuration)}</span>
        <span className="recording-channel">{recording.channelName}</span>
      </div>
    );
  };

  // Render recording item
  const renderRecordingItem = (recording: Recording) => {
    const isProcessing = recording.status === 'processing';
    const isFailed = recording.status === 'failed';
    const isSelected = selectedRecordings.has(recording.id);

    return (
      <div
        key={recording.id}
        className={`recording-item ${isProcessing ? 'processing' : ''} ${isFailed ? 'failed' : ''} ${isSelected ? 'selected' : ''}`}
        onClick={() => isSelectMode ? toggleRecordingSelection(recording.id) : handleCardClick(recording)}
      >
        {isSelectMode && (
          <div
            className="recording-checkbox"
            onClick={(e) => {
              e.stopPropagation();
              toggleRecordingSelection(recording.id);
            }}
          >
            {isSelected ? (
              <CheckSquare size={20} className="checked" />
            ) : (
              <Square size={20} />
            )}
          </div>
        )}
        <div className={`recording-icon ${recording.type === 'video' ? 'video' : 'voice'}`}>
          {recording.type === 'video' ? (
            <Video size={24} />
          ) : (
            <Mic size={24} />
          )}
        </div>

        <div className="recording-info">
          <div className="recording-title">
            {formatParticipants(recording.participants, recording.participantNames, teamMembers)} - {formatExactTime(recording.createdAt)}
          </div>
          <div className="recording-meta">
            {recording.duration !== undefined && (
              <span className="recording-duration-meta">
                <Clock size={12} />
                {formatRecordingDuration(recording.duration)}
              </span>
            )}
            {recording.fileSize !== undefined && recording.fileSize > 0 && (
              <span className="recording-size">
                {formatRecordingSize(recording.fileSize)}
              </span>
            )}
          </div>
          <div className="recording-type-badge">
            {recording.type === 'video' ? 'Video Call' : 'Voice Call'}
          </div>
          {isProcessing && (
            <div className="recording-status processing">
              <Loader2 size={14} className="spin" />
              Processing...
            </div>
          )}
          {isFailed && (
            <div className="recording-status failed">
              <AlertCircle size={14} />
              {recording.error || 'Recording failed'}
            </div>
          )}
        </div>

        <div className="recording-actions">
          <button
            className="recording-action-btn forward"
            onClick={(e) => { e.stopPropagation(); if (recording.fileUrl) setShareRecording(recording); }}
            title={recording.fileUrl ? 'Forward to Chat' : 'No file available'}
            disabled={!recording.fileUrl}
          >
            <Forward size={18} />
          </button>
          <button
            className="recording-action-btn download"
            onClick={(e) => { e.stopPropagation(); if (recording.fileUrl) handleDownload(recording, e); }}
            title={recording.fileUrl ? 'Download' : 'No file available'}
            disabled={!recording.fileUrl}
          >
            <Download size={18} />
          </button>
          <button
            className="recording-action-btn delete"
            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(recording); }}
            title="Delete"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    );
  };

  // Video player controls
  const formatVideoTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVideoPlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (isVideoPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  }, [isVideoPlaying]);

  const handleVideoSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const time = parseFloat(e.target.value);
    videoRef.current.currentTime = time;
    setVideoCurrentTime(time);
  }, []);

  const handleVideoVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const volume = parseFloat(e.target.value);
    videoRef.current.volume = volume;
    setVideoVolume(volume);
    setIsVideoMuted(volume === 0);
  }, []);

  const toggleVideoMute = useCallback(() => {
    if (!videoRef.current) return;
    const newMuted = !isVideoMuted;
    videoRef.current.muted = newMuted;
    setIsVideoMuted(newMuted);
  }, [isVideoMuted]);

  const handleSkip = useCallback((seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(videoDuration, videoRef.current.currentTime + seconds));
  }, [videoDuration]);

  const toggleFullscreen = useCallback(async () => {
    if (!videoContainerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await videoContainerRef.current.requestFullscreen();
        setIsVideoFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsVideoFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  const handleVideoMouseMove = useCallback(() => {
    setShowVideoControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isVideoPlaying) {
        setShowVideoControls(false);
      }
    }, 3000);
  }, [isVideoPlaying]);

  const closeVideoModal = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setVideoModalRecording(null);
    setIsVideoPlaying(false);
    setVideoCurrentTime(0);
    setVideoDuration(0);
    setShowVideoControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
  }, []);

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsVideoFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Smooth progress bar update using requestAnimationFrame
  useEffect(() => {
    const updateProgress = () => {
      if (videoRef.current && isVideoPlaying) {
        setVideoCurrentTime(videoRef.current.currentTime);
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      }
    };

    if (isVideoPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isVideoPlaying]);

  // Keyboard shortcuts for video player
  useEffect(() => {
    if (!videoModalRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          handleVideoPlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleSkip(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleSkip(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (videoRef.current) {
            const newVolume = Math.min(1, videoRef.current.volume + 0.1);
            videoRef.current.volume = newVolume;
            setVideoVolume(newVolume);
            setIsVideoMuted(false);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (videoRef.current) {
            const newVolume = Math.max(0, videoRef.current.volume - 0.1);
            videoRef.current.volume = newVolume;
            setVideoVolume(newVolume);
          }
          break;
        case 'm':
          e.preventDefault();
          toggleVideoMute();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          if (isVideoFullscreen) {
            e.preventDefault();
            document.exitFullscreen();
          } else {
            closeVideoModal();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [videoModalRecording, handleVideoPlayPause, handleSkip, toggleVideoMute, toggleFullscreen, closeVideoModal, isVideoFullscreen]);

  // Render video modal
  const renderVideoModal = () => {
    if (!videoModalRecording || !videoModalRecording.fileUrl) return null;

    return (
      <div className="video-modal-overlay" onClick={closeVideoModal}>
        <div
          className={`video-modal ${isVideoFullscreen ? 'fullscreen' : ''}`}
          onClick={(e) => e.stopPropagation()}
          ref={videoContainerRef}
        >
          {/* Header */}
          <div className={`video-modal-header ${showVideoControls ? 'visible' : 'hidden'}`}>
            <div className="video-modal-title-section">
              <h3>{formatParticipants(videoModalRecording.participants, videoModalRecording.participantNames, teamMembers)}</h3>
              <div className="video-modal-meta">
                <span className="video-modal-type">
                  {videoModalRecording.type === 'video' ? 'Video Call' : 'Voice Call'}
                </span>
                <span className="video-modal-separator">•</span>
                <span className="video-modal-time">{formatExactTime(videoModalRecording.createdAt)}</span>
                {videoDuration > 0 && (
                  <>
                    <span className="video-modal-separator">•</span>
                    <span className="video-modal-duration">{formatVideoTime(videoDuration)}</span>
                  </>
                )}
              </div>
            </div>
            <div className="video-modal-header-actions">
              <button
                className="video-header-btn"
                onClick={(e) => handleDownload(videoModalRecording, e)}
                title="Download"
              >
                <Download size={18} />
              </button>
              <button
                className="video-header-btn"
                onClick={() => {
                  closeVideoModal();
                  setShareRecording(videoModalRecording);
                }}
                title="Share"
              >
                <Forward size={18} />
              </button>
              <button
                className="video-modal-close"
                onClick={closeVideoModal}
                title="Close"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Video Container */}
          <div
            className="video-modal-content"
            onMouseMove={handleVideoMouseMove}
            onMouseLeave={() => isVideoPlaying && setShowVideoControls(false)}
            onClick={handleVideoPlayPause}
          >
            <video
              ref={videoRef}
              src={videoModalRecording.fileUrl}
              className="video-player"
              onLoadedMetadata={(e) => {
                const video = e.currentTarget;
                setVideoDuration(video.duration);
              }}
              onTimeUpdate={(e) => {
                setVideoCurrentTime(e.currentTarget.currentTime);
              }}
              onPlay={() => setIsVideoPlaying(true)}
              onPause={() => setIsVideoPlaying(false)}
              onEnded={() => {
                setIsVideoPlaying(false);
                setShowVideoControls(true);
              }}
              autoPlay
            />

            {/* Center Play Button (shown when paused) */}
            {!isVideoPlaying && (
              <div className="video-center-play" onClick={handleVideoPlayPause}>
                <Play size={48} fill="white" />
              </div>
            )}
          </div>

          {/* Custom Controls */}
          <div className={`video-controls ${showVideoControls ? 'visible' : 'hidden'}`}>
            {/* Progress Bar */}
            <div className="video-progress-container" onClick={(e) => e.stopPropagation()}>
              <input
                type="range"
                className="video-progress"
                min={0}
                max={videoDuration || 100}
                step={0.01}
                value={videoCurrentTime}
                onChange={handleVideoSeek}
                onInput={handleVideoSeek}
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: `linear-gradient(to right, #64c8ca ${(videoCurrentTime / (videoDuration || 1)) * 100}%, #444 ${(videoCurrentTime / (videoDuration || 1)) * 100}%)`
                }}
              />
            </div>

            {/* Control Buttons */}
            <div className="video-controls-row" onClick={(e) => e.stopPropagation()}>
              <div className="video-controls-left">
                {/* Play/Pause */}
                <button className="video-control-btn play-btn" onClick={(e) => { e.stopPropagation(); handleVideoPlayPause(); }}>
                  {isVideoPlaying ? <Pause size={22} /> : <Play size={22} fill="white" />}
                </button>

                {/* Skip Backward */}
                <button className="video-control-btn" onClick={(e) => { e.stopPropagation(); handleSkip(-10); }} title="Back 10s">
                  <SkipBack size={18} />
                </button>

                {/* Skip Forward */}
                <button className="video-control-btn" onClick={(e) => { e.stopPropagation(); handleSkip(10); }} title="Forward 10s">
                  <SkipForward size={18} />
                </button>

                {/* Time Display */}
                <span className="video-time-display">
                  {formatVideoTime(videoCurrentTime)} / {formatVideoTime(videoDuration)}
                </span>
              </div>

              <div className="video-controls-right">
                {/* Volume */}
                <div className="video-volume-container">
                  <button className="video-control-btn" onClick={(e) => { e.stopPropagation(); toggleVideoMute(); }}>
                    {isVideoMuted || videoVolume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                  <input
                    type="range"
                    className="video-volume-slider"
                    min={0}
                    max={1}
                    step={0.1}
                    value={isVideoMuted ? 0 : videoVolume}
                    onChange={handleVideoVolumeChange}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                {/* Fullscreen */}
                <button className="video-control-btn" onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}>
                  {isVideoFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Pro Feature Lock Screen
  if (!hasPaidAccess) {
    return (
      <div className="recordings-panel">
        <div className="recordings-pro-lock">
          <div className="pro-lock-icon">
            <Lock size={32} />
          </div>
          <h2>Call Recordings is a Pro Feature</h2>
          <p>Upgrade to record video and voice calls, save them for later, and share with your team.</p>

          <div className="pro-lock-features">
            <div className="pro-lock-feature">
              <Video size={20} />
              <span>Video call recording</span>
            </div>
            <div className="pro-lock-feature">
              <Mic size={20} />
              <span>Voice call recording</span>
            </div>
            <div className="pro-lock-feature">
              <Download size={20} />
              <span>Download recordings</span>
            </div>
            <div className="pro-lock-feature">
              <History size={20} />
              <span>Unlimited storage</span>
            </div>
          </div>

          {onUpgradeClick && (
            <button className="pro-lock-upgrade-btn" onClick={onUpgradeClick}>
              <Zap size={18} />
              Upgrade to Pro - $3/user/month
            </button>
          )}

          <p className="pro-lock-note">
            Includes 100GB cloud sync per team, 500MB per-message file sharing, and unlimited message history
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="recordings-panel">
      <div className="recordings-header">
        <h2>Recordings</h2>
        {!isSelectMode ? (
          <button
            className="recordings-select-btn"
            onClick={toggleSelectMode}
            disabled={filteredRecordings.length === 0}
          >
            <CheckSquare size={16} />
            Select
          </button>
        ) : (
          <div className="recordings-select-controls">
            <button
              className="select-all-btn"
              onClick={allSelected ? deselectAllRecordings : selectAllRecordings}
            >
              {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            <span className="selected-count">
              {selectedRecordings.size} selected
            </span>
            <button
              className="bulk-delete-btn"
              onClick={() => setShowBulkDeleteConfirm(true)}
              disabled={selectedRecordings.size === 0}
            >
              <Trash2 size={16} />
              Delete
            </button>
            <button className="cancel-select-btn" onClick={toggleSelectMode}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="recordings-filter-tabs">
        <button
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({recordings.length})
        </button>
        <button
          className={`filter-tab ${filter === 'video' ? 'active' : ''}`}
          onClick={() => setFilter('video')}
        >
          <Video size={14} />
          Video ({videoCount})
        </button>
        <button
          className={`filter-tab ${filter === 'voice' ? 'active' : ''}`}
          onClick={() => setFilter('voice')}
        >
          <Mic size={14} />
          Voice ({voiceCount})
        </button>
      </div>

      {activeRecordingState?.isRecording && renderActiveRecording()}

      <div className="recordings-list">
        {isLoading ? (
          <div className="recordings-loading">
            <Loader2 size={32} className="spin" />
            <span>Loading recordings...</span>
          </div>
        ) : error ? (
          <div className="recordings-error">
            <AlertCircle size={32} />
            <span>{error}</span>
          </div>
        ) : filteredRecordings.length === 0 ? (
          <div className="recordings-empty">
            {filter === 'all' ? (
              <MonitorPlay size={48} strokeWidth={1.5} />
            ) : filter === 'video' ? (
              <Video size={48} />
            ) : (
              <Mic size={48} />
            )}
            <h3>No {filter === 'all' ? '' : filter} recordings yet</h3>
            <p>Start recording during a call to save it here</p>
          </div>
        ) : (
          filteredRecordings.map(renderRecordingItem)
        )}
      </div>

      {/* Video Playback Modal */}
      {renderVideoModal()}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <ConfirmModal
          isOpen={true}
          title="Delete Recording"
          message={`Are you sure you want to delete this ${deleteConfirm.type} recording? This action cannot be undone.`}
          confirmText={isDeleting ? 'Deleting...' : 'Delete'}
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <ConfirmModal
          isOpen={true}
          title="Delete Selected Recordings"
          message={`Are you sure you want to delete ${selectedRecordings.size} recording${selectedRecordings.size > 1 ? 's' : ''}? This action cannot be undone.`}
          confirmText={isDeleting ? 'Deleting...' : `Delete ${selectedRecordings.size} Recording${selectedRecordings.size > 1 ? 's' : ''}`}
          variant="danger"
          onConfirm={handleBulkDelete}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />
      )}

      {/* Share to Chat Modal */}
      {shareRecording && (
        <ShareToChatModal
          isOpen={true}
          onClose={() => setShareRecording(null)}
          sharedRecording={createSharedRecording(shareRecording)}
          channels={channels}
          currentUserEmail={currentUserEmail}
          teamMembers={teamMembers ? Object.values(teamMembers).map(m => ({
            email: m.email,
            displayName: m.displayName,
            photoURL: m.photoURL,
          })) : []}
          onGetOrCreateDM={async (memberEmail: string) => {
            return await getOrCreateDMChannel(teamId, currentUserEmail, memberEmail);
          }}
          onShare={async (channelId, message, _sharedFile, sharedRec) => {
            const { sendMessage } = await import('../../services/teamChatService');
            await sendMessage(
              teamId,
              channelId,
              { content: message || '' },
              currentUserEmail,
              currentUserEmail.split('@')[0],
              undefined,
              undefined,
              undefined,
              undefined,
              sharedRec
            );
          }}
        />
      )}
    </div>
  );
};

export default RecordingsPanel;
