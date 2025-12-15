/**
 * ChatFileUploadModal - Modal for uploading files in chat
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Upload, File as FileIcon, Image, FileText, AlertCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import ConfirmModal from '../../UI/ConfirmModal';
import './ChatFileUploadModal.css';

interface ChatFileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File, caption?: string) => Promise<void>;
  maxFileSizeMB?: number;
}

const MAX_FILE_SIZE_DEFAULT = 500; // 500MB default

export default function ChatFileUploadModal({
  isOpen,
  onClose,
  onUpload,
  maxFileSizeMB = MAX_FILE_SIZE_DEFAULT,
}: ChatFileUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showFileTooLargeModal, setShowFileTooLargeModal] = useState(false);
  const [rejectedFileName, setRejectedFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;

  const validateFile = (file: File): string | null => {
    if (file.size > maxFileSizeBytes) {
      return `File is too large. Maximum size is ${maxFileSizeMB}MB.`;
    }
    return null;
  };

  const handleFileSelect = useCallback((file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      // Show modal for file too large
      setRejectedFileName(file.name);
      setShowFileTooLargeModal(true);
      setSelectedFile(null);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }
    setError(null);
    setSelectedFile(file);
  }, [maxFileSizeBytes]);

  // Listen for Tauri native file drops (from Windows Explorer)
  useEffect(() => {
    if (!isOpen) return;

    const handleTauriFileDrop = async (event: CustomEvent<{ paths: string[], position: { x: number, y: number } }>) => {
      const { paths } = event.detail;

      if (paths && paths.length > 0) {
        const filePath = paths[0]; // Only handle first file
        try {
          const fileName = filePath.split(/[/\\]/).pop() || 'file';
          // Get MIME type from extension
          const ext = fileName.split('.').pop()?.toLowerCase() || '';
          const mimeTypes: Record<string, string> = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            'pdf': 'application/pdf',
            'txt': 'text/plain',
            'md': 'text/markdown',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'ppt': 'application/vnd.ms-powerpoint',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'zip': 'application/zip',
            'mp3': 'audio/mpeg',
            'mp4': 'video/mp4',
          };
          const mimeType = mimeTypes[ext] || 'application/octet-stream';

          // Read file as binary using Tauri command
          const bytes = await invoke<number[]>('read_binary_file', { filePath });
          const uint8Array = new Uint8Array(bytes);
          const file = new File([uint8Array], fileName, { type: mimeType });
          handleFileSelect(file);
        } catch (err) {
          console.error('[ChatFileUploadModal] Failed to read file:', filePath, err);
          setError('Failed to read dropped file. Please try again.');
        }
      }
    };

    window.addEventListener('file-upload-modal-drop', handleTauriFileDrop as unknown as EventListener);
    return () => {
      window.removeEventListener('file-upload-modal-drop', handleTauriFileDrop as unknown as EventListener);
    };
  }, [isOpen, handleFileSelect]);

  // Listen for Tauri native drag events to show visual feedback
  useEffect(() => {
    if (!isOpen) return;

    const handleTauriDrag = (event: CustomEvent<{ isDragging: boolean }>) => {
      setDragOver(event.detail.isDragging);
    };

    window.addEventListener('file-upload-modal-drag', handleTauriDrag as EventListener);
    return () => {
      window.removeEventListener('file-upload-modal-drag', handleTauriDrag as EventListener);
    };
  }, [isOpen]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Handle drag enter on the drop zone
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setDragOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Set dropEffect to show the copy cursor
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragOver to false if we're leaving the drop zone entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  // Prevent default browser behavior for drag events on overlay
  const handleOverlayDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleOverlayDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Also handle drop on overlay - forward to the file handler
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
    setDragOver(false);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError(null);

    try {
      await onUpload(selectedFile, caption.trim() || undefined);
      handleClose();
    } catch (err) {
      console.error('Upload failed:', err);
      setError('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setCaption('');
    setError(null);
    setDragOver(false);
    onClose();
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <Image size={24} />;
    }
    if (file.type.includes('pdf') || file.type.includes('document')) {
      return <FileText size={24} />;
    }
    return <FileIcon size={24} />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!isOpen) return null;

  return (
    <div
      className="chat-file-upload-overlay"
      onDragOver={handleOverlayDragOver}
      onDrop={handleOverlayDrop}
    >
      <div className="chat-file-upload-modal">
        <div className="modal-header">
          <h3>Upload File</h3>
          <button className="close-btn" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Drop zone */}
          <div
            className={`drop-zone ${dragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
            />

            {selectedFile ? (
              <div className="selected-file">
                <div className="file-icon">{getFileIcon(selectedFile)}</div>
                <div className="file-info">
                  <span className="file-name">{selectedFile.name}</span>
                  <span className="file-size">{formatFileSize(selectedFile.size)}</span>
                </div>
                <button
                  className="remove-file-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="drop-zone-content">
                <Upload size={32} />
                <p>Drag & drop a file here</p>
                <span>or click to browse</span>
                <span className="size-limit">Max file size: {maxFileSizeMB}MB</span>
              </div>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="upload-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Caption input */}
          {selectedFile && (
            <div className="caption-input">
              <label>Add a caption (optional)</label>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write something about this file..."
                disabled={uploading}
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={handleClose} disabled={uploading}>
            Cancel
          </button>
          <button
            className="upload-btn"
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
          >
            {uploading ? (
              <>
                <span className="upload-spinner" />
                Uploading...
              </>
            ) : (
              <>
                <Upload size={16} />
                Upload
              </>
            )}
          </button>
        </div>
      </div>

      {/* File Too Large Modal */}
      <ConfirmModal
        isOpen={showFileTooLargeModal}
        title="File Too Large"
        message={`"${rejectedFileName}" is too large to share. The maximum file size is ${maxFileSizeMB}MB.`}
        confirmText="OK"
        variant="info"
        hideCancel={true}
        onConfirm={() => setShowFileTooLargeModal(false)}
        onCancel={() => setShowFileTooLargeModal(false)}
      />
    </div>
  );
}
