/**
 * ImageLightbox - Full-screen image viewer with zoom and actions
 * Like Discord/Slack image preview
 */

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Forward,
  Download,
  Copy,
  Check,
} from 'lucide-react';
import { writeFile } from '@tauri-apps/plugin-fs';
import { downloadDir } from '@tauri-apps/api/path';
import { Channel } from '../../../services/teamChatTypes';
import { TeamMember } from '../../../services/teamService';
import ShareToChatModal from './ShareToChatModal';
import './ImageLightbox.css';

interface ImageLightboxProps {
  isOpen: boolean;
  imageUrl: string;
  imageName: string;
  onClose: () => void;
  // Optional share-to-chat functionality
  channels?: Channel[];
  currentChannelId?: string;
  currentUserEmail?: string;
  members?: { [email: string]: TeamMember }; // Add members for avatar lookup
  onShareToChat?: (targetChannelId: string, message?: string) => Promise<void>;
}

export default function ImageLightbox({
  isOpen,
  imageUrl,
  imageName,
  onClose,
  channels,
  currentChannelId,
  currentUserEmail,
  members,
  onShareToChat,
}: ImageLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showShareModal, setShowShareModal] = useState(false);

  // Check if in-app sharing is available
  const canShareToChat = channels && currentChannelId && currentUserEmail && onShareToChat;

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      setCopied(false);
      setDownloaded(false);
      setShowShareModal(false);
    }
  }, [isOpen]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
          handleZoomOut();
          break;
        case '0':
          handleResetZoom();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.25, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.25, 0.25));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleDownload = useCallback(async () => {
    try {
      // Get the Downloads folder path
      const downloadsPath = await downloadDir();
      const filePath = `${downloadsPath}/${imageName}`;

      // Fetch the image from Firebase Storage
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Write to Downloads folder
      await writeFile(filePath, uint8Array);

      // Show success indicator
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback: open in new tab
      window.open(imageUrl, '_blank');
    }
  }, [imageUrl, imageName]);

  const handleCopyImage = useCallback(async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
      // Fallback: copy URL
      try {
        await navigator.clipboard.writeText(imageUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        alert('Failed to copy image');
      }
    }
  }, [imageUrl]);

  const handleShare = useCallback(() => {
    // If in-app sharing is available, show the modal
    if (canShareToChat) {
      setShowShareModal(true);
    } else {
      // Fallback: copy URL to clipboard
      navigator.clipboard.writeText(imageUrl)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {
          alert('Copy URL to clipboard failed');
        });
    }
  }, [imageUrl, canShareToChat]);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.min(Math.max(prev + delta, 0.25), 4));
  }, []);

  // Drag to pan when zoomed
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [zoom, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Click backdrop to close (only if not zoomed in)
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && zoom === 1) {
      onClose();
    }
  }, [onClose, zoom]);

  if (!isOpen) return null;

  return (
    <div className="image-lightbox-overlay" onClick={handleBackdropClick}>
      {/* Top toolbar */}
      <div className="lightbox-toolbar">
        <div className="toolbar-left">
          <span className="image-name">{imageName}</span>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
        </div>
        <div className="toolbar-actions">
          {/* Zoom controls */}
          <button
            className="toolbar-btn"
            onClick={handleZoomOut}
            title="Zoom out (-)"
            disabled={zoom <= 0.25}
          >
            <ZoomOut size={18} />
          </button>
          <button
            className="toolbar-btn"
            onClick={handleZoomIn}
            title="Zoom in (+)"
            disabled={zoom >= 4}
          >
            <ZoomIn size={18} />
          </button>
          <button
            className="toolbar-btn"
            onClick={handleResetZoom}
            title="Reset zoom (0)"
          >
            <RotateCcw size={18} />
          </button>

          <div className="toolbar-divider" />

          {/* Actions */}
          <button
            className="toolbar-btn"
            onClick={handleShare}
            title="Forward / Share"
          >
            <Forward size={18} />
          </button>
          <button
            className={`toolbar-btn ${downloaded ? 'downloaded' : ''}`}
            onClick={handleDownload}
            title={downloaded ? 'Downloaded!' : 'Download'}
          >
            {downloaded ? <Check size={18} /> : <Download size={18} />}
          </button>
          <button
            className="toolbar-btn"
            onClick={handleCopyImage}
            title="Copy image"
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>

          <div className="toolbar-divider" />

          {/* Close */}
          <button
            className="toolbar-btn close-btn"
            onClick={onClose}
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Image container */}
      <div
        className={`lightbox-image-container ${isDragging ? 'dragging' : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={imageUrl}
          alt={imageName}
          className="lightbox-image"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
            cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          }}
          draggable={false}
        />
      </div>

      {/* Share to Chat Modal */}
      {canShareToChat && (
        <ShareToChatModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          imageUrl={imageUrl}
          imageName={imageName}
          channels={channels}
          currentChannelId={currentChannelId}
          currentUserEmail={currentUserEmail}
          teamMembers={members ? Object.entries(members).map(([email, m]) => ({
            email,
            displayName: m.displayName,
            photoURL: m.photoURL,
            customAvatar: m.customAvatar,
          })) : undefined}
          onShare={onShareToChat}
        />
      )}
    </div>
  );
}
