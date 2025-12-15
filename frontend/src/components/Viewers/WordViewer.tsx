import React, { useState, useEffect } from 'react';
import mammoth from 'mammoth';
import { invoke } from '@tauri-apps/api/core';
import { TeamDriveStorage } from '../../services/teamDriveStorage';
import './WordViewer.css';
import '../UI/CustomScrollbar.css';

interface WordViewerProps {
  filePath: string;
  fileName: string;
  rootPath?: string;
  fileId?: string;
  storageBackend?: TeamDriveStorage;
}

const WordViewer: React.FC<WordViewerProps> = ({ filePath, fileName, fileId, storageBackend }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWordFile = async () => {
      try {
        setLoading(true);
        setError(null);

        let arrayBuffer: ArrayBuffer;

        // Team mode: load from Firebase Storage
        if (storageBackend && fileId) {
          const blob = await storageBackend.downloadFileAsBlob(fileId);
          arrayBuffer = await blob.arrayBuffer();
        } else {
          // Local mode: Read the file using Tauri's read_binary_file command
          const fileContent = await invoke<number[]>('read_binary_file', { filePath });
          // Convert to Uint8Array for mammoth
          arrayBuffer = new Uint8Array(fileContent).buffer;
        }

        // Convert to HTML using mammoth
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setContent(result.value);
        setLoading(false);
      } catch (err) {
        console.error('Error loading Word file:', err);
        setError('Failed to load Word document');
        setLoading(false);
      }
    };

    loadWordFile();
  }, [filePath, fileId, storageBackend]);

  if (loading) {
    return (
      <div className="loading-or-error">
        Loading Word document...
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-or-error error-message">
        {error}
      </div>
    );
  }

  return (
    <div className="word-viewer custom-scrollbar">
      <div className="word-viewer-content">
        <h2>
          {fileName}
        </h2>
        <div
          dangerouslySetInnerHTML={{ __html: content }}
          className="word-viewer-text"
        />
      </div>
    </div>
  );
};

export default WordViewer;
