import { useEffect, useState } from 'react'
import './WikiLinkAutocomplete.css'

interface FileItem {
  name: string
  path: string
  type: 'md' | 'svg' | 'pdf' | 'png' | 'jpg' | 'other'
}

interface WikiLinkAutocompleteProps {
  visible: boolean
  position: { top: number; left: number }
  searchQuery: string
  files: FileItem[]
  onSelect: (file: FileItem) => void
  onClose: () => void
  selectedIndex: number
  onNavigate: (direction: 'up' | 'down') => void
}

export default function WikiLinkAutocomplete({
  visible,
  position,
  searchQuery,
  files,
  onSelect,
  onClose,
  selectedIndex,
  onNavigate,
}: WikiLinkAutocompleteProps) {
  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([])

  useEffect(() => {
    if (!searchQuery) {
      setFilteredFiles(files)
      return
    }

    const query = searchQuery.toLowerCase()
    const filtered = files.filter(
      (file) =>
        file.name.toLowerCase().includes(query) ||
        file.path.toLowerCase().includes(query)
    )
    setFilteredFiles(filtered)
  }, [searchQuery, files])

  if (!visible || filteredFiles.length === 0) return null

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'md':
        return '📝'
      case 'svg':
        return '📄'
      case 'pdf':
        return '📄'
      case 'png':
      case 'jpg':
        return '🖼️'
      default:
        return '📄'
    }
  }

  // Separate md files from others
  const mdFiles = filteredFiles.filter((f) => f.type === 'md')
  const otherFiles = filteredFiles.filter((f) => f.type !== 'md')

  return (
    <div
      className="wiki-link-autocomplete"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {mdFiles.map((file, index) => (
        <div
          key={file.path}
          className={`autocomplete-item md-file ${
            index === selectedIndex ? 'selected' : ''
          }`}
          onClick={() => onSelect(file)}
        >
          <span className="file-icon">{getFileIcon(file.type)}</span>
          <span className="file-path">{file.path}</span>
        </div>
      ))}

      {mdFiles.length > 0 && otherFiles.length > 0 && (
        <div className="autocomplete-separator" />
      )}

      {otherFiles.map((file, index) => {
        const actualIndex = mdFiles.length + index
        return (
          <div
            key={file.path}
            className={`autocomplete-item other-file ${
              actualIndex === selectedIndex ? 'selected' : ''
            }`}
            onClick={() => onSelect(file)}
          >
            <span className="file-icon">{getFileIcon(file.type)}</span>
            <span className="file-path">{file.path}</span>
          </div>
        )
      })}
    </div>
  )
}
