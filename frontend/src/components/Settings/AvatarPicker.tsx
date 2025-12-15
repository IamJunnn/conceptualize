import React, { useState, useCallback } from 'react';
import { X, Check } from 'lucide-react';
import './AvatarPicker.css';

// Component for individual avatar with loading/error states
const AvatarImage: React.FC<{
  url: string;
  alt: string;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ url, alt, isSelected, onSelect }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const handleError = useCallback(() => {
    if (retryCount < 2) {
      // Retry with a slight delay
      setTimeout(() => {
        setRetryCount(prev => prev + 1);
        setError(false);
      }, 1000 * (retryCount + 1));
    } else {
      setError(true);
    }
  }, [retryCount]);

  const handleLoad = useCallback(() => {
    setLoaded(true);
    setError(false);
  }, []);

  // Add retry parameter to URL to force reload
  const imageUrl = retryCount > 0 ? `${url}&retry=${retryCount}` : url;

  return (
    <button
      className={`avatar-option ${isSelected ? 'selected' : ''} ${!loaded && !error ? 'loading' : ''}`}
      onClick={onSelect}
      title={alt}
    >
      {!loaded && !error && (
        <div className="avatar-loading">
          <div className="avatar-loading-spinner"></div>
        </div>
      )}
      {error ? (
        <div className="avatar-error" onClick={(e) => { e.stopPropagation(); setRetryCount(0); setError(false); }}>
          <span>↻</span>
        </div>
      ) : (
        <img
          src={imageUrl}
          alt={alt}
          loading="lazy"
          onLoad={handleLoad}
          onError={handleError}
          style={{ opacity: loaded ? 1 : 0 }}
        />
      )}
      {isSelected && (
        <div className="selected-indicator">
          <Check size={16} />
        </div>
      )}
    </button>
  );
};

interface AvatarPickerProps {
  currentAvatar?: string;
  onSelect: (avatarUrl: string) => void;
  onClose: () => void;
}

// 150+ preset DiceBear avatars with various styles and seeds
const AVATAR_PRESETS = [
  // Bottts (robots) - 15 avatars
  { style: 'bottts', seed: 'felix', label: 'Robot', category: 'robots' },
  { style: 'bottts', seed: 'luna', label: 'Robot', category: 'robots' },
  { style: 'bottts', seed: 'zephyr', label: 'Robot', category: 'robots' },
  { style: 'bottts', seed: 'nova', label: 'Robot', category: 'robots' },
  { style: 'bottts', seed: 'pixel', label: 'Robot', category: 'robots' },
  { style: 'bottts', seed: 'cyber', label: 'Robot', category: 'robots' },
  { style: 'bottts', seed: 'spark', label: 'Robot', category: 'robots' },
  { style: 'bottts', seed: 'bolt', label: 'Robot', category: 'robots' },
  { style: 'bottts', seed: 'chip', label: 'Robot', category: 'robots' },
  { style: 'bottts', seed: 'circuit', label: 'Robot', category: 'robots' },
  { style: 'bottts', seed: 'binary', label: 'Robot', category: 'robots' },
  { style: 'bottts', seed: 'mech', label: 'Robot', category: 'robots' },
  { style: 'bottts', seed: 'droid', label: 'Robot', category: 'robots' },
  { style: 'bottts', seed: 'robo', label: 'Robot', category: 'robots' },
  { style: 'bottts', seed: 'android', label: 'Robot', category: 'robots' },

  // Avataaars (illustrated people) - 15 avatars
  { style: 'avataaars', seed: 'alex', label: 'Person', category: 'people' },
  { style: 'avataaars', seed: 'sam', label: 'Person', category: 'people' },
  { style: 'avataaars', seed: 'jordan', label: 'Person', category: 'people' },
  { style: 'avataaars', seed: 'taylor', label: 'Person', category: 'people' },
  { style: 'avataaars', seed: 'casey', label: 'Person', category: 'people' },
  { style: 'avataaars', seed: 'morgan', label: 'Person', category: 'people' },
  { style: 'avataaars', seed: 'riley', label: 'Person', category: 'people' },
  { style: 'avataaars', seed: 'quinn', label: 'Person', category: 'people' },
  { style: 'avataaars', seed: 'avery', label: 'Person', category: 'people' },
  { style: 'avataaars', seed: 'harper', label: 'Person', category: 'people' },
  { style: 'avataaars', seed: 'skyler', label: 'Person', category: 'people' },
  { style: 'avataaars', seed: 'jamie', label: 'Person', category: 'people' },
  { style: 'avataaars', seed: 'drew', label: 'Person', category: 'people' },
  { style: 'avataaars', seed: 'reese', label: 'Person', category: 'people' },
  { style: 'avataaars', seed: 'sage', label: 'Person', category: 'people' },

  // Lorelei (artistic faces) - 15 avatars
  { style: 'lorelei', seed: 'star', label: 'Artistic', category: 'artistic' },
  { style: 'lorelei', seed: 'moon', label: 'Artistic', category: 'artistic' },
  { style: 'lorelei', seed: 'sun', label: 'Artistic', category: 'artistic' },
  { style: 'lorelei', seed: 'cloud', label: 'Artistic', category: 'artistic' },
  { style: 'lorelei', seed: 'rain', label: 'Artistic', category: 'artistic' },
  { style: 'lorelei', seed: 'wind', label: 'Artistic', category: 'artistic' },
  { style: 'lorelei', seed: 'ocean', label: 'Artistic', category: 'artistic' },
  { style: 'lorelei', seed: 'forest', label: 'Artistic', category: 'artistic' },
  { style: 'lorelei', seed: 'mountain', label: 'Artistic', category: 'artistic' },
  { style: 'lorelei', seed: 'river', label: 'Artistic', category: 'artistic' },
  { style: 'lorelei', seed: 'meadow', label: 'Artistic', category: 'artistic' },
  { style: 'lorelei', seed: 'aurora', label: 'Artistic', category: 'artistic' },
  { style: 'lorelei', seed: 'cosmos', label: 'Artistic', category: 'artistic' },
  { style: 'lorelei', seed: 'nebula', label: 'Artistic', category: 'artistic' },
  { style: 'lorelei', seed: 'galaxy', label: 'Artistic', category: 'artistic' },

  // Notionists (minimalist) - 15 avatars
  { style: 'notionists', seed: 'alpha', label: 'Minimal', category: 'minimal' },
  { style: 'notionists', seed: 'beta', label: 'Minimal', category: 'minimal' },
  { style: 'notionists', seed: 'gamma', label: 'Minimal', category: 'minimal' },
  { style: 'notionists', seed: 'delta', label: 'Minimal', category: 'minimal' },
  { style: 'notionists', seed: 'epsilon', label: 'Minimal', category: 'minimal' },
  { style: 'notionists', seed: 'zeta', label: 'Minimal', category: 'minimal' },
  { style: 'notionists', seed: 'eta', label: 'Minimal', category: 'minimal' },
  { style: 'notionists', seed: 'theta', label: 'Minimal', category: 'minimal' },
  { style: 'notionists', seed: 'iota', label: 'Minimal', category: 'minimal' },
  { style: 'notionists', seed: 'kappa', label: 'Minimal', category: 'minimal' },
  { style: 'notionists', seed: 'lambda', label: 'Minimal', category: 'minimal' },
  { style: 'notionists', seed: 'mu', label: 'Minimal', category: 'minimal' },
  { style: 'notionists', seed: 'nu', label: 'Minimal', category: 'minimal' },
  { style: 'notionists', seed: 'xi', label: 'Minimal', category: 'minimal' },
  { style: 'notionists', seed: 'omicron', label: 'Minimal', category: 'minimal' },

  // Fun Emoji - 15 avatars
  { style: 'fun-emoji', seed: 'happy', label: 'Emoji', category: 'emoji' },
  { style: 'fun-emoji', seed: 'cool', label: 'Emoji', category: 'emoji' },
  { style: 'fun-emoji', seed: 'silly', label: 'Emoji', category: 'emoji' },
  { style: 'fun-emoji', seed: 'wink', label: 'Emoji', category: 'emoji' },
  { style: 'fun-emoji', seed: 'love', label: 'Emoji', category: 'emoji' },
  { style: 'fun-emoji', seed: 'smile', label: 'Emoji', category: 'emoji' },
  { style: 'fun-emoji', seed: 'laugh', label: 'Emoji', category: 'emoji' },
  { style: 'fun-emoji', seed: 'party', label: 'Emoji', category: 'emoji' },
  { style: 'fun-emoji', seed: 'sparkle', label: 'Emoji', category: 'emoji' },
  { style: 'fun-emoji', seed: 'star', label: 'Emoji', category: 'emoji' },
  { style: 'fun-emoji', seed: 'heart', label: 'Emoji', category: 'emoji' },
  { style: 'fun-emoji', seed: 'fire', label: 'Emoji', category: 'emoji' },
  { style: 'fun-emoji', seed: 'rainbow', label: 'Emoji', category: 'emoji' },
  { style: 'fun-emoji', seed: 'peace', label: 'Emoji', category: 'emoji' },
  { style: 'fun-emoji', seed: 'chill', label: 'Emoji', category: 'emoji' },

  // Adventurer - 15 avatars
  { style: 'adventurer', seed: 'brave', label: 'Adventurer', category: 'adventurer' },
  { style: 'adventurer', seed: 'quest', label: 'Adventurer', category: 'adventurer' },
  { style: 'adventurer', seed: 'hero', label: 'Adventurer', category: 'adventurer' },
  { style: 'adventurer', seed: 'journey', label: 'Adventurer', category: 'adventurer' },
  { style: 'adventurer', seed: 'explorer', label: 'Adventurer', category: 'adventurer' },
  { style: 'adventurer', seed: 'wanderer', label: 'Adventurer', category: 'adventurer' },
  { style: 'adventurer', seed: 'pioneer', label: 'Adventurer', category: 'adventurer' },
  { style: 'adventurer', seed: 'seeker', label: 'Adventurer', category: 'adventurer' },
  { style: 'adventurer', seed: 'voyager', label: 'Adventurer', category: 'adventurer' },
  { style: 'adventurer', seed: 'nomad', label: 'Adventurer', category: 'adventurer' },
  { style: 'adventurer', seed: 'scout', label: 'Adventurer', category: 'adventurer' },
  { style: 'adventurer', seed: 'ranger', label: 'Adventurer', category: 'adventurer' },
  { style: 'adventurer', seed: 'pathfinder', label: 'Adventurer', category: 'adventurer' },
  { style: 'adventurer', seed: 'trailblazer', label: 'Adventurer', category: 'adventurer' },
  { style: 'adventurer', seed: 'discoverer', label: 'Adventurer', category: 'adventurer' },

  // Big Ears - 15 avatars
  { style: 'big-ears', seed: 'fluffy', label: 'Big Ears', category: 'big-ears' },
  { style: 'big-ears', seed: 'bunny', label: 'Big Ears', category: 'big-ears' },
  { style: 'big-ears', seed: 'floppy', label: 'Big Ears', category: 'big-ears' },
  { style: 'big-ears', seed: 'fuzzy', label: 'Big Ears', category: 'big-ears' },
  { style: 'big-ears', seed: 'cotton', label: 'Big Ears', category: 'big-ears' },
  { style: 'big-ears', seed: 'whiskers', label: 'Big Ears', category: 'big-ears' },
  { style: 'big-ears', seed: 'paws', label: 'Big Ears', category: 'big-ears' },
  { style: 'big-ears', seed: 'snuggle', label: 'Big Ears', category: 'big-ears' },
  { style: 'big-ears', seed: 'cuddle', label: 'Big Ears', category: 'big-ears' },
  { style: 'big-ears', seed: 'cozy', label: 'Big Ears', category: 'big-ears' },
  { style: 'big-ears', seed: 'marshmallow', label: 'Big Ears', category: 'big-ears' },
  { style: 'big-ears', seed: 'snowball', label: 'Big Ears', category: 'big-ears' },
  { style: 'big-ears', seed: 'peach', label: 'Big Ears', category: 'big-ears' },
  { style: 'big-ears', seed: 'honey', label: 'Big Ears', category: 'big-ears' },
  { style: 'big-ears', seed: 'caramel', label: 'Big Ears', category: 'big-ears' },

  // Micah - 15 avatars
  { style: 'micah', seed: 'zen', label: 'Micah', category: 'micah' },
  { style: 'micah', seed: 'calm', label: 'Micah', category: 'micah' },
  { style: 'micah', seed: 'serene', label: 'Micah', category: 'micah' },
  { style: 'micah', seed: 'peaceful', label: 'Micah', category: 'micah' },
  { style: 'micah', seed: 'gentle', label: 'Micah', category: 'micah' },
  { style: 'micah', seed: 'kind', label: 'Micah', category: 'micah' },
  { style: 'micah', seed: 'warm', label: 'Micah', category: 'micah' },
  { style: 'micah', seed: 'bright', label: 'Micah', category: 'micah' },
  { style: 'micah', seed: 'sunny', label: 'Micah', category: 'micah' },
  { style: 'micah', seed: 'cheerful', label: 'Micah', category: 'micah' },
  { style: 'micah', seed: 'joyful', label: 'Micah', category: 'micah' },
  { style: 'micah', seed: 'radiant', label: 'Micah', category: 'micah' },
  { style: 'micah', seed: 'glowing', label: 'Micah', category: 'micah' },
  { style: 'micah', seed: 'vibrant', label: 'Micah', category: 'micah' },
  { style: 'micah', seed: 'lively', label: 'Micah', category: 'micah' },

  // Pixel Art - 15 avatars
  { style: 'pixel-art', seed: 'retro', label: 'Pixel', category: 'pixel' },
  { style: 'pixel-art', seed: 'arcade', label: 'Pixel', category: 'pixel' },
  { style: 'pixel-art', seed: 'game', label: 'Pixel', category: 'pixel' },
  { style: 'pixel-art', seed: 'classic', label: 'Pixel', category: 'pixel' },
  { style: 'pixel-art', seed: 'vintage', label: 'Pixel', category: 'pixel' },
  { style: 'pixel-art', seed: '8bit', label: 'Pixel', category: 'pixel' },
  { style: 'pixel-art', seed: '16bit', label: 'Pixel', category: 'pixel' },
  { style: 'pixel-art', seed: 'console', label: 'Pixel', category: 'pixel' },
  { style: 'pixel-art', seed: 'joystick', label: 'Pixel', category: 'pixel' },
  { style: 'pixel-art', seed: 'controller', label: 'Pixel', category: 'pixel' },
  { style: 'pixel-art', seed: 'player1', label: 'Pixel', category: 'pixel' },
  { style: 'pixel-art', seed: 'player2', label: 'Pixel', category: 'pixel' },
  { style: 'pixel-art', seed: 'highscore', label: 'Pixel', category: 'pixel' },
  { style: 'pixel-art', seed: 'level', label: 'Pixel', category: 'pixel' },
  { style: 'pixel-art', seed: 'bonus', label: 'Pixel', category: 'pixel' },

  // Identicon - 15 avatars (geometric patterns)
  { style: 'identicon', seed: 'alpha', label: 'Identicon', category: 'identicon' },
  { style: 'identicon', seed: 'beta', label: 'Identicon', category: 'identicon' },
  { style: 'identicon', seed: 'gamma', label: 'Identicon', category: 'identicon' },
  { style: 'identicon', seed: 'delta', label: 'Identicon', category: 'identicon' },
  { style: 'identicon', seed: 'epsilon', label: 'Identicon', category: 'identicon' },
  { style: 'identicon', seed: 'zeta', label: 'Identicon', category: 'identicon' },
  { style: 'identicon', seed: 'eta', label: 'Identicon', category: 'identicon' },
  { style: 'identicon', seed: 'theta', label: 'Identicon', category: 'identicon' },
  { style: 'identicon', seed: 'iota', label: 'Identicon', category: 'identicon' },
  { style: 'identicon', seed: 'kappa', label: 'Identicon', category: 'identicon' },
  { style: 'identicon', seed: 'lambda', label: 'Identicon', category: 'identicon' },
  { style: 'identicon', seed: 'mu', label: 'Identicon', category: 'identicon' },
  { style: 'identicon', seed: 'nu', label: 'Identicon', category: 'identicon' },
  { style: 'identicon', seed: 'xi', label: 'Identicon', category: 'identicon' },
  { style: 'identicon', seed: 'omicron', label: 'Identicon', category: 'identicon' },

  // Shapes - 15 avatars (abstract shapes)
  { style: 'shapes', seed: 'circle', label: 'Shapes', category: 'shapes' },
  { style: 'shapes', seed: 'square', label: 'Shapes', category: 'shapes' },
  { style: 'shapes', seed: 'triangle', label: 'Shapes', category: 'shapes' },
  { style: 'shapes', seed: 'diamond', label: 'Shapes', category: 'shapes' },
  { style: 'shapes', seed: 'hexagon', label: 'Shapes', category: 'shapes' },
  { style: 'shapes', seed: 'star', label: 'Shapes', category: 'shapes' },
  { style: 'shapes', seed: 'polygon', label: 'Shapes', category: 'shapes' },
  { style: 'shapes', seed: 'abstract', label: 'Shapes', category: 'shapes' },
  { style: 'shapes', seed: 'pattern', label: 'Shapes', category: 'shapes' },
  { style: 'shapes', seed: 'mosaic', label: 'Shapes', category: 'shapes' },
  { style: 'shapes', seed: 'geo', label: 'Shapes', category: 'shapes' },
  { style: 'shapes', seed: 'prism', label: 'Shapes', category: 'shapes' },
  { style: 'shapes', seed: 'cube', label: 'Shapes', category: 'shapes' },
  { style: 'shapes', seed: 'sphere', label: 'Shapes', category: 'shapes' },
  { style: 'shapes', seed: 'crystal', label: 'Shapes', category: 'shapes' },

  // Rings - 15 avatars
  { style: 'rings', seed: 'gold', label: 'Rings', category: 'rings' },
  { style: 'rings', seed: 'silver', label: 'Rings', category: 'rings' },
  { style: 'rings', seed: 'bronze', label: 'Rings', category: 'rings' },
  { style: 'rings', seed: 'platinum', label: 'Rings', category: 'rings' },
  { style: 'rings', seed: 'copper', label: 'Rings', category: 'rings' },
  { style: 'rings', seed: 'ruby', label: 'Rings', category: 'rings' },
  { style: 'rings', seed: 'sapphire', label: 'Rings', category: 'rings' },
  { style: 'rings', seed: 'emerald', label: 'Rings', category: 'rings' },
  { style: 'rings', seed: 'diamond', label: 'Rings', category: 'rings' },
  { style: 'rings', seed: 'pearl', label: 'Rings', category: 'rings' },
  { style: 'rings', seed: 'opal', label: 'Rings', category: 'rings' },
  { style: 'rings', seed: 'topaz', label: 'Rings', category: 'rings' },
  { style: 'rings', seed: 'amethyst', label: 'Rings', category: 'rings' },
  { style: 'rings', seed: 'jade', label: 'Rings', category: 'rings' },
  { style: 'rings', seed: 'onyx', label: 'Rings', category: 'rings' },
];

const generateAvatarUrl = (style: string, seed: string): string => {
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;
};

const AvatarPicker: React.FC<AvatarPickerProps> = ({ currentAvatar, onSelect, onClose }) => {
  const [selectedAvatar, setSelectedAvatar] = useState<string>(currentAvatar || '');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'robots', label: 'Robots' },
    { id: 'people', label: 'People' },
    { id: 'artistic', label: 'Artistic' },
    { id: 'minimal', label: 'Minimal' },
    { id: 'emoji', label: 'Emoji' },
    { id: 'adventurer', label: 'Adventurer' },
    { id: 'big-ears', label: 'Big Ears' },
    { id: 'micah', label: 'Micah' },
    { id: 'pixel', label: 'Pixel Art' },
    { id: 'identicon', label: 'Identicon' },
    { id: 'shapes', label: 'Shapes' },
    { id: 'rings', label: 'Rings' },
  ];

  const filteredAvatars = activeCategory === 'all'
    ? AVATAR_PRESETS
    : AVATAR_PRESETS.filter(a => a.category === activeCategory);

  const handleSelect = (avatarUrl: string) => {
    setSelectedAvatar(avatarUrl);
  };

  const handleConfirm = () => {
    if (selectedAvatar) {
      onSelect(selectedAvatar);
      onClose();
    }
  };

  return (
    <div className="avatar-picker-overlay" onClick={onClose}>
      <div className="avatar-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="avatar-picker-header">
          <h3>Choose Your Avatar</h3>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="avatar-picker-categories">
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`category-btn ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="avatar-picker-grid">
          {activeCategory === 'all' ? (
            // Group by category when showing all
            categories.filter(cat => cat.id !== 'all').map(cat => {
              const categoryAvatars = AVATAR_PRESETS.filter(a => a.category === cat.id);
              if (categoryAvatars.length === 0) return null;

              return (
                <div key={cat.id} className="avatar-category-section">
                  <div className="avatar-category-header">{cat.label}</div>
                  <div className="avatar-category-grid">
                    {categoryAvatars.map((avatar, index) => {
                      const avatarUrl = generateAvatarUrl(avatar.style, avatar.seed);
                      const isSelected = selectedAvatar === avatarUrl;

                      return (
                        <AvatarImage
                          key={`${avatar.style}-${avatar.seed}-${index}`}
                          url={avatarUrl}
                          alt={avatar.label}
                          isSelected={isSelected}
                          onSelect={() => handleSelect(avatarUrl)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            // Show flat grid for specific category
            filteredAvatars.map((avatar, index) => {
              const avatarUrl = generateAvatarUrl(avatar.style, avatar.seed);
              const isSelected = selectedAvatar === avatarUrl;

              return (
                <AvatarImage
                  key={`${avatar.style}-${avatar.seed}-${index}`}
                  url={avatarUrl}
                  alt={avatar.label}
                  isSelected={isSelected}
                  onSelect={() => handleSelect(avatarUrl)}
                />
              );
            })
          )}
        </div>

        <div className="avatar-picker-footer">
          <button className="cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="confirm-btn"
            onClick={handleConfirm}
            disabled={!selectedAvatar}
          >
            Save Avatar
          </button>
        </div>
      </div>
    </div>
  );
};

export default AvatarPicker;
