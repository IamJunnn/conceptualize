import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state'

const wikiLinkAutocompletePluginKey = new PluginKey('wiki-link-autocomplete')

export interface WikiLinkAutocompleteState {
  active: boolean
  position: { top: number; left: number } | null
  searchQuery: string
  triggerPos: number
}

// Global flag to prevent reopening after click-outside
let lastClickOutsideCloseTime = 0

export const wikiLinkAutocompletePlugin = () => {
  return $prose(() => {
    let autocompleteState: WikiLinkAutocompleteState = {
      active: false,
      position: null,
      searchQuery: '',
      triggerPos: 0,
    }

    // Listen for click-outside close events to set the global flag
    window.addEventListener('wiki-link-autocomplete-close', (event: any) => {
      const detail = event.detail
      if (detail?.clickOutside) {
        lastClickOutsideCloseTime = Date.now()
      }
    })

    return new Plugin({
      key: wikiLinkAutocompletePluginKey,
      state: {
        init() {
          return autocompleteState
        },
        apply(tr, value) {
          const meta = tr.getMeta(wikiLinkAutocompletePluginKey)
          if (meta) {
            return { ...value, ...meta }
          }
          return value
        },
      },
      props: {
        handleTextInput(view, from, _to, text) {
          const { state } = view
          const { doc } = state

          // Check if we're typing '[['
          if (text === '[') {
            // Check the character immediately before where we're inserting
            const charBefore = from > 0 ? doc.textBetween(from - 1, from, null, '\ufffc') : ''

            if (charBefore === '[') {
              // User just typed the second '[', trigger autocomplete
              // Let the second '[' be inserted normally first, then add ']]'
              // We'll do this in a setTimeout to let the normal insert happen
              setTimeout(() => {
                const { state: currentState, dispatch: currentDispatch } = view

                // Auto-insert closing ']]' after the current cursor position
                const cursorPos = currentState.selection.from
                const tr = currentState.tr.insertText(']]', cursorPos, cursorPos)
                // Keep cursor between [[ and ]]
                tr.setSelection(TextSelection.create(tr.doc, cursorPos))
                currentDispatch(tr)

                // Get cursor position for dropdown
                const coords = view.coordsAtPos(cursorPos)
                const editorRect = view.dom.getBoundingClientRect()

                // Get unique editor ID to scope events per pane
                // Look for data-editor-id on parent container (not the ProseMirror DOM)
                const container = view.dom.closest('[data-editor-id]')
                const editorId = container?.getAttribute('data-editor-id') || 'default'

                // Smart positioning: show below by default, above if not enough space
                const dropdownHeight = 300 // max height from CSS
                const gap = 4 // Small gap between text and dropdown
                const spaceBelow = editorRect.bottom - coords.bottom
                const spaceAbove = coords.top - editorRect.top

                let topPosition: number
                if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
                  // Not enough space below and more space above -> show above
                  topPosition = coords.top - editorRect.top - dropdownHeight - gap
                } else {
                  // Default: show below the line (directly under the text)
                  topPosition = coords.bottom - editorRect.top + gap
                }

                const meta = {
                  active: true,
                  position: {
                    top: topPosition,
                    left: coords.left - editorRect.left,
                  },
                  searchQuery: '',
                  triggerPos: cursorPos,
                  editorId,
                }

                // Check if we should block opening due to recent click-outside close
                const timeSinceClickOutside = Date.now() - lastClickOutsideCloseTime
                if (timeSinceClickOutside < 300) {
                  // Block autocomplete from reopening within 300ms of click-outside close
                  return
                }

                // Dispatch metadata to update plugin state
                const metaTr = view.state.tr.setMeta(wikiLinkAutocompletePluginKey, meta)
                view.dispatch(metaTr)

                // Emit custom event for React component with editor ID
                window.dispatchEvent(
                  new CustomEvent('wiki-link-autocomplete-open', {
                    detail: meta,
                  })
                )
              }, 0)

              return false // Let the second '[' be inserted normally
            }
          }

          // If autocomplete is active, update search query
          const currentState = wikiLinkAutocompletePluginKey.getState(state)
          if (currentState?.active) {
            const { doc, selection } = state
            const $pos = doc.resolve(selection.from)

            // Get editor ID
            // Look for data-editor-id on parent container (not the ProseMirror DOM)
            const container = view.dom.closest('[data-editor-id]')
            const editorId = container?.getAttribute('data-editor-id') || 'default'

            // Get text between [[ and cursor
            const textBetween = $pos.parent.textBetween(
              Math.max(0, currentState.triggerPos - $pos.start()),
              $pos.parentOffset,
              null,
              '\ufffc'
            )

            // Check if we're still within [[ ]]
            if (textBetween.includes(']]')) {
              // User moved past the closing ]], close autocomplete
              window.dispatchEvent(
                new CustomEvent('wiki-link-autocomplete-close', {
                  detail: { editorId },
                })
              )
              const meta = { active: false, position: null, searchQuery: '', triggerPos: 0 }
              const tr = view.state.tr.setMeta(wikiLinkAutocompletePluginKey, meta)
              view.dispatch(tr)
            } else {
              // Update search query
              const meta = { searchQuery: textBetween }
              const tr = view.state.tr.setMeta(wikiLinkAutocompletePluginKey, meta)
              view.dispatch(tr)

              window.dispatchEvent(
                new CustomEvent('wiki-link-autocomplete-update', {
                  detail: { searchQuery: textBetween, editorId },
                })
              )
            }
          }

          return false
        },
        handleKeyDown(view, event) {
          const currentState = wikiLinkAutocompletePluginKey.getState(view.state)

          if (currentState?.active) {
            // Get editor ID for scoping events
            const container = view.dom.closest('[data-editor-id]')
            const editorId = container?.getAttribute('data-editor-id') || 'default'

            // Prevent default behavior for arrow keys, Enter, and Escape
            if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) {
              // Emit events for React component to handle
              if (event.key === 'ArrowDown') {
                window.dispatchEvent(new CustomEvent('wiki-link-autocomplete-navigate', { detail: { direction: 'down', editorId } }))
                return true // Prevent default
              } else if (event.key === 'ArrowUp') {
                window.dispatchEvent(new CustomEvent('wiki-link-autocomplete-navigate', { detail: { direction: 'up', editorId } }))
                return true // Prevent default
              } else if (event.key === 'Enter') {
                // Dispatch select event
                const selectEvent = new CustomEvent('wiki-link-autocomplete-select', { detail: { editorId } })
                window.dispatchEvent(selectEvent)

                // Close autocomplete if just pressing Enter without selection
                // (selection will close it if successful)
                setTimeout(() => {
                  const stillActive = wikiLinkAutocompletePluginKey.getState(view.state)?.active
                  if (stillActive) {
                    // No selection was made, close autocomplete
                    window.dispatchEvent(new CustomEvent('wiki-link-autocomplete-close', { detail: { editorId } }))
                    const meta = { active: false, position: null, searchQuery: '', triggerPos: 0 }
                    const tr = view.state.tr.setMeta(wikiLinkAutocompletePluginKey, meta)
                    view.dispatch(tr)
                  }
                }, 10)

                // Don't prevent default - allow Enter to work normally
                return false
              } else if (event.key === 'Escape') {
                window.dispatchEvent(new CustomEvent('wiki-link-autocomplete-close', { detail: { editorId } }))
                const meta = { active: false, position: null, searchQuery: '', triggerPos: 0 }
                const tr = view.state.tr.setMeta(wikiLinkAutocompletePluginKey, meta)
                view.dispatch(tr)
                return true // Prevent default
              }
            }
          }

          return false
        },
      },
    })
  })
}

// Helper function to insert selected file
export function insertWikiLink(view: any, triggerPos: number, fileName: string) {
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
      state.schema.text(fileName)
    )
    // Move cursor after ]]
    tr.setSelection(TextSelection.create(tr.doc, triggerPos + fileName.length + 2))
    dispatch(tr)

    // Close autocomplete
    const meta = { active: false, position: null, searchQuery: '', triggerPos: 0 }
    const closeTr = view.state.tr.setMeta(wikiLinkAutocompletePluginKey, meta)
    view.dispatch(closeTr)
  }
}
