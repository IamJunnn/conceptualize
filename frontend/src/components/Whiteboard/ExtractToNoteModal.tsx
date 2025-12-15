/**
 * ExtractToNoteModal Component
 * Modal for extracting whiteboard content to a markdown note
 */

import React, { useState, useEffect } from 'react';
import { X, ChevronRight, Folder, FileText } from 'lucide-react';
import { Whiteboard } from '../../services/whiteboardTypes';
import { generateMarkdownFromWhiteboard } from '../../services/whiteboardService';
import './ExtractToNoteModal.css';

interface FileTreeNode {
  path: string;
  name: string;
  type: 'file' | 'folder';
  id?: string;
}

interface ExtractToNoteModalProps {
  whiteboard: Whiteboard;
  fileTree: FileTreeNode[];
  onClose: () => void;
  onExtract: (content: string, targetPath: string, fileName: string) => Promise<void>;
}

const ExtractToNoteModal: React.FC<ExtractToNoteModalProps> = ({
  whiteboard,
  fileTree,
  onClose,
  onExtract,
}) => {
  const [fileName, setFileName] = useState(`${whiteboard.name}.md`);
  const [targetPath, setTargetPath] = useState('');
  const [convertLinks, setConvertLinks] = useState(true);
  const [includeEmbedded, setIncludeEmbedded] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // Generate preview when options change
  useEffect(() => {
    const content = generateMarkdownFromWhiteboard(whiteboard, {
      convertLinksToWikiLinks: convertLinks,
      includeEmbeddedContent: includeEmbedded,
    });
    setPreview(content);
  }, [whiteboard, convertLinks, includeEmbedded]);

  // Get folders from file tree
  const folders = fileTree.filter((node) => node.type === 'folder');

  // Handle extract
  const handleExtract = async () => {
    if (!fileName.trim()) {
      setError('Please enter a file name');
      return;
    }

    // Ensure .md extension
    let finalFileName = fileName.trim();
    if (!finalFileName.endsWith('.md')) {
      finalFileName += '.md';
    }

    setIsExtracting(true);
    setError('');

    try {
      const content = generateMarkdownFromWhiteboard(whiteboard, {
        convertLinksToWikiLinks: convertLinks,
        includeEmbeddedContent: includeEmbedded,
      });

      await onExtract(content, targetPath, finalFileName);
      onClose();
    } catch (err) {
      setError('Failed to extract note. Please try again.');
      setIsExtracting(false);
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showFolderPicker) {
          setShowFolderPicker(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showFolderPicker]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="extract-modal-backdrop" onClick={handleBackdropClick}>
      <div className="extract-modal">
        <div className="modal-header">
          <h2>Extract to Note</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* File name */}
          <div className="form-group">
            <label>File Name</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => {
                setFileName(e.target.value);
                setError('');
              }}
              placeholder="note-name.md"
            />
          </div>

          {/* Target folder */}
          <div className="form-group">
            <label>Save to Folder</label>
            <div className="folder-selector">
              <button
                type="button"
                className="folder-select-btn"
                onClick={() => setShowFolderPicker(!showFolderPicker)}
              >
                <Folder size={16} />
                <span>{targetPath || 'Root folder'}</span>
                <ChevronRight
                  size={16}
                  className={`chevron ${showFolderPicker ? 'open' : ''}`}
                />
              </button>

              {showFolderPicker && (
                <div className="folder-picker">
                  <div
                    className={`folder-item ${targetPath === '' ? 'selected' : ''}`}
                    onClick={() => {
                      setTargetPath('');
                      setShowFolderPicker(false);
                    }}
                  >
                    <Folder size={14} />
                    <span>Root folder</span>
                  </div>
                  {folders.map((folder) => (
                    <div
                      key={folder.path}
                      className={`folder-item ${targetPath === folder.path ? 'selected' : ''}`}
                      onClick={() => {
                        setTargetPath(folder.path);
                        setShowFolderPicker(false);
                      }}
                    >
                      <Folder size={14} />
                      <span>{folder.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="form-group">
            <label>Options</label>
            <div className="options-list">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={convertLinks}
                  onChange={(e) => setConvertLinks(e.target.checked)}
                />
                <span>Convert connections to [[wiki-links]]</span>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={includeEmbedded}
                  onChange={(e) => setIncludeEmbedded(e.target.checked)}
                />
                <span>Include embedded note content</span>
              </label>
            </div>
          </div>

          {/* Preview */}
          <div className="form-group">
            <label>Preview</label>
            <div className="preview-box">
              <pre>{preview}</pre>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="cancel-btn"
            onClick={onClose}
            disabled={isExtracting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="extract-btn"
            onClick={handleExtract}
            disabled={isExtracting || !fileName.trim()}
          >
            <FileText size={16} />
            {isExtracting ? 'Extracting...' : 'Extract Note'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExtractToNoteModal;
