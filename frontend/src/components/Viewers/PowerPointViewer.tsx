import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TeamDriveStorage } from '../../services/teamDriveStorage';
import './PowerPointViewer.css';
import '../UI/CustomScrollbar.css';

interface PowerPointViewerProps {
  filePath: string;
  fileName: string;
  rootPath?: string;
  fileId?: string;
  storageBackend?: TeamDriveStorage;
}

const PowerPointViewer: React.FC<PowerPointViewerProps> = ({ filePath, fileName, fileId, storageBackend }) => {
  const [downloading, setDownloading] = useState(false);

  const handleOpenExternal = async () => {
    try {
      await invoke('open_file_external', { path: filePath });
    } catch (error) {
      console.error('Error opening PowerPoint file:', error);
      alert('Failed to open PowerPoint file in external application');
    }
  };

  const handleDownload = async () => {
    if (!storageBackend || !fileId) return;

    try {
      setDownloading(true);
      const blob = await storageBackend.downloadFileAsBlob(fileId);

      // Create a download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading PowerPoint file:', error);
      alert('Failed to download PowerPoint file');
    } finally {
      setDownloading(false);
    }
  };

  const isTeamMode = storageBackend && fileId;

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
          <p className="file-info">
            {isTeamMode
              ? 'Click the button below to download and open in PowerPoint.'
              : 'Click the button below to open in PowerPoint.'}
          </p>

          {isTeamMode ? (
            <button
              className="open-powerpoint-button"
              onClick={handleDownload}
              disabled={downloading}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ marginRight: '8px' }}
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {downloading ? 'Downloading...' : 'Download PowerPoint'}
            </button>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
};

export default PowerPointViewer;
