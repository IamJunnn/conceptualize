/**
 * BackgroundSelectorModal - Modal for selecting video call background
 * Sections: Blur, Gradients, Team Background, Your Backgrounds
 */

import { useState, useEffect, useRef } from 'react';
import { X, Upload, Trash2, Check, Building2, User, Sparkles, FlipHorizontal2, Palette } from 'lucide-react';
import {
  setBackgroundMode,
  setBlurLevel,
  setVirtualBackground,
  getBlurLevel,
  getBackgroundImageUrl,
  getMirrorMode,
  setMirrorMode,
  subscribeToMirrorMode,
  BackgroundMode,
  BlurLevel,
  subscribeToBackgroundMode
} from '../../../services/callService';
import {
  uploadUserBackground,
  deleteUserBackground,
  getUserBackgrounds,
  getTeamBackground,
  UserBackground
} from '../../../services/backgroundService';
import './BackgroundSelectorModal.css';

interface BackgroundSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  userEmail: string;
}

// Preset gradient backgrounds
const GRADIENT_BACKGROUNDS = [
  {
    id: 'ocean-breeze',
    name: 'Ocean breeze',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  {
    id: 'sunset-glow',
    name: 'Sunset glow',
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  },
  {
    id: 'forest-mist',
    name: 'Forest mist',
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  },
  {
    id: 'purple-haze',
    name: 'Purple haze',
    gradient: 'linear-gradient(135deg, #c44fc4 0%, #64c8ca 100%)',
  },
  {
    id: 'midnight-blue',
    name: 'Midnight blue',
    gradient: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
  },
  {
    id: 'warm-flame',
    name: 'Warm flame',
    gradient: 'linear-gradient(135deg, #ff9a56 0%, #ff6a88 100%)',
  },
  {
    id: 'cool-sky',
    name: 'Cool sky',
    gradient: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
  },
  {
    id: 'deep-space',
    name: 'Deep space',
    gradient: 'linear-gradient(135deg, #2b5876 0%, #4e4376 100%)',
  },
  {
    id: 'mint-fresh',
    name: 'Mint fresh',
    gradient: 'linear-gradient(135deg, #a8e063 0%, #56ab2f 100%)',
  },
  {
    id: 'cotton-candy',
    name: 'Cotton candy',
    gradient: 'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)',
  },
  {
    id: 'aurora-green',
    name: 'Aurora green',
    gradient: 'linear-gradient(135deg, #00b4db 0%, #0083b0 100%)',
  },
  {
    id: 'rose-gold',
    name: 'Rose gold',
    gradient: 'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)',
  },
];

export default function BackgroundSelectorModal({
  isOpen,
  onClose,
  teamId,
  userEmail,
}: BackgroundSelectorModalProps) {
  const [currentMode, setCurrentMode] = useState<BackgroundMode>('none');
  const [currentBlurLevel, setCurrentBlurLevel] = useState<BlurLevel>('medium');
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [isMirrored, setIsMirrored] = useState<boolean>(getMirrorMode());
  const [teamBackground, setTeamBackground] = useState<string | null>(null);
  const [userBackgrounds, setUserBackgrounds] = useState<UserBackground[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Subscribe to background mode changes
  useEffect(() => {
    const unsubscribe = subscribeToBackgroundMode((mode) => {
      setCurrentMode(mode);
      setCurrentBlurLevel(getBlurLevel());
      setCurrentImageUrl(getBackgroundImageUrl());
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

  // Load team and user backgrounds
  useEffect(() => {
    if (isOpen && teamId && userEmail) {
      loadBackgrounds();
    }
  }, [isOpen, teamId, userEmail]);

  const loadBackgrounds = async () => {
    try {
      // Load team background
      const teamBg = await getTeamBackground(teamId);
      setTeamBackground(teamBg);

      // Load user backgrounds
      const userBgs = await getUserBackgrounds(teamId, userEmail);
      setUserBackgrounds(userBgs);
    } catch (error) {
      console.error('Failed to load backgrounds:', error);
    }
  };

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  const handleSelectNone = async () => {
    try {
      await setBackgroundMode('none');
    } catch (error) {
      console.error('Failed to disable background:', error);
    }
  };

  const handleToggleMirror = () => {
    setMirrorMode(!isMirrored);
  };

  const handleSelectBlur = async (level: BlurLevel) => {
    try {
      await setBlurLevel(level);
    } catch (error) {
      console.error('Failed to set blur:', error);
    }
  };

  const handleSelectTeamBackground = async () => {
    if (!teamBackground) return;
    try {
      await setVirtualBackground(teamBackground);
    } catch (error) {
      console.error('Failed to set team background:', error);
    }
  };

  const handleSelectGradient = async (gradient: string) => {
    try {
      await setVirtualBackground(gradient);
    } catch (error) {
      console.error('Failed to set gradient background:', error);
    }
  };

  const handleSelectUserBackground = async (url: string) => {
    try {
      await setVirtualBackground(url);
    } catch (error) {
      console.error('Failed to set user background:', error);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      setUploadError('Only PNG and JPG files are allowed');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size must be less than 10MB');
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    try {
      const newBackground = await uploadUserBackground(teamId, userEmail, file);
      setUserBackgrounds(prev => [...prev, newBackground]);

      // Automatically select the uploaded background
      await setVirtualBackground(newBackground.url);
    } catch (error) {
      console.error('Failed to upload background:', error);
      setUploadError('Failed to upload background. Please try again.');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteBackground = async (backgroundId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      await deleteUserBackground(teamId, userEmail, backgroundId);
      setUserBackgrounds(prev => prev.filter(bg => bg.id !== backgroundId));

      // If this was the active background, switch to none
      const deletedBg = userBackgrounds.find(bg => bg.id === backgroundId);
      if (deletedBg && currentImageUrl === deletedBg.url) {
        await setBackgroundMode('none');
      }
    } catch (error) {
      console.error('Failed to delete background:', error);
    }
  };

  if (!isOpen) return null;

  const isBlurActive = currentMode === 'blur';
  const isTeamBgActive = currentMode === 'image' && currentImageUrl === teamBackground;

  return (
    <div className="background-selector-overlay">
      <div className="background-selector-modal" ref={modalRef}>
        <div className="background-selector-header">
          <h3>Select Background</h3>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="background-selector-content">
          {/* None option and Mirror toggle */}
          <div className="background-section top-options">
            <button
              className={`background-option none-option ${currentMode === 'none' ? 'active' : ''}`}
              onClick={handleSelectNone}
            >
              <div className="option-preview none-preview">
                <X size={24} />
              </div>
              <span>None</span>
              {currentMode === 'none' && <Check size={16} className="check-icon" />}
            </button>
            <button
              className={`background-option mirror-option ${isMirrored ? 'active' : ''}`}
              onClick={handleToggleMirror}
            >
              <div className="option-preview mirror-preview">
                <FlipHorizontal2 size={24} />
              </div>
              <span>Mirror</span>
              {isMirrored && <Check size={16} className="check-icon" />}
            </button>
          </div>

          {/* Blur section */}
          <div className="background-section">
            <div className="section-header">
              <Sparkles size={16} />
              <span>Blur</span>
            </div>
            <div className="blur-options">
              <button
                className={`background-option blur-option ${isBlurActive && currentBlurLevel === 'light' ? 'active' : ''}`}
                onClick={() => handleSelectBlur('light')}
              >
                <div className="option-preview blur-preview light">
                  <div className="blur-sample" />
                </div>
                <span>Light</span>
                {isBlurActive && currentBlurLevel === 'light' && <Check size={16} className="check-icon" />}
              </button>
              <button
                className={`background-option blur-option ${isBlurActive && currentBlurLevel === 'medium' ? 'active' : ''}`}
                onClick={() => handleSelectBlur('medium')}
              >
                <div className="option-preview blur-preview medium">
                  <div className="blur-sample" />
                </div>
                <span>Medium</span>
                {isBlurActive && currentBlurLevel === 'medium' && <Check size={16} className="check-icon" />}
              </button>
              <button
                className={`background-option blur-option ${isBlurActive && currentBlurLevel === 'strong' ? 'active' : ''}`}
                onClick={() => handleSelectBlur('strong')}
              >
                <div className="option-preview blur-preview strong">
                  <div className="blur-sample" />
                </div>
                <span>Strong</span>
                {isBlurActive && currentBlurLevel === 'strong' && <Check size={16} className="check-icon" />}
              </button>
            </div>
          </div>

          {/* Gradients section */}
          <div className="background-section">
            <div className="section-header">
              <Palette size={16} />
              <span>Gradients</span>
            </div>
            <div className="gradient-options">
              {GRADIENT_BACKGROUNDS.map((bg) => {
                const isActive = currentMode === 'image' && currentImageUrl === bg.gradient;
                return (
                  <button
                    key={bg.id}
                    className={`background-option gradient-option ${isActive ? 'active' : ''}`}
                    onClick={() => handleSelectGradient(bg.gradient)}
                    title={bg.name}
                  >
                    <div className="option-preview gradient-preview" style={{ background: bg.gradient }}>
                      {/* Gradient preview */}
                    </div>
                    <span>{bg.name}</span>
                    {isActive && <Check size={16} className="check-icon" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Team background section */}
          <div className="background-section">
            <div className="section-header">
              <Building2 size={16} />
              <span>Team Background</span>
            </div>
            {teamBackground ? (
              <button
                className={`background-option team-bg-option ${isTeamBgActive ? 'active' : ''}`}
                onClick={handleSelectTeamBackground}
              >
                <div className="option-preview">
                  <img src={teamBackground} alt="Team background" />
                </div>
                <span>Team</span>
                {isTeamBgActive && <Check size={16} className="check-icon" />}
              </button>
            ) : (
              <div className="no-background-message">
                <p>No team background set</p>
                <p className="hint">Admins can set this in Team Dashboard</p>
              </div>
            )}
          </div>

          {/* User backgrounds section */}
          <div className="background-section">
            <div className="section-header">
              <User size={16} />
              <span>Your Backgrounds</span>
            </div>
            <div className="user-backgrounds">
              {userBackgrounds.map((bg) => {
                const isActive = currentMode === 'image' && currentImageUrl === bg.url;
                return (
                  <button
                    key={bg.id}
                    className={`background-option user-bg-option ${isActive ? 'active' : ''}`}
                    onClick={() => handleSelectUserBackground(bg.url)}
                  >
                    <div className="option-preview">
                      <img src={bg.url} alt={bg.name} />
                    </div>
                    <button
                      className="delete-bg-btn"
                      onClick={(e) => handleDeleteBackground(bg.id, e)}
                      title="Delete background"
                    >
                      <Trash2 size={14} />
                    </button>
                    {isActive && <Check size={16} className="check-icon" />}
                  </button>
                );
              })}

              {/* Upload button */}
              <button
                className="background-option upload-option"
                onClick={handleUploadClick}
                disabled={isUploading}
              >
                <div className="option-preview upload-preview">
                  {isUploading ? (
                    <div className="upload-spinner" />
                  ) : (
                    <Upload size={24} />
                  )}
                </div>
                <span>{isUploading ? 'Uploading...' : 'Upload'}</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>

            {uploadError && (
              <div className="upload-error">{uploadError}</div>
            )}

            <p className="upload-hint">PNG, JPG up to 10MB</p>
          </div>
        </div>
      </div>
    </div>
  );
}
