import { useEffect, useState } from 'react'
import { DocumentIcon } from '@heroicons/react/24/outline'
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

  // Format the display path as "parent_folder / filename"
  const formatDisplayPath = (file: FileItem) => {
    // Split path by slashes
    const parts = file.path.replace(/\\/g, '/').split('/')

    // If only one part (file at root), just return the filename
    if (parts.length === 1) {
      return file.type === 'md' ? file.name.replace(/\.md$/, '') : file.name
    }

    // Get parent folder (second to last part) and filename (last part)
    const parentFolder = parts[parts.length - 2]
    const fileName = file.type === 'md' ? file.name.replace(/\.md$/, '') : file.name

    return { folder: parentFolder, file: fileName }
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
      {mdFiles.map((file, index) => {
        const display = formatDisplayPath(file)
        return (
          <div
            key={file.path}
            className={`autocomplete-item md-file ${
              index === selectedIndex ? 'selected' : ''
            }`}
            onClick={() => onSelect(file)}
          >
            <DocumentIcon className="file-icon icon-md" />
            {typeof display === 'string' ? (
              <span className="file-path file-name-md">{display}</span>
            ) : (
              <span className="file-path">
                <span className="folder-name">{display.folder}</span>
                <span className="separator"> / </span>
                <span className="file-name-md">{display.file}</span>
              </span>
            )}
          </div>
        )
      })}

      {mdFiles.length > 0 && otherFiles.length > 0 && (
        <div className="autocomplete-separator" />
      )}

      {otherFiles.map((file, index) => {
        const actualIndex = mdFiles.length + index
        const display = formatDisplayPath(file)
        return (
          <div
            key={file.path}
            className={`autocomplete-item other-file ${
              actualIndex === selectedIndex ? 'selected' : ''
            }`}
            onClick={() => onSelect(file)}
          >
            <DocumentIcon className="file-icon icon-other" />
            {typeof display === 'string' ? (
              <span className="file-path file-name-other">{display}</span>
            ) : (
              <span className="file-path">
                <span className="folder-name">{display.folder}</span>
                <span className="separator"> / </span>
                <span className="file-name-other">{display.file}</span>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
