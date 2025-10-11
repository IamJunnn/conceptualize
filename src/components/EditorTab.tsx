import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { linkClickExtension } from '../utils/linkClickExtension'
import { markdownShortcuts } from '../utils/markdownShortcuts'
import { markdownTheme, markdownHighlighting } from '../utils/markdownTheme'
import './EditorTab.css'

interface EditorTabProps {
  filePath: string
  fileName: string
  rootPath: string
  onFileRenamed?: (oldPath: string, newPath: string, newName: string) => void
  onOpenFile?: (filePath: string, fileName: string) => void
}

interface SaveResult {
  success: boolean
  error?: string
}

function EditorTab({ filePath, fileName, rootPath, onFileRenamed, onOpenFile }: EditorTabProps) {
  const [content, setContent] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Handle wiki-link clicks
  const handleWikiLinkClick = useCallback(async (noteName: string) => {
    try {
      // Search for the file in the root path
      const result = await invoke<{ success: boolean; path?: string; name?: string; error?: string }>('find_file_by_name', {
        rootPath,
        fileName: `${noteName}.md`
      })

      if (result.success && result.path && result.name) {
        if (onOpenFile) {
          onOpenFile(result.path, result.name)
        }
      } else {
        alert(`Note "${noteName}" not found`)
      }
    } catch (error) {
      console.error('Error finding wiki-linked file:', error)
      alert(`Failed to open note: ${error}`)
    }
  }, [rootPath, onOpenFile])

  // Create extensions with link click handler, line wrapping, markdown shortcuts, and theme
  const extensions = useMemo(() => [
    markdown(),
    linkClickExtension({ onWikiLinkClick: handleWikiLinkClick }),
    EditorView.lineWrapping,
    markdownShortcuts(),
    markdownTheme,
    markdownHighlighting
  ], [handleWikiLinkClick])

  // Load file content on mount
  useEffect(() => {
    const loadFile = async () => {
      try {
        setIsLoading(true)
        const fileContent = await invoke<string>('read_file', { filePath })
        setContent(fileContent)
      } catch (error) {
        console.error('Failed to load file:', error)
        setSaveError(`Failed to load file: ${error}`)
      } finally {
        setIsLoading(false)
      }
    }

    loadFile()
  }, [filePath])

  // Auto-save with debounce
  const saveFile = useCallback(async (newContent: string) => {
    try {
      setIsSaving(true)
      setSaveError(null)
      const result = await invoke<SaveResult>('write_file', {
        filePath,
        content: newContent
      })

      if (!result.success) {
        setSaveError(result.error || 'Failed to save file')
      }
    } catch (error) {
      console.error('Failed to save file:', error)
      setSaveError(`Failed to save: ${error}`)
    } finally {
      setIsSaving(false)
    }
  }, [filePath])

  const handleChange = useCallback((value: string) => {
    setContent(value)

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Set new timeout for auto-save
    saveTimeoutRef.current = setTimeout(() => {
      saveFile(value)
    }, 500)
  }, [saveFile])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // Handle title rename
  const handleTitleRename = async (newName: string) => {
    if (!newName || newName.trim() === '') {
      setIsEditingTitle(false)
      return
    }

    // Remove .md if user typed it
    const nameWithoutExt = newName.replace(/\.md$/, '')
    const finalName = `${nameWithoutExt}.md`

    // Don't rename if name hasn't changed
    if (finalName === fileName) {
      setIsEditingTitle(false)
      return
    }

    try {
      setRenameError(null)
      const result = await invoke<{ success: boolean; path?: string; name?: string; error?: string }>('rename_item', {
        oldPath: filePath,
        newName: finalName,
        rootPath: rootPath
      })

      if (result.success && result.path && result.name) {
        // Notify parent component to update
        if (onFileRenamed) {
          onFileRenamed(filePath, result.path, result.name)
        }
        setIsEditingTitle(false)
      } else {
        setRenameError(result.error || 'Failed to rename file')
      }
    } catch (error) {
      console.error('Error renaming file:', error)
      setRenameError(`Error: ${error}`)
    }
  }

  const displayName = fileName.replace(/\.md$/, '')

  if (isLoading) {
    return (
      <div className="editor-loading">
        <p>Loading {fileName}...</p>
      </div>
    )
  }

  return (
    <div className="editor-container">
      <div className="editor-header">
        <div className="editor-title-section">
          {isEditingTitle ? (
            <input
              type="text"
              className="editor-title-input"
              defaultValue={displayName}
              autoFocus
              onBlur={(e) => handleTitleRename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleTitleRename(e.currentTarget.value)
                } else if (e.key === 'Escape') {
                  setIsEditingTitle(false)
                  setRenameError(null)
                }
              }}
            />
          ) : (
            <>
              <span
                className="editor-filename"
                onClick={() => setIsEditingTitle(true)}
                title="Click to rename"
              >
                {displayName}
              </span>
              <button
                className="edit-title-button"
                onClick={() => setIsEditingTitle(true)}
                title="Rename file"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </>
          )}
        </div>
        <div className="editor-status">
          {renameError && <span className="error-indicator">{renameError}</span>}
          {!renameError && isSaving && <span className="saving-indicator">Saving...</span>}
          {!renameError && saveError && <span className="error-indicator">{saveError}</span>}
          {!renameError && !isSaving && !saveError && <span className="saved-indicator">Saved</span>}
        </div>
      </div>
      <div className="editor-content">
        <CodeMirror
          value={content}
          height="100%"
          extensions={extensions}
          onChange={handleChange}
          theme="dark"
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightActiveLine: true,
            foldGutter: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            searchKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true,
          }}
        />
      </div>
    </div>
  )
}

export default EditorTab
