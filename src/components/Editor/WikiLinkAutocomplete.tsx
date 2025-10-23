import { useEffect, useState, useRef } from 'react'
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
  onClickOutsideClose?: () => void // Called when autocomplete is closed by click-outside
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
  onClickOutsideClose,
  selectedIndex,
  onNavigate,
}: WikiLinkAutocompleteProps) {
  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([])
  const [adjustedPosition, setAdjustedPosition] = useState(position)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Use refs for callbacks to avoid recreating the handler
  const onCloseRef = useRef(onClose)
  const onClickOutsideCloseRef = useRef(onClickOutsideClose)

  useEffect(() => {
    onCloseRef.current = onClose
    onClickOutsideCloseRef.current = onClickOutsideClose
  }, [onClose, onClickOutsideClose])

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

  // Smart positioning: check available space and position dropdown accordingly
  useEffect(() => {
    if (!visible || !dropdownRef.current) return

    const dropdown = dropdownRef.current
    const dropdownHeight = dropdown.offsetHeight
    const viewportHeight = window.innerHeight

    const spaceBelow = viewportHeight - position.top
    const spaceAbove = position.top

    // If more space above and not enough space below, show above
    if (spaceAbove > spaceBelow && spaceBelow < dropdownHeight) {
      setAdjustedPosition({
        top: position.top - dropdownHeight - 5, // 5px gap above cursor
        left: position.left,
      })
    } else {
      // Default: show below
      setAdjustedPosition(position)
    }
  }, [visible, position, filteredFiles])

  // Close dropdown when clicking outside - TEMPORARILY DISABLED FOR DEBUGGING
  // useEffect(() => {
  //   if (!visible) return

  //   const handleClickOutside = (event: MouseEvent) => {
  //     if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
  //       // Stop the event from propagating to prevent it from reopening the autocomplete
  //       event.stopImmediatePropagation()

  //       // Dispatch close event with clickOutside flag to notify the plugin
  //       window.dispatchEvent(
  //         new CustomEvent('wiki-link-autocomplete-close', {
  //           detail: { clickOutside: true },
  //         })
  //       )

  //       // Call the click-outside callback
  //       if (onClickOutsideCloseRef.current) {
  //         onClickOutsideCloseRef.current()
  //       }

  //       // Close the autocomplete
  //       onCloseRef.current()
  //     }
  //   }

  //   // Delay adding the listener to prevent immediate closure from the same event that opened it
  //   const timeoutId = setTimeout(() => {
  //     document.addEventListener('mousedown', handleClickOutside, true)
  //   }, 150)

  //   return () => {
  //     clearTimeout(timeoutId)
  //     document.removeEventListener('mousedown', handleClickOutside, true)
  //   }
  // }, [visible])

  if (!visible || filteredFiles.length === 0) {
    return null
  }

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
      ref={dropdownRef}
      className="wiki-link-autocomplete"
      style={{
        top: `${adjustedPosition.top}px`,
        left: `${adjustedPosition.left}px`,
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
