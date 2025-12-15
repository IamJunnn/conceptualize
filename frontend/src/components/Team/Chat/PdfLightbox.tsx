/**
 * PdfLightbox - Full-screen PDF viewer for chat attachments
 * Opens PDFs from Firebase Storage URLs in a lightbox modal
 */

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Download,
  ExternalLink,
  Check,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { writeFile } from '@tauri-apps/plugin-fs';
import { downloadDir } from '@tauri-apps/api/path';
import './PdfLightbox.css';

interface PdfLightboxProps {
  isOpen: boolean;
  pdfUrl: string;
  pdfName: string;
  onClose: () => void;
}

export default function PdfLightbox({
  isOpen,
  pdfUrl,
  pdfName,
  onClose,
}: PdfLightboxProps) {
  const [downloaded, setDownloaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setDownloaded(false);
      setLoading(true);
      setError(null);
      setZoom(100);
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
    setZoom(prev => Math.min(prev + 25, 200));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 25, 50));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(100);
  }, []);

  const handleDownload = useCallback(async () => {
    try {
      const downloadsPath = await downloadDir();
      const filePath = `${downloadsPath}/${pdfName}`;

      const response = await fetch(pdfUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status}`);
      }

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      await writeFile(filePath, uint8Array);

      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
    } catch (error) {
      console.error('Download failed:', error);
      window.open(pdfUrl, '_blank');
    }
  }, [pdfUrl, pdfName]);

  const handleOpenInBrowser = useCallback(() => {
    window.open(pdfUrl, '_blank');
  }, [pdfUrl]);

  const handleIframeLoad = useCallback(() => {
    setLoading(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setLoading(false);
    setError('Failed to load PDF. Click "Open in Browser" to view.');
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="pdf-lightbox-overlay" onClick={handleBackdropClick}>
      {/* Top toolbar */}
      <div className="pdf-lightbox-toolbar">
        <div className="pdf-toolbar-left">
          <span className="pdf-name">{pdfName}</span>
          <span className="pdf-zoom-level">{zoom}%</span>
        </div>
        <div className="pdf-toolbar-actions">
          {/* Zoom controls */}
          <button
            className="pdf-toolbar-btn"
            onClick={handleZoomOut}
            title="Zoom out (-)"
            disabled={zoom <= 50}
          >
            <ZoomOut size={18} />
          </button>
          <button
            className="pdf-toolbar-btn"
            onClick={handleZoomIn}
            title="Zoom in (+)"
            disabled={zoom >= 200}
          >
            <ZoomIn size={18} />
          </button>
          <button
            className="pdf-toolbar-btn"
            onClick={handleResetZoom}
            title="Reset zoom (0)"
          >
            <RotateCcw size={18} />
          </button>

          <div className="pdf-toolbar-divider" />

          {/* Actions */}
          <button
            className="pdf-toolbar-btn"
            onClick={handleOpenInBrowser}
            title="Open in browser"
          >
            <ExternalLink size={18} />
          </button>
          <button
            className={`pdf-toolbar-btn ${downloaded ? 'downloaded' : ''}`}
            onClick={handleDownload}
            title={downloaded ? 'Downloaded!' : 'Download'}
          >
            {downloaded ? <Check size={18} /> : <Download size={18} />}
          </button>

          <div className="pdf-toolbar-divider" />

          {/* Close */}
          <button
            className="pdf-toolbar-btn close-btn"
            onClick={onClose}
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* PDF container */}
      <div className="pdf-lightbox-container">
        {loading && (
          <div className="pdf-loading">
            <div className="pdf-loading-spinner" />
            <span>Loading PDF...</span>
          </div>
        )}

        {error ? (
          <div className="pdf-error">
            <p>{error}</p>
            <button className="pdf-error-btn" onClick={handleOpenInBrowser}>
              <ExternalLink size={16} />
              Open in Browser
            </button>
          </div>
        ) : (
          <div
            className="pdf-iframe-wrapper"
            style={{ transform: `scale(${zoom / 100})` }}
          >
            <iframe
              src={pdfUrl}
              title={pdfName}
              className="pdf-lightbox-iframe"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
          </div>
        )}
      </div>
    </div>
  );
}
