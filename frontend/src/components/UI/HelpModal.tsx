import React from 'react';
import ShortcutsGuide from '../guides/ShortcutsGuide';
import MarkdownGuide from '../guides/MarkdownGuide';
import './HelpModal.css';

interface HelpModalProps {
  guide: 'shortcuts' | 'markdown';
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ guide, onClose }) => {
  const getGuideTitle = () => {
    switch (guide) {
      case 'shortcuts':
        return 'Shortcuts.md';
      case 'markdown':
        return 'Note Syntax.md';
      default:
        return 'Guide';
    }
  };

  const getGuideContent = () => {
    switch (guide) {
      case 'shortcuts':
        return <ShortcutsGuide />;
      case 'markdown':
        return <MarkdownGuide />;
      default:
        return null;
    }
  };

  return (
    <div className="help-modal-overlay" onClick={onClose}>
      <div className="help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="help-modal-header">
          <div className="help-modal-title">
            <span className="help-modal-icon">📄</span>
            <span>{getGuideTitle()}</span>
            <span className="help-modal-badge">Read-only</span>
          </div>
          <button className="help-modal-close" onClick={onClose} title="Close (Esc)">
            ×
          </button>
        </div>
        <div className="help-modal-content">
          {getGuideContent()}
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
