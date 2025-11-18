import React, { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import MilkdownEditor, { clearFileListCache } from './MilkdownEditor'
import { TeamDriveStorage } from '../../services/teamDriveStorage'
import './EditorTab.css'

interface EditorTabProps {
  filePath: string
  fileName: string
  rootPath?: string
  fileId?: string // Google Drive file ID (for team mode)
  onFileRenamed?: (oldPath: string, newPath: string, newName: string) => void
  onOpenFile?: (filePath: string, fileName: string) => void
  onFileCreated?: () => void
  editorId?: string // Unique ID for autocomplete scoping
  onPaneActivate?: () => void // Callback to activate the pane when editor is clicked
  isActive?: boolean // Whether this pane is currently active
  storageBackend?: TeamDriveStorage // For team mode
}

interface SaveResult {
  success: boolean
  error?: string
}

function EditorTabMilkdown({ filePath, fileName, rootPath, fileId, onFileRenamed, onOpenFile, onFileCreated, editorId, onPaneActivate, isActive, storageBackend }: EditorTabProps) {
  const [content, setContent] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isTeamMode = !!storageBackend
  const [parentFolderId, setParentFolderId] = useState<string | undefined>(undefined)
  const [currentFileName, setCurrentFileName] = useState<string>(fileName)

  // Sync currentFileName when fileName prop changes
  useEffect(() => {
    console.log('[EditorTab] fileName prop changed:', { oldFileName: currentFileName, newFileName: fileName, filePath, fileId })
    setCurrentFileName(fileName)
  }, [fileName])

  // Handle wiki-link clicks
  const handleWikiLinkClick = useCallback(async (noteName: string) => {
    try {
      // Check if the link has an extension (for non-markdown files)
      const hasExtension = /\.\w+$/.test(noteName)

      // Check if the link has a folder path
      const hasFolder = noteName.includes('/')

      let searchFileName = noteName
      let expectedFolder = ''

      // Handle folder paths
      if (hasFolder) {
        const parts = noteName.split('/')
        expectedFolder = parts.slice(0, -1).join('/')
        searchFileName = parts[parts.length - 1]
      }

      // Add .md extension if needed
      if (!hasExtension) {
        searchFileName = `${searchFileName}.md`
      }

      // ========================================
      // TEAM MODE (Google Drive)
      // ========================================
      if (isTeamMode && storageBackend) {

        // Search for the file in Google Drive
        try {
          const allFiles = await storageBackend.listFiles()
          const targetFile = allFiles.find((f: any) => f.name === searchFileName)

          if (targetFile) {
            // File exists, open it
            if (onOpenFile) {
              onOpenFile(targetFile.name, targetFile.name)
            }
            return
          }
        } catch (error) {
          console.error('Error searching Drive files:', error)
        }

        // File doesn't exist, create it
        if (hasExtension && !searchFileName.endsWith('.md')) {
          console.error(`File not found: ${searchFileName}`)
          return
        }

        // Determine parent folder ID for the new file
        let parentFolderId: string | undefined = undefined

        if (!hasFolder) {
          // Create in the same folder as the current file
          // Find the current file's parent folder by searching the Drive
          try {
            const allFiles = await storageBackend.listFiles()

            // Normalize fileName for comparison (ensure .md extension)
            const normalizedFileName = fileName.endsWith('.md') ? fileName : `${fileName}.md`

            // Find current file with multiple fallback strategies
            let currentFile = fileId
              ? allFiles.find((f: any) => f.id === fileId)
              : undefined

            // Fallback 1: Try exact name match
            if (!currentFile) {
              currentFile = allFiles.find((f: any) => f.name === fileName || f.name === normalizedFileName)
            }

            // Fallback 2: Try without extension
            if (!currentFile) {
              const nameWithoutExt = fileName.replace(/\.md$/, '')
              currentFile = allFiles.find((f: any) =>
                f.name === nameWithoutExt ||
                f.name === `${nameWithoutExt}.md`
              )
            }

            if (currentFile && currentFile.fullPath) {
              // Extract parent folder ID from the full path
              const currentFullPath = currentFile.fullPath
              const pathParts = currentFullPath.split('\\')

              if (pathParts.length > 1) {
                // File is in a subfolder - find the folder ID
                const parentFolderName = pathParts[pathParts.length - 2]
                const fileTree = await storageBackend.getFileTree()

                const findFolderId = (nodes: any[], folderName: string): string | undefined => {
                  for (const node of nodes) {
                    if (node.type === 'folder' && node.name === folderName) {
                      return node.id
                    }
                    if (node.children) {
                      const found = findFolderId(node.children, folderName)
                      if (found) return found
                    }
                  }
                  return undefined
                }

                parentFolderId = findFolderId(fileTree, parentFolderName)
              }
            }
          } catch (error) {
            console.error('❌ [Wiki-Link] Error finding parent folder:', error)
          }
        }

        // Create the file in Google Drive
        try {
          await storageBackend.saveFile(searchFileName, '', parentFolderId, true)

          // Clear file list cache so autocomplete picks up new file immediately
          clearFileListCache(rootPath)

          // Refresh file tree
          if (onFileCreated) {
            onFileCreated()
          }

          // Open the newly created file
          if (onOpenFile) {
            onOpenFile(searchFileName, searchFileName)
          }
        } catch (error) {
          console.error('Failed to create file:', error)
        }

        return
      }

      // ========================================
      // LOCAL MODE (Filesystem)
      // ========================================
      // If a folder is specified, check directly for the file in that specific folder
      if (expectedFolder) {
        // Build the exact path where the file should be
        const normalizedRoot = rootPath.replace(/\//g, '\\')
        const expectedFilePath = `${normalizedRoot}\\${expectedFolder.replace(/\//g, '\\')}\\${searchFileName}`

        try {
          // Check if the file exists at the expected location
          await invoke<string>('read_file', { filePath: expectedFilePath })
          // File exists at the expected location, open it
          if (onOpenFile) {
            onOpenFile(expectedFilePath, searchFileName)
          }
          return // Exit early since we found and opened the file
        } catch (e) {
          // File doesn't exist at the expected location, we'll create it below
          console.log(`File ${searchFileName} not found at expected path: ${expectedFilePath}`)
        }
      } else {
        // No folder specified, search for the file in the root path
        const result = await invoke<{ success: boolean; path?: string; name?: string; error?: string }>('find_file_by_name', {
          rootPath,
          fileName: searchFileName
        })

        if (result.success && result.path && result.name) {
          // File exists somewhere in the tree, open it
          if (onOpenFile) {
            onOpenFile(result.path, result.name)
          }
          return // Exit early since we found and opened the file
        }
      }

      // If we reach here, the file doesn't exist or isn't in the right folder
      // Only create markdown files, not other types
      if (hasExtension && !searchFileName.endsWith('.md')) {
        console.error(`File not found: ${searchFileName}`)
        // TODO: Show proper notification or open file viewer for non-markdown files
        return
      }

      // File doesn't exist, determine where to create it
      let createPath = ''

      if (expectedFolder) {
        // If a folder was specified, create the file in that folder (relative to root)
        // Normalize the path separators
        const normalizedRoot = rootPath.replace(/\//g, '\\')
        createPath = `${normalizedRoot}\\${expectedFolder.replace(/\//g, '\\')}`
        // The backend will automatically create any missing parent directories
      } else {
        // Otherwise create it in the same folder as the current file
        // Check if filePath contains the full path (has path separators)
        const hasPathSeparator = filePath.includes('\\') || filePath.includes('/')

        if (hasPathSeparator) {
          // Extract the directory from the full file path
          const lastSeparator = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
          createPath = filePath.substring(0, lastSeparator)
        } else if (rootPath) {
          // If filePath is just a filename, use the rootPath
          createPath = rootPath
        } else {
          console.error('Cannot determine parent folder - no path separators in filePath and no rootPath')
          throw new Error('Cannot determine parent folder for file creation')
        }
      }

      const createResult = await invoke<{ success: boolean; path?: string; name?: string; error?: string }>('create_file', {
        parentPath: createPath,
        fileName: searchFileName
      })

      if (createResult.success && createResult.path && createResult.name) {
        // Successfully created, refresh file tree
        if (onFileCreated) {
          onFileCreated()
        }

        // Now open the newly created file
        if (onOpenFile) {
          onOpenFile(createResult.path, createResult.name)
        }
      } else {
        console.error(`Failed to create note: ${createResult.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error handling wiki-link:', error)
    }
  }, [rootPath, filePath, fileName, onOpenFile, onFileCreated, isTeamMode, storageBackend])

  // Load file content on mount
  useEffect(() => {
    const loadFile = async () => {
      try {
        setIsLoading(true)
        let fileContent: string

        if (isTeamMode && storageBackend) {
          // Team mode: load from Google Drive
          fileContent = await storageBackend.getFile(fileName)

          // Determine the parent folder ID for this file
          if (fileId) {
            try {
              const allFiles = await storageBackend.listFiles()
              const currentFile = allFiles.find((f: any) => f.id === fileId)

              if (currentFile) {
                const currentFullPath = currentFile.fullPath || fileName
                const pathParts = currentFullPath.split('\\')

                if (pathParts.length > 1) {
                  // File is in a subfolder - find the folder ID
                  const parentFolderName = pathParts[pathParts.length - 2]
                  const fileTree = await storageBackend.getFileTree()

                  const findFolderId = (nodes: any[], folderName: string): string | undefined => {
                    for (const node of nodes) {
                      if (node.type === 'folder' && node.name === parentFolderName) {
                        return node.id
                      }
                      if (node.children) {
                        const found = findFolderId(node.children, folderName)
                        if (found) return found
                      }
                    }
                    return undefined
                  }

                  const folderIdFound = findFolderId(fileTree, parentFolderName)
                  setParentFolderId(folderIdFound)
                } else {
                  // File is at root level
                  setParentFolderId(undefined)
                }
              }
            } catch (error) {
              console.error('Failed to determine parent folder:', error)
            }
          }
        } else {
          // Local mode: load from filesystem
          fileContent = await invoke<string>('read_file', { filePath })
        }

        setContent(fileContent)
        setSaveError(null) // Clear any previous errors
      } catch (error) {
        console.error('Failed to load file:', error)
        setSaveError(`Failed to load '${fileName}': ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        setIsLoading(false)
      }
    }

    loadFile()
  }, [filePath, fileName, isTeamMode, storageBackend, fileId])

  // Auto-save with debounce
  const saveFile = useCallback(async (newContent: string) => {
    try {
      setIsSaving(true)
      setSaveError(null)

      if (isTeamMode && storageBackend) {
        console.log('[EditorTab] Auto-save triggered:', { currentFileName, parentFolderId, contentLength: newContent.length })

        // Team mode: save to Google Drive with the correct parent folder ID
        await storageBackend.saveFile(currentFileName, newContent, parentFolderId)

        console.log('[EditorTab] Auto-save completed successfully')
      } else {
        // Local mode: save to filesystem
        const result = await invoke<SaveResult>('write_file', {
          filePath,
          content: newContent
        })

        if (!result.success) {
          setSaveError(result.error || 'Failed to save file')
        }
      }
    } catch (error) {
      console.error('Failed to save file:', error)
      setSaveError(`Failed to save: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsSaving(false)
    }
  }, [filePath, currentFileName, isTeamMode, storageBackend, parentFolderId])

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
    console.log('[EditorTab] handleTitleRename called:', { newName, currentFileName, fileName, filePath, fileId })

    if (!newName || newName.trim() === '') {
      setIsEditingTitle(false)
      return
    }

    // Remove .md if user typed it
    const nameWithoutExt = newName.replace(/\.md$/, '')
    const finalName = `${nameWithoutExt}.md`

    console.log('[EditorTab] Rename details:', { nameWithoutExt, finalName, currentFileName, willRename: finalName !== currentFileName })

    // Don't rename if name hasn't changed
    if (finalName === currentFileName) {
      console.log('[EditorTab] Name unchanged, skipping rename')
      setIsEditingTitle(false)
      return
    }

    try {
      setRenameError(null)

      if (isTeamMode && storageBackend) {
        console.log('[EditorTab] Starting team mode rename:', { oldName: currentFileName, newName: finalName, fileId })

        // Team mode: rename in Google Drive
        await storageBackend.renameFile(currentFileName, finalName, fileId)

        console.log('[EditorTab] Rename successful, updating state')

        // Update current filename immediately
        setCurrentFileName(finalName)

        console.log('[EditorTab] Calling onFileRenamed callback:', { oldPath: filePath, newPath: finalName, newName: finalName })

        // Notify parent component to update
        if (onFileRenamed) {
          onFileRenamed(filePath, finalName, finalName)
        }
        setIsEditingTitle(false)
      } else {
        // Local mode: rename in filesystem
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
      }
    } catch (error) {
      console.error('Error renaming file:', error)
      setRenameError(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const displayName = currentFileName.replace(/\.md$/, '')

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
        <MilkdownEditor
          content={content}
          onChange={handleChange}
          onWikiLinkClick={handleWikiLinkClick}
          rootPath={rootPath}
          filePath={filePath}
          editorId={editorId}
          onPaneActivate={onPaneActivate}
          isActive={isActive}
          storageBackend={storageBackend}
        />
      </div>
    </div>
  )
}

export default EditorTabMilkdown
