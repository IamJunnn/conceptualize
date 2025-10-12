import { useState, useEffect } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import './ImageViewer.css'

interface ImageViewerProps {
  filePath: string
  fileName: string
  rootPath?: string
}

function ImageViewer({ filePath, fileName, rootPath }: ImageViewerProps) {
  const [imageSrc, setImageSrc] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)

  // Calculate relative path from root
  const getRelativePath = () => {
    if (!rootPath) return fileName

    // Normalize paths (handle both forward and back slashes)
    const normalizedFilePath = filePath.replace(/\\/g, '/')
    const normalizedRootPath = rootPath.replace(/\\/g, '/')

    if (normalizedFilePath.startsWith(normalizedRootPath)) {
      // Remove root path and leading slash
      let relativePath = normalizedFilePath.substring(normalizedRootPath.length)
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1)
      }
      return relativePath
    }

    return fileName
  }

  useEffect(() => {
    try {
      // Convert file path to secure URL that Tauri can load
      const secureUrl = convertFileSrc(filePath)
      setImageSrc(secureUrl)
      setIsLoading(false)
    } catch (err) {
      console.error('Failed to load image:', err)
      setError(`Failed to load image: ${err}`)
      setIsLoading(false)
    }
  }, [filePath])

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 25, 500))
  }

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 25, 25))
  }

  const handleZoomReset = () => {
    setZoom(100)
  }

  if (isLoading) {
    return (
      <div className="image-viewer-loading">
        <p>Loading image...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="image-viewer-error">
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div className="image-viewer-container">
      <div className="image-viewer-header">
        <span className="image-filename">{getRelativePath()}</span>
        <div className="image-controls">
          <button
            onClick={handleZoomOut}
            className="image-zoom-btn"
            title="Zoom Out"
            disabled={zoom <= 25}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="8" y1="11" x2="14" y2="11" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <span className="image-zoom-level">{zoom}%</span>
          <button
            onClick={handleZoomIn}
            className="image-zoom-btn"
            title="Zoom In"
            disabled={zoom >= 500}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <button
            onClick={handleZoomReset}
            className="image-reset-btn"
            title="Reset Zoom"
          >
            Reset
          </button>
        </div>
      </div>
      <div className="image-viewer-content">
        <div className="image-wrapper">
          <img
            src={imageSrc}
            alt={fileName}
            style={{ width: `${zoom}%` }}
            className="image-display"
          />
        </div>
      </div>
    </div>
  )
}

export default ImageViewer
