import { useState, useEffect } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { TeamDriveStorage } from '../../services/teamDriveStorage'
import './PdfViewer.css'

interface PdfViewerProps {
  filePath: string
  fileName: string
  rootPath?: string
  fileId?: string
  storageBackend?: TeamDriveStorage
}

function PdfViewer({ filePath, fileName, rootPath, fileId, storageBackend }: PdfViewerProps) {
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
    const loadPdf = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Team mode: load from Firebase Storage
        if (storageBackend && fileId) {
          const blob = await storageBackend.downloadFileAsBlob(fileId)
          const blobUrl = URL.createObjectURL(blob)
          setPdfSrc(blobUrl)
          setIsLoading(false)
          return
        }

        // Local mode: use Tauri's convertFileSrc
        const secureUrl = convertFileSrc(filePath)
        setPdfSrc(secureUrl)
        setIsLoading(false)
      } catch (err) {
        console.error('Failed to load PDF:', err)
        setError(`Failed to load PDF: ${err}`)
        setIsLoading(false)
      }
    }

    loadPdf()

    // Cleanup blob URL when component unmounts or fileId changes
    return () => {
      if (pdfSrc && pdfSrc.startsWith('blob:')) {
        URL.revokeObjectURL(pdfSrc)
      }
    }
  }, [filePath, fileId, storageBackend])

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
