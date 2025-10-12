import { useState, useEffect } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import './PdfViewer.css'

interface PdfViewerProps {
  filePath: string
  fileName: string
  rootPath?: string
}

function PdfViewer({ filePath, fileName, rootPath }: PdfViewerProps) {
  const [pdfSrc, setPdfSrc] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        <span className="pdf-filename">{getRelativePath()}</span>
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
