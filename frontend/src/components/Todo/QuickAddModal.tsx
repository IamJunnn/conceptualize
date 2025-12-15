import React, { useState, useEffect, useRef } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { invoke } from '@tauri-apps/api/core'
import './QuickAddModal.css'

interface QuickAddModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: TodoFormData) => void
  rootPath?: string
  context?: 'editor' | 'fab' // Where the modal was opened from
  currentNotePath?: string // Current note path if opened from editor
}

export interface TodoFormData {
  text: string
  priority: number | null
  startDate: string | null
  endDate: string | null
  linkedNotePath: string | null
  linkedNoteName: string | null
  description: string | null
}

interface FileItem {
  name: string
  path: string
  type: 'md' | 'svg' | 'pdf' | 'png' | 'jpg' | 'other'
}

const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  rootPath,
  context = 'fab',
  currentNotePath
}) => {
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<number | null>(null)
  const [startDate, setStartDate] = useState<string | null>(null)
  const [endDate, setEndDate] = useState<string | null>(null)
  const [linkedNotePath, setLinkedNotePath] = useState<string | null>(null)
  const [linkedNoteName, setLinkedNoteName] = useState<string | null>(null)
  const [noteSearchQuery, setNoteSearchQuery] = useState('')
  const [description, setDescription] = useState<string | null>(null)
  const [files, setFiles] = useState<FileItem[]>([])
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [, setAutocompletePosition] = useState({ top: 0, left: 0 })
  const [selectedAutocompleteIndex, setSelectedAutocompleteIndex] = useState(0)
  const noteInputRef = useRef<HTMLInputElement>(null)
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Load files when modal opens
  useEffect(() => {
    if (isOpen && rootPath) {
      loadFiles()
    }
  }, [isOpen, rootPath])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setText('')
      setPriority(null)
      setStartDate(null)
      setEndDate(null)

      // If opened from editor, auto-set the current note
      if (context === 'editor' && currentNotePath) {
        setLinkedNotePath(currentNotePath)
        const fileName = currentNotePath.split(/[/\\]/).pop() || ''
        setLinkedNoteName(fileName.replace(/\.md$/, ''))
        setNoteSearchQuery(`[[${fileName.replace(/\.md$/, '')}]]`)
      } else {
        setLinkedNotePath(null)
        setLinkedNoteName(null)
        setNoteSearchQuery('')
      }

      setDescription(null)
      setShowAutocomplete(false)
    }
  }, [isOpen, context, currentNotePath])

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  const loadFiles = async () => {
    if (!rootPath) {
      return
    }
    try {
      const result = await invoke<{ files: Array<{ path: string; content: string }> }>('get_markdown_files', { rootPath })

      // Convert to FileItem format
      const fileList: FileItem[] = result.files.map(file => {
        const fileName = file.path.split(/[/\\]/).pop() || ''
        const extension = fileName.split('.').pop()?.toLowerCase()

        let type: FileItem['type'] = 'other'
        if (extension === 'md') type = 'md'
        else if (extension === 'svg') type = 'svg'
        else if (extension === 'pdf') type = 'pdf'
        else if (extension === 'png') type = 'png'
        else if (extension === 'jpg' || extension === 'jpeg') type = 'jpg'

        return {
          name: fileName,
          path: file.path,
          type
        }
      })

      setFiles(fileList)
    } catch (error) {
      console.error('❌ Failed to load files:', error)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return

    onSubmit({
      text: text.trim(),
      priority,
      startDate,
      endDate,
      linkedNotePath,
      linkedNoteName,
      description
    })

    onClose()
  }

  const handleNoteInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setNoteSearchQuery(value)
    setSelectedAutocompleteIndex(0)

    // Check if user completed [[something]]
    const bracketMatch = value.match(/\[\[(.*?)\]\]/)

    if (bracketMatch) {
      // User has completed [[something]], select that note if it exists
      const noteName = bracketMatch[1]
      const matchedFile = files.find(f =>
        f.type === 'md' && f.name.replace(/\.md$/, '').toLowerCase() === noteName.toLowerCase()
      )

      if (matchedFile) {
        setLinkedNotePath(matchedFile.path)
        setLinkedNoteName(matchedFile.name.replace(/\.md$/, ''))
      }
      setShowAutocomplete(false)
    } else if (!value.trim()) {
      // If input is cleared, reset linked note
      setLinkedNotePath(null)
      setLinkedNoteName(null)
    }
  }

  const handleNoteInputFocus = () => {
    // Clear any pending blur timeout
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = null
    }

    setShowAutocomplete(true)
    setSelectedAutocompleteIndex(0)

    // Update autocomplete position
    if (noteInputRef.current) {
      const rect = noteInputRef.current.getBoundingClientRect()
      setAutocompletePosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX
      })
    }
  }

  const handleFileSelect = (file: FileItem) => {
    // Get the relative path from rootPath (including subfolders)
    const { folder, name } = getFileFolderAndName(file.path)
    // Store without .md extension - path like "conceptualize/testing" or just "testing"
    const noteName = folder ? `${folder}/${name}` : name

    setLinkedNotePath(file.path)
    setLinkedNoteName(noteName) // Store WITHOUT .md extension
    // Display with [[ ]] brackets in the input (show just the name for readability)
    setNoteSearchQuery(`[[${name}]]`)
    setShowAutocomplete(false)
  }

  const getFilteredFiles = () => {
    if (!noteSearchQuery.trim()) {
      return files.filter(f => f.type === 'md')
    }

    const searchTerm = noteSearchQuery.toLowerCase().trim()
    const mdFiles = files.filter(f => f.type === 'md')

    // Rank each file based on match quality
    const rankedFiles = mdFiles.map(file => {
      const fileName = file.name.toLowerCase().replace(/\.md$/, '')
      const folderPath = getFileFolderAndName(file.path).folder.toLowerCase()
      const fullPath = folderPath ? `${folderPath}/${fileName}` : fileName

      let score = 0

      // 1. Exact match (highest priority) - score: 1000
      if (fileName === searchTerm) {
        score = 1000
      }
      // 2. Starts with (high priority) - score: 500
      else if (fileName.startsWith(searchTerm)) {
        score = 500
      }
      // 3. Contains in name (medium priority) - score: 300
      else if (fileName.includes(searchTerm)) {
        score = 300
      }
      // 4. Contains in folder path (lower priority) - score: 200
      else if (folderPath.includes(searchTerm)) {
        score = 200
      }
      // 5. Contains in full path (lowest priority) - score: 100
      else if (fullPath.includes(searchTerm)) {
        score = 100
      }
      // 6. Fuzzy match (very low priority) - score: 50
      else if (fuzzyMatch(fileName, searchTerm)) {
        score = 50
      }

      return { file, score }
    })

    // Filter out non-matches (score 0) and sort by score descending
    return rankedFiles
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.file)
  }

  // Simple fuzzy matching - checks if search characters appear in order
  const fuzzyMatch = (text: string, search: string): boolean => {
    let searchIndex = 0
    for (let i = 0; i < text.length && searchIndex < search.length; i++) {
      if (text[i] === search[searchIndex]) {
        searchIndex++
      }
    }
    return searchIndex === search.length
  }

  const getFileFolderAndName = (filePath: string) => {
    if (!rootPath) return { folder: '', name: filePath }

    // Remove rootPath from the beginning to get relative path
    let relativePath = filePath
    if (filePath.startsWith(rootPath)) {
      relativePath = filePath.substring(rootPath.length)
    }

    // Remove leading slashes/backslashes
    relativePath = relativePath.replace(/^[/\\]+/, '')

    // Split by slash or backslash
    const parts = relativePath.split(/[/\\]/)

    // The last part is the file name
    const fileName = parts[parts.length - 1].replace(/\.md$/, '')

    // Everything before the last part is the folder path
    const folderPath = parts.slice(0, -1).join('/')

    return {
      folder: folderPath,
      name: fileName
    }
  }

  const handleAutocompleteNavigate = (direction: 'up' | 'down') => {
    const filteredFiles = getFilteredFiles()
    const maxIndex = filteredFiles.length - 1

    if (direction === 'down') {
      setSelectedAutocompleteIndex(prev => Math.min(prev + 1, maxIndex))
    } else {
      setSelectedAutocompleteIndex(prev => Math.max(prev - 1, 0))
    }
  }

  const handleNoteInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showAutocomplete) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      handleAutocompleteNavigate('down')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      handleAutocompleteNavigate('up')
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const filteredFiles = getFilteredFiles()
      if (filteredFiles[selectedAutocompleteIndex]) {
        handleFileSelect(filteredFiles[selectedAutocompleteIndex])
      }
    } else if (e.key === 'Escape') {
      setShowAutocomplete(false)
    }
  }

  const handleNoteInputBlur = (_e: React.FocusEvent<HTMLInputElement>) => {
    // Delay closing to allow click on dropdown items
    blurTimeoutRef.current = setTimeout(() => {
      setShowAutocomplete(false)
    }, 300)
  }

  const getPriorityColor = (p: number) => {
    switch (p) {
      case 1: return '#e74c3c' // Red - Urgent
      case 2: return '#ff9800' // Orange - High
      case 3: return '#ffd700' // Yellow - Medium
      case 4: return '#ffffff' // White - Low
      default: return '#888'
    }
  }

  const _getPriorityLabel = (p: number) => {
    switch (p) {
      case 1: return 'P1 - Urgent'
      case 2: return 'P2 - High'
      case 3: return 'P3 - Medium'
      case 4: return 'P4 - Low'
      default: return 'No Priority'
    }
  }
  void _getPriorityLabel // Reserved for future priority label tooltips

  const formatDateForInput = (dateStr: string | null) => {
    if (!dateStr) return ''
    return dateStr.split('T')[0] // ISO date to YYYY-MM-DD
  }

  const handleQuickDate = (type: 'today' | 'tomorrow' | 'next-week') => {
    const now = new Date()
    let date = new Date()

    switch (type) {
      case 'today':
        date = now
        break
      case 'tomorrow':
        date.setDate(now.getDate() + 1)
        break
      case 'next-week':
        date.setDate(now.getDate() + 7)
        break
    }

    // Create ISO string in local timezone (YYYY-MM-DD format)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    setEndDate(`${year}-${month}-${day}T00:00:00.000`)
  }

  const isQuickDateActive = (type: 'today' | 'tomorrow' | 'next-week') => {
    if (!endDate) return false

    const selectedDate = new Date(endDate)
    const now = new Date()

    // Normalize to date only (ignore time)
    const normalizeDate = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const normalizedSelected = normalizeDate(selectedDate)
    const normalizedNow = normalizeDate(now)

    switch (type) {
      case 'today':
        return normalizedSelected.getTime() === normalizedNow.getTime()
      case 'tomorrow':
        const tomorrow = new Date(normalizedNow)
        tomorrow.setDate(tomorrow.getDate() + 1)
        return normalizedSelected.getTime() === tomorrow.getTime()
      case 'next-week':
        const nextWeek = new Date(normalizedNow)
        nextWeek.setDate(nextWeek.getDate() + 7)
        return normalizedSelected.getTime() === nextWeek.getTime()
      default:
        return false
    }
  }

  if (!isOpen) return null

  return (
    <div className="quick-add-modal-overlay">
      <div className="quick-add-modal">
        <div className="modal-header">
          <h3>Add Task</h3>
          <button className="close-btn" onClick={onClose}>
            <XMarkIcon className="icon-small" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="text"
              className="task-input"
              placeholder="Task name"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          </div>

          {/* Options - Always Visible */}
          <div className="form-options">
            {/* Priority Selector */}
            <div className="form-section">
              <label>Priority</label>
              <div className="priority-buttons">
                {[1, 2, 3, 4].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`priority-btn ${priority === p ? 'active' : ''}`}
                    onClick={() => setPriority(priority === p ? null : p)}
                    style={{
                      borderColor: priority === p ? getPriorityColor(p) : undefined,
                      color: priority === p ? getPriorityColor(p) : undefined
                    }}
                  >
                    P{p}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Selector */}
            <div className="form-section">
              <label>Due Date</label>
              <div className="date-quick-buttons">
                <button
                  type="button"
                  className={isQuickDateActive('today') ? 'active' : ''}
                  onClick={() => handleQuickDate('today')}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={isQuickDateActive('tomorrow') ? 'active' : ''}
                  onClick={() => handleQuickDate('tomorrow')}
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  className={isQuickDateActive('next-week') ? 'active' : ''}
                  onClick={() => handleQuickDate('next-week')}
                >
                  Next Week
                </button>
              </div>
              <div className="date-inputs">
                <div className="date-input-group">
                  <label>Start</label>
                  <input
                    type="date"
                    value={formatDateForInput(startDate)}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setStartDate(e.target.value ? `${e.target.value}T00:00:00.000` : null)}
                  />
                </div>
                <div className="date-input-group">
                  <label>End</label>
                  <input
                    type="date"
                    value={formatDateForInput(endDate)}
                    min={startDate ? formatDateForInput(startDate) : new Date().toISOString().split('T')[0]} // Can't select before start date (or today if no start date)
                    onChange={(e) => setEndDate(e.target.value ? `${e.target.value}T00:00:00.000` : null)}
                  />
                </div>
              </div>
            </div>

            {/* Link to Note - Only show when opened from FAB */}
            {context === 'fab' && (
              <div className="form-section" style={{ position: 'relative' }}>
                <label>Link to Note (optional)</label>
                <div className="note-link-wrapper">
                  <input
                    ref={noteInputRef}
                    type="text"
                    placeholder="Click to search notes..."
                    value={noteSearchQuery}
                    onChange={handleNoteInputChange}
                    onFocus={handleNoteInputFocus}
                    onBlur={handleNoteInputBlur}
                    onKeyDown={handleNoteInputKeyDown}
                  />
                  {linkedNotePath && (
                    <button
                      type="button"
                      className="clear-note-btn"
                      onClick={() => {
                        setLinkedNotePath(null)
                        setLinkedNoteName(null)
                        setNoteSearchQuery('')
                      }}
                      title="Clear linked note"
                    >
                      <XMarkIcon className="icon-tiny" />
                    </button>
                  )}
                </div>

                {/* Autocomplete dropdown - positioned relative to this section */}
                {showAutocomplete && (() => {
                  const filteredFiles = getFilteredFiles().slice(0, 10)

                  if (filteredFiles.length === 0) {
                    return null
                  }

                  return (
                    <div className="note-autocomplete-dropdown-inline">
                      {filteredFiles.map((file, index) => {
                        const { folder, name } = getFileFolderAndName(file.path)
                        return (
                          <div
                            key={file.path}
                            className={`note-autocomplete-item ${index === selectedAutocompleteIndex ? 'selected' : ''}`}
                            onMouseDown={(e) => {
                              // Use onMouseDown instead of onClick to fire before onBlur
                              e.preventDefault()
                              handleFileSelect(file)
                            }}
                          >
                            {folder && (
                              <>
                                <span className="note-folder-path">{folder}</span>
                                <span className="note-path-separator">/</span>
                              </>
                            )}
                            <span className="note-file-name">{name}</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Description */}
            <div className="form-section">
              <label>Description (optional)</label>
              <textarea
                placeholder="Add notes or details..."
                value={description || ''}
                onChange={(e) => setDescription(e.target.value || null)}
                rows={3}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={!text.trim()}>
              Add Task
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default QuickAddModal
