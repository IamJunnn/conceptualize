import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import './PowerPointViewer.css';
import '../UI/CustomScrollbar.css';

interface PowerPointViewerProps {
  filePath: string;
  fileName: string;
  rootPath?: string;
}

const PowerPointViewer: React.FC<PowerPointViewerProps> = ({ filePath, fileName }) => {
  const handleOpenExternal = async () => {
    try {
      await invoke('open_file_external', { path: filePath });
    } catch (error) {
      console.error('Error opening PowerPoint file:', error);
      alert('Failed to open PowerPoint file in external application');
    }
  };

  return (
    <div className="powerpoint-viewer custom-scrollbar">
      {/* Header */}
      <div className="powerpoint-viewer-header">
        <h2>{fileName}</h2>
      </div>

      {/* Content */}
      <div className="powerpoint-viewer-content custom-scrollbar">
        <div className="powerpoint-message">
          <svg
            width="80"
            height="80"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="powerpoint-icon"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="M9 15h6" />
            <path d="M9 11h6" />
          </svg>
          <h3>PowerPoint Presentation</h3>
          <p>Preview is not available for PowerPoint files.</p>
          <p className="file-info">Click the button below to open in PowerPoint.</p>

          <button className="open-powerpoint-button" onClick={handleOpenExternal}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ marginRight: '8px' }}
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Open in PowerPoint
          </button>
        </div>
      </div>
    </div>
  );
};

export default PowerPointViewer;
