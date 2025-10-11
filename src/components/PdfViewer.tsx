import { useState, useEffect } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import './PdfViewer.css'

interface PdfViewerProps {
  filePath: string
  fileName: string
}

function PdfViewer({ filePath, fileName }: PdfViewerProps) {
  const [pdfSrc, setPdfSrc] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      // Convert file path to secure URL that Tauri can load
      const secureUrl = convertFileSrc(filePath)
      setPdfSrc(secureUrl)
      setIsLoading(false)
    } catch (err) {
      console.error('Failed to load PDF:', err)
      setError(`Failed to load PDF: ${err}`)
      setIsLoading(false)
    }
  }, [filePath])

  if (isLoading) {
    return (
      <div className="pdf-viewer-loading">
        <p>Loading PDF...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pdf-viewer-error">
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div className="pdf-viewer-container">
      <div className="pdf-viewer-header">
        <span className="pdf-filename">{fileName}</span>
        <div className="pdf-controls">
          <a
            href={pdfSrc}
            download={fileName}
            className="pdf-download-btn"
            title="Download PDF"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download
          </a>
        </div>
      </div>
      <div className="pdf-viewer-content">
        <iframe
          src={pdfSrc}
          title={fileName}
          className="pdf-iframe"
        />
      </div>
    </div>
  )
}

export default PdfViewer
