/**
 * FileLightbox - Modal viewer for document attachments (DOCX, XLSX, PPTX)
 * Displays files in a read-only viewer with download option
 */

import React, { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import './FileLightbox.css';

interface FileLightboxProps {
  isOpen: boolean;
  fileUrl: string;
  fileName: string;
  fileType: 'docx' | 'xlsx' | 'pptx';
  onClose: () => void;
}

export default function FileLightbox({
  isOpen,
  fileUrl,
  fileName,
  fileType,
  onClose,
}: FileLightboxProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const loadFile = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch file from URL
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.status}`);
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();

        // Render based on file type
        if (fileType === 'docx') {
          const result = await mammoth.convertToHtml({ arrayBuffer });
          setContent(result.value);
        } else if (fileType === 'xlsx') {
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          let html = '';

          workbook.SheetNames.forEach((sheetName, index) => {
            const worksheet = workbook.Sheets[sheetName];
            const sheetHtml = XLSX.utils.sheet_to_html(worksheet, {
              id: `sheet-${index}`,
              editable: false,
            });
            html += `
              <div class="excel-sheet">
                <h3 class="excel-sheet-name">${sheetName}</h3>
                ${sheetHtml}
              </div>
            `;
          });

          setContent(html);
        } else if (fileType === 'pptx') {
          // PowerPoint: Show message that viewer is limited
          setContent(`
            <div class="pptx-preview-message">
              <p><strong>PowerPoint Preview</strong></p>
              <p>Full preview for PowerPoint files is not available.</p>
              <p>Please download the file to view it in PowerPoint.</p>
            </div>
          `);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading file:', err);
        setError('Failed to load document. Please try downloading instead.');
        setLoading(false);
      }
    };

    loadFile();
  }, [isOpen, fileUrl, fileType]);

  const handleDownload = () => {
    window.open(fileUrl, '_blank');
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="file-lightbox-overlay" onClick={handleBackdropClick}>
      <div className="file-lightbox-modal">
        <div className="file-lightbox-header">
          <h3 className="file-lightbox-title">{fileName}</h3>
          <div className="file-lightbox-actions">
            <button
              className="file-lightbox-action-btn"
              onClick={handleDownload}
              title="Download"
            >
              <Download size={18} />
            </button>
            <button
              className="file-lightbox-close-btn"
              onClick={onClose}
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="file-lightbox-content">
          {loading && (
            <div className="file-lightbox-loading">
              <div className="loading-spinner" />
              <p>Loading document...</p>
            </div>
          )}

          {error && (
            <div className="file-lightbox-error">
              <p>{error}</p>
              <button className="download-fallback-btn" onClick={handleDownload}>
                Download File
              </button>
            </div>
          )}

          {!loading && !error && (
            <div
              className={`file-lightbox-viewer ${fileType}-viewer`}
              dangerouslySetInnerHTML={{ __html: content }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
