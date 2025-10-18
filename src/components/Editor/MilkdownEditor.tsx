import { useRef, useState, useEffect } from 'react'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { nord } from '@milkdown/theme-nord'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'
import { TextSelection } from '@milkdown/prose/state'
import { wikiLinkPlugin } from '../../utils/wikiLinkPlugin'
import { urlLinkPlugin } from '../../utils/urlLinkPlugin'
import { keyboardShortcuts } from '../../utils/keyboardShortcuts'
import { wikiLinkAutocompletePlugin } from '../../utils/wikiLinkAutocompletePlugin'
import { imageResizePlugin } from '../../utils/imageResizePlugin'
import { slashCommandPlugin } from '../../utils/slashCommandPlugin'
import { tableWidgetPlugin } from '../../utils/tableCommandsPlugin'
import WikiLinkAutocomplete from './WikiLinkAutocomplete'
import TableWidget from './TableWidget'
import { invoke } from '@tauri-apps/api/core'
import '@milkdown/theme-nord/style.css'
import './MilkdownEditor.css'

interface MilkdownEditorProps {
  content: string
  onChange: (content: string) => void
  onWikiLinkClick?: (noteName: string) => void
  rootPath?: string
  editorId?: string // Unique ID to scope autocomplete per pane
  onPaneActivate?: () => void // Callback to activate the pane when editor is clicked
  isActive?: boolean // Whether this pane is currently active
}

interface FileItem {
  name: string
  path: string
  type: 'md' | 'svg' | 'pdf' | 'png' | 'jpg' | 'other'
}

function MilkdownEditorInner({ content, onChange, onWikiLinkClick, rootPath, editorId = 'default', onPaneActivate, isActive }: MilkdownEditorProps) {
  const editorRef = useRef<Editor | null>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [autocompleteVisible, setAutocompleteVisible] = useState(false)
  const [autocompletePosition, setAutocompletePosition] = useState({ top: 0, left: 0 })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(-1) // -1 means nothing is selected
  const [files, setFiles] = useState<FileItem[]>([])
  const [triggerPos, setTriggerPos] = useState(0)
  const [hasNavigated, setHasNavigated] = useState(false) // Track if user has used arrow keys
  const pendingCursorPosRef = useRef<number | null>(null) // Store cursor position to restore after re-render

  // Track when isActive changes and restore cursor if needed
  useEffect(() => {
    if (isActive && pendingCursorPosRef.current !== null && editorRef.current) {
      const cursorPos = pendingCursorPosRef.current

      // Restore immediately
      try {
        const view = editorRef.current.ctx.get(editorViewCtx)
        view.focus()

        const { state, dispatch } = view
        const tr = state.tr.setSelection(TextSelection.create(state.doc, cursorPos))
        dispatch(tr)
      } catch (err) {
        console.error(`[MilkdownEditor] ${editorId} - Failed to restore cursor:`, err)
      }

      // ALSO restore again after a tiny delay to combat whatever is stealing it
      setTimeout(() => {
        if (!editorRef.current) return

        try {
          const view = editorRef.current.ctx.get(editorViewCtx)
          view.focus()

          const { state, dispatch } = view
          const tr = state.tr.setSelection(TextSelection.create(state.doc, cursorPos))
          dispatch(tr)
        } catch (err) {
          console.error(`[MilkdownEditor] ${editorId} - Failed to restore cursor (delayed):`, err)
        }
      }, 10)

      pendingCursorPosRef.current = null // Clear the pending position
    }
  }, [isActive, editorId])

  // Fetch files from workspace
  useEffect(() => {
    if (!rootPath) return

    const fetchFiles = async () => {
      try {
        const result: any = await invoke('get_markdown_files', { rootPath })
        const fileList: FileItem[] = []

        // Process files
        if (result.files) {
          result.files.forEach((file: any) => {
            const extension = file.path.split('.').pop()?.toLowerCase()
            let type: FileItem['type'] = 'other'

            if (extension === 'md') type = 'md'
            else if (extension === 'svg') type = 'svg'
            else if (extension === 'pdf') type = 'pdf'
            else if (extension === 'png') type = 'png'
            else if (extension === 'jpg' || extension === 'jpeg') type = 'jpg'

            // Convert absolute path to relative path from rootPath
            const relativePath = file.path.replace(rootPath + '\\', '').replace(rootPath + '/', '')
            const name = file.path.split(/[/\\]/).pop() || file.path

            fileList.push({
              name,
              path: relativePath.replace(/\\/g, '/'),
              type,
            })
          })
        }

        setFiles(fileList)
      } catch (error) {
        console.error('Failed to fetch files:', error)
      }
    }

    fetchFiles()
  }, [rootPath])

  // Listen for autocomplete events (scoped to this editor)
  useEffect(() => {
    const handleOpen = (event: any) => {
      // Only respond to events from this editor
      if (event.detail.editorId !== editorId) return

      setAutocompleteVisible(true)
      setAutocompletePosition(event.detail.position)
      setSearchQuery('')
      setSelectedIndex(-1) // No selection initially
      setHasNavigated(false) // Reset navigation state
      setTriggerPos(event.detail.triggerPos)
    }

    const handleUpdate = (event: any) => {
      // Only respond to events from this editor
      if (event.detail.editorId !== editorId) return

      setSearchQuery(event.detail.searchQuery)
      setSelectedIndex(-1) // Reset selection when search changes
      setHasNavigated(false) // Reset navigation state
    }

    const handleClose = (event: any) => {
      // Only respond to events from this editor (or global close)
      if (event.detail && event.detail.editorId && event.detail.editorId !== editorId) return

      setAutocompleteVisible(false)
      setSearchQuery('')
      setSelectedIndex(-1)
      setHasNavigated(false)
    }

    const handleNavigate = (event: any) => {
      // Only respond to events from this editor
      if (event.detail?.editorId !== editorId) return

      setHasNavigated(true) // Mark that user has navigated

      // Navigate up or down in the autocomplete list
      const direction = event.detail.direction

      // Filter files based on search query
      const filteredFiles = files.filter((file) => {
        const query = searchQuery.toLowerCase()
        return (
          file.name.toLowerCase().includes(query) ||
          file.path.toLowerCase().includes(query)
        )
      })

      setSelectedIndex((prev) => {
        if (direction === 'down') {
          // If nothing selected, select first item
          if (prev === -1) return 0
          return Math.min(prev + 1, filteredFiles.length - 1)
        } else {
          // If nothing selected or at top, stay at top
          if (prev === -1) return 0
          return Math.max(prev - 1, 0)
        }
      })
    }

    const handleSelect = (event: any) => {
      // Only respond to events from this editor
      if (event.detail?.editorId !== editorId) return

      // Don't select if user hasn't navigated (pressed arrow keys)
      if (!hasNavigated || selectedIndex === -1) return

      // Select the currently highlighted file
      const filteredFiles = files.filter((file) => {
        const query = searchQuery.toLowerCase()
        return (
          file.name.toLowerCase().includes(query) ||
          file.path.toLowerCase().includes(query)
        )
      })

      const selectedFile = filteredFiles[selectedIndex]
      if (!selectedFile || !editorRef.current) return

      try {
        const editor = editorRef.current
        const ctx = editor.ctx
        const view = ctx.get(editorViewCtx)

        // Smart naming logic for wiki links
        let linkText = ''

        if (selectedFile.type === 'md') {
          // For markdown files, just use the name without extension
          linkText = selectedFile.name.replace(/\.md$/, '')
        } else {
          // For non-markdown files, include extension
          linkText = selectedFile.name
        }

        // Check if there's another file with the same name (without extension)
        const nameWithoutExt = selectedFile.name.replace(/\.\w+$/, '')
        const hasDuplicate = files.some(f =>
          f.path !== selectedFile.path &&
          f.name.replace(/\.\w+$/, '') === nameWithoutExt
        )

        if (hasDuplicate) {
          // If there's a duplicate, include the folder path
          const pathParts = selectedFile.path.split('/')
          if (pathParts.length > 1) {
            // Include parent folder in the link
            const parentFolder = pathParts[pathParts.length - 2]
            linkText = `${parentFolder}/${linkText}`
          }
        }

        // Insert the filename
        const { state, dispatch } = view
        const { doc } = state

        // Find the position of ']]' after trigger
        let endPos = triggerPos
        let foundClosing = false

        const $pos = doc.resolve(triggerPos)
        const textAfter = $pos.parent.textBetween(
          $pos.parentOffset,
          $pos.parent.content.size,
          null,
          '\ufffc'
        )

        const closingIndex = textAfter.indexOf(']]')
        if (closingIndex !== -1) {
          endPos = triggerPos + closingIndex
          foundClosing = true
        }

        if (foundClosing) {
          // Replace content between [[ and ]]
          const tr = state.tr.replaceWith(
            triggerPos,
            endPos,
            state.schema.text(linkText)
          )
          // Move cursor after ]]
          const newPos = triggerPos + linkText.length + 2
          tr.setSelection(TextSelection.create(tr.doc, newPos))
          dispatch(tr)
        }

        // Close autocomplete
        setAutocompleteVisible(false)
        setSearchQuery('')
        setSelectedIndex(-1)
        setHasNavigated(false)
      } catch (error) {
        console.error('Failed to insert wiki link:', error)
      }
    }

    window.addEventListener('wiki-link-autocomplete-open', handleOpen)
    window.addEventListener('wiki-link-autocomplete-update', handleUpdate)
    window.addEventListener('wiki-link-autocomplete-close', handleClose)
    window.addEventListener('wiki-link-autocomplete-navigate', handleNavigate)
    window.addEventListener('wiki-link-autocomplete-select', handleSelect)

    return () => {
      window.removeEventListener('wiki-link-autocomplete-open', handleOpen)
      window.removeEventListener('wiki-link-autocomplete-update', handleUpdate)
      window.removeEventListener('wiki-link-autocomplete-close', handleClose)
      window.removeEventListener('wiki-link-autocomplete-navigate', handleNavigate)
      window.removeEventListener('wiki-link-autocomplete-select', handleSelect)
    }
  }, [editorId, files, searchQuery, selectedIndex, triggerPos, hasNavigated])

  useEditor((root) => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, content)

        // Set up listener for content changes
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          onChange(markdown)
        })
      })
      .use(nord)
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(clipboard)
      .use(listener)
      .use(slashCommandPlugin())
      .use(wikiLinkPlugin({ onWikiLinkClick }))
      .use(urlLinkPlugin())
      .use(keyboardShortcuts())
      .use(wikiLinkAutocompletePlugin())
      .use(imageResizePlugin())
      .use(tableWidgetPlugin)

    editorRef.current = editor
    return editor
  }, [onWikiLinkClick])

  const handleFileSelect = (file: FileItem) => {
    if (!editorRef.current) return

    try {
      const editor = editorRef.current
      const ctx = editor.ctx

      // Get the editor view
      const view = ctx.get(editorViewCtx)

      // Smart naming logic for wiki links (same as handleSelect)
      let linkText = ''

      if (file.type === 'md') {
        // For markdown files, just use the name without extension
        linkText = file.name.replace(/\.md$/, '')
      } else {
        // For non-markdown files, include extension
        linkText = file.name
      }

      // Check if there's another file with the same name (without extension)
      const nameWithoutExt = file.name.replace(/\.\w+$/, '')
      const hasDuplicate = files.some(f =>
        f.path !== file.path &&
        f.name.replace(/\.\w+$/, '') === nameWithoutExt
      )

      if (hasDuplicate) {
        // If there's a duplicate, include the folder path
        const pathParts = file.path.split('/')
        if (pathParts.length > 1) {
          // Include parent folder in the link
          const parentFolder = pathParts[pathParts.length - 2]
          linkText = `${parentFolder}/${linkText}`
        }
      }

      // Insert the filename using the insertWikiLink helper
      const { state, dispatch } = view
      const { doc} = state

      // Find the position of ']]' after trigger
      let endPos = triggerPos
      let foundClosing = false

      const $pos = doc.resolve(triggerPos)
      const textAfter = $pos.parent.textBetween(
        $pos.parentOffset,
        $pos.parent.content.size,
        null,
        '\ufffc'
      )

      const closingIndex = textAfter.indexOf(']]')
      if (closingIndex !== -1) {
        endPos = triggerPos + closingIndex
        foundClosing = true
      }

      if (foundClosing) {
        // Replace content between [[ and ]]
        const tr = state.tr.replaceWith(
          triggerPos,
          endPos,
          state.schema.text(linkText)
        )
        // Move cursor after ]]
        const newPos = triggerPos + linkText.length + 2
        tr.setSelection(TextSelection.create(tr.doc, newPos))
        dispatch(tr)
      }

      // Close autocomplete
      setAutocompleteVisible(false)
      setSearchQuery('')
      setSelectedIndex(-1)
      setHasNavigated(false)
    } catch (error) {
      console.error('Failed to insert wiki link:', error)
    }
  }

  // Stub functions for WikiLinkAutocomplete props (not actually used, handled by event system)
  const handleNavigate = () => {}
  const handleClose = () => {}

  const handleContainerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement

    // Activate the pane when editor is clicked (for split view)
    if (onPaneActivate && !isActive) {
      // Focus and set cursor immediately (must happen during click event for browser security)
      if (editorRef.current) {
        try {
          const editor = editorRef.current
          const ctx = editor.ctx
          const view = ctx.get(editorViewCtx)

          // Focus the editor first
          view.focus()

          const { state } = view

          // Check if user clicked on empty space or on actual content
          const clickedOnEmptySpace =
            target === editorContainerRef.current ||
            target.classList.contains('milkdown') ||
            target.classList.contains('milkdown-editor-container')

          let cursorPosition: number

          if (clickedOnEmptySpace) {
            // Clicked on empty space - move cursor to end of document
            cursorPosition = state.doc.content.size - 1
          } else {
            // Clicked on actual content - get position from click coordinates
            const pos = view.posAtCoords({ left: e.clientX, top: e.clientY })
            if (pos) {
              cursorPosition = pos.pos
            } else {
              // Fallback to current selection position
              cursorPosition = state.selection.from
            }
          }

          // Set cursor at the determined position
          const tr = state.tr.setSelection(TextSelection.create(state.doc, cursorPosition))
          view.dispatch(tr)

          // Store the cursor position so we can restore it after React re-renders
          pendingCursorPosRef.current = cursorPosition
        } catch (err) {
          console.error(`[MilkdownEditor] ${editorId} - Failed to handle inactive pane click:`, err)
        }
      }

      // Call onPaneActivate to trigger React state update
      onPaneActivate()

      return // Exit early
    }

    // If pane is already active, handle click normally
    if (!editorRef.current) return

    try {
      const editor = editorRef.current
      const ctx = editor.ctx
      const view = ctx.get(editorViewCtx)

      const clickedOnProseMirror = target.closest('.ProseMirror')

      // If clicking on the ProseMirror content area, ensure it's focused
      if (clickedOnProseMirror && target.closest('.ProseMirror') !== target.closest('.milkdown')) {
        // Clicking on actual text content - ensure editor is focused, ProseMirror will handle cursor placement
        view.focus()
        return
      }

      // If clicking on empty space (the milkdown wrapper or container)
      if (target === editorContainerRef.current || target.classList.contains('milkdown')) {
        // Focus the editor and move cursor to end only when clicking empty space
        view.focus()

        // Move cursor to end of document
        const { state, dispatch } = view
        const endPos = state.doc.content.size
        const tr = state.tr.setSelection(state.selection.constructor.near(state.doc.resolve(endPos)))
        dispatch(tr)
      }
    } catch (error) {
      console.error(`[MilkdownEditor] ${editorId} - Error handling click:`, error)
    }
  }

  return (
    <div
      ref={editorContainerRef}
      style={{ position: 'relative', height: '100%' }}
      data-editor-id={editorId}
      onClick={handleContainerClick}
    >
      <Milkdown />
      <WikiLinkAutocomplete
        visible={autocompleteVisible}
        position={autocompletePosition}
        searchQuery={searchQuery}
        files={files}
        onSelect={handleFileSelect}
        onClose={handleClose}
        selectedIndex={selectedIndex}
        onNavigate={handleNavigate}
      />
      <TableWidget editor={editorRef.current} />
    </div>
  )
}

export default function MilkdownEditor({ content, onChange, onWikiLinkClick, rootPath, editorId, onPaneActivate, isActive }: MilkdownEditorProps) {
  return (
    <MilkdownProvider>
      <MilkdownEditorInner content={content} onChange={onChange} onWikiLinkClick={onWikiLinkClick} rootPath={rootPath} editorId={editorId} onPaneActivate={onPaneActivate} isActive={isActive} />
    </MilkdownProvider>
  )
}
