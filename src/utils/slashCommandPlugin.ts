import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'

const slashCommandKey = new PluginKey('slashCommand')

interface SlashCommand {
  label: string
  icon: string
  command: string
  category: 'text' | 'list' | 'advanced'
}

const commands: SlashCommand[] = [
  // Text category
  { label: 'Text', icon: 'T', command: 'paragraph', category: 'text' },
  { label: 'Heading 1', icon: 'H1', command: 'heading1', category: 'text' },
  { label: 'Heading 2', icon: 'H2', command: 'heading2', category: 'text' },
  { label: 'Heading 3', icon: 'H3', command: 'heading3', category: 'text' },
  { label: 'Heading 4', icon: 'H4', command: 'heading4', category: 'text' },
  { label: 'Heading 5', icon: 'H5', command: 'heading5', category: 'text' },
  { label: 'Heading 6', icon: 'H6', command: 'heading6', category: 'text' },
  { label: 'Quote', icon: '"', command: 'blockquote', category: 'text' },
  { label: 'Divider', icon: '―', command: 'divider', category: 'text' },

  // List category
  { label: 'Bullet List', icon: '•', command: 'bulletList', category: 'list' },
  { label: 'Ordered List', icon: '1.', command: 'orderedList', category: 'list' },

  // Advanced category
  { label: 'Code Block', icon: '</>', command: 'codeBlock', category: 'advanced' },
  { label: 'Table', icon: '⊞', command: 'table', category: 'advanced' },
]

export const slashCommandPlugin = () => {
  return $prose(() => {
    let menuElement: HTMLElement | null = null

    return new Plugin({
      key: slashCommandKey,
      state: {
        init() {
          return {
            active: false,
            range: null,
            selectedIndex: 0,
            filteredCommands: commands,
          }
        },
        apply(tr, value) {
          const meta = tr.getMeta(slashCommandKey)

          if (meta?.type === 'open') {
            const newState = {
              active: true,
              range: meta.range,
              selectedIndex: 0, // Start with first item selected
              filteredCommands: commands,
            }
            return newState
          }

          if (meta?.type === 'filter') {
            const query = meta.query.toLowerCase()
            const filtered = commands.filter(cmd =>
              cmd.label.toLowerCase().includes(query) ||
              cmd.command.toLowerCase().includes(query)
            )
            return {
              ...value,
              filteredCommands: filtered,
              selectedIndex: 0,
            }
          }

          if (meta?.type === 'navigate') {
            const newIndex = meta.direction === 'up'
              ? Math.max(0, value.selectedIndex - 1)
              : Math.min(value.filteredCommands.length - 1, value.selectedIndex + 1)
            return {
              ...value,
              selectedIndex: newIndex,
            }
          }

          if (meta?.type === 'close') {
            return {
              active: false,
              range: null,
              selectedIndex: 0,
              filteredCommands: commands,
            }
          }

          // Don't auto-close on document changes - let the user type
          // We'll close explicitly when needed (Escape, selection, etc)

          return value
        },
      },
      props: {
        handleKeyDown(view, event) {
          const state = slashCommandKey.getState(view.state)

          if (!state.active) {
            // Check if user typed /
            if (event.key === '/') {
              const { selection } = view.state
              const { $from } = selection

              // Only trigger at start of line or after space
              const textBefore = $from.parent.textBetween(0, $from.parentOffset, null, '\ufffc')
              if (textBefore === '' || textBefore.endsWith(' ')) {
                // Will be handled in handleTextInput
                return false
              }
            }
            return false
          }

          // Menu is active - handle navigation
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            view.dispatch(view.state.tr.setMeta(slashCommandKey, { type: 'navigate', direction: 'down' }))
            updateMenu(view)
            return true
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault()
            view.dispatch(view.state.tr.setMeta(slashCommandKey, { type: 'navigate', direction: 'up' }))
            updateMenu(view)
            return true
          }

          if (event.key === 'Enter') {
            event.preventDefault()
            executeCommand(view, state.filteredCommands[state.selectedIndex])
            return true
          }

          if (event.key === 'Escape') {
            event.preventDefault()
            closeMenu(view)
            return true
          }

          return false
        },
        handleTextInput(view, from, to, text) {
          const { selection } = view.state
          const { $from } = selection

          // Check if user just typed /
          if (text === '/') {
            const textBefore = $from.parent.textBetween(0, $from.parentOffset - 1, null, '\ufffc')

            if (textBefore === '' || textBefore.endsWith(' ')) {
              // Open menu - dispatch transaction and wait for state to update
              view.dispatch(
                view.state.tr.setMeta(slashCommandKey, {
                  type: 'open',
                  range: { from: from, to: to },
                })
              )

              // Use requestAnimationFrame to ensure state has updated
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  showMenu(view)
                })
              })

              return false
            }
          }

          // Filter commands as user types
          const state = slashCommandKey.getState(view.state)
          if (state.active && state.range) {
            const query = view.state.doc.textBetween(state.range.from + 1, selection.from, null, '\ufffc')
            const tr = view.state.tr.setMeta(slashCommandKey, {
              type: 'filter',
              query,
            })
            view.dispatch(tr)
            requestAnimationFrame(() => updateMenu(view))
          }

          return false
        },
        handleClick() {
          // Close menu on click outside
          if (menuElement) {
            setTimeout(() => {
              const state = slashCommandKey.getState(this.state)
              if (state.active) {
                closeMenu(this)
              }
            }, 10)
          }
          return false
        },
      },
    })

    function showMenu(view: any) {
      const state = slashCommandKey.getState(view.state)

      if (!state.active || !state.range) {
        return
      }

      // Remove existing menu
      if (menuElement) {
        menuElement.remove()
      }

      // Create menu
      menuElement = document.createElement('div')
      menuElement.className = 'slash-command-menu'

      // Position menu - first render it off-screen to measure height
      menuElement.style.position = 'fixed'
      menuElement.style.left = '-9999px'
      menuElement.style.top = '-9999px'
      menuElement.style.zIndex = '1000'

      renderMenuItems(view, menuElement)
      document.body.appendChild(menuElement)

      // Now measure and position smartly
      const coords = view.coordsAtPos(state.range.from)
      const menuHeight = menuElement.offsetHeight
      const menuWidth = menuElement.offsetWidth
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth

      // Calculate space above and below cursor
      const spaceBelow = viewportHeight - coords.bottom
      const spaceAbove = coords.top

      // Determine vertical position
      let top: number
      if (spaceBelow >= menuHeight + 10) {
        // Enough space below - show below cursor
        top = coords.bottom + 5
      } else if (spaceAbove >= menuHeight + 10) {
        // Not enough space below but enough above - show above cursor
        top = coords.top - menuHeight - 5
      } else {
        // Not enough space either way - show below but allow scrolling
        top = coords.bottom + 5
      }

      // Determine horizontal position (avoid going off-screen on right)
      let left = coords.left
      if (left + menuWidth > viewportWidth - 10) {
        left = viewportWidth - menuWidth - 10
      }
      if (left < 10) {
        left = 10
      }

      menuElement.style.left = `${left}px`
      menuElement.style.top = `${top}px`
    }

    function updateMenu(view: any) {
      if (!menuElement) return
      renderMenuItems(view, menuElement)
    }

    function renderMenuItems(view: any, container: HTMLElement) {
      const state = slashCommandKey.getState(view.state)
      if (!state.active) return

      // Save current scroll position of content area before re-rendering
      const oldContentArea = container.querySelector('.slash-command-content') as HTMLElement
      const savedScrollTop = oldContentArea?.scrollTop || 0

      container.innerHTML = ''

      // Add tabs at top
      const tabsContainer = document.createElement('div')
      tabsContainer.className = 'slash-command-tabs'

      const tabs = [
        { key: 'text', label: 'Text' },
        { key: 'list', label: 'List' },
        { key: 'advanced', label: 'Advanced' },
      ]

      // Determine active tab based on selected item's category
      const selectedCommand = state.filteredCommands[state.selectedIndex]
      const activeCategory = selectedCommand?.category || 'text'

      tabs.forEach(tab => {
        const tabButton = document.createElement('button')
        tabButton.className = `slash-command-tab${tab.key === activeCategory ? ' active' : ''}`
        tabButton.textContent = tab.label
        tabButton.onclick = (e) => {
          e.preventDefault()
          e.stopPropagation()
          // Scroll to category section
          requestAnimationFrame(() => {
            const categoryLabel = container.querySelector(`.slash-command-category[data-category="${tab.key}"]`)
            if (categoryLabel) {
              categoryLabel.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          })
        }
        tabsContainer.appendChild(tabButton)
      })

      container.appendChild(tabsContainer)

      // Add scrollable content area
      const contentArea = document.createElement('div')
      contentArea.className = 'slash-command-content'

      if (state.filteredCommands.length === 0) {
        const emptyDiv = document.createElement('div')
        emptyDiv.className = 'slash-command-item'
        emptyDiv.textContent = 'No commands found'
        emptyDiv.style.opacity = '0.5'
        contentArea.appendChild(emptyDiv)
      } else {
        // Group commands by category
        const categories = [
          { key: 'text', label: 'TEXT' },
          { key: 'list', label: 'LIST' },
          { key: 'advanced', label: 'ADVANCED' },
        ]

        categories.forEach(category => {
          const categoryCommands = state.filteredCommands.filter((cmd: SlashCommand) => cmd.category === category.key)

          if (categoryCommands.length === 0) return

          // Add category label
          const categoryLabel = document.createElement('div')
          categoryLabel.className = 'slash-command-category'
          categoryLabel.setAttribute('data-category', category.key)
          categoryLabel.textContent = category.label
          contentArea.appendChild(categoryLabel)

          // Add commands for this category
          categoryCommands.forEach((cmd: SlashCommand) => {
            const globalIndex = state.filteredCommands.indexOf(cmd)
            const item = document.createElement('div')
            item.className = `slash-command-item${globalIndex === state.selectedIndex ? ' selected' : ''}`
            item.setAttribute('data-index', globalIndex.toString())

            const icon = document.createElement('span')
            icon.className = 'slash-command-icon'
            icon.textContent = cmd.icon

            const label = document.createElement('span')
            label.textContent = cmd.label

            item.appendChild(icon)
            item.appendChild(label)

            item.onclick = (e) => {
              e.preventDefault()
              e.stopPropagation()
              executeCommand(view, cmd)
            }

            contentArea.appendChild(item)
          })
        })
      }

      container.appendChild(contentArea)

      // Restore scroll position first, then adjust if needed
      requestAnimationFrame(() => {
        // Restore the saved scroll position
        contentArea.scrollTop = savedScrollTop

        const selectedItem = contentArea.querySelector('.slash-command-item.selected') as HTMLElement
        if (selectedItem) {
          const containerRect = contentArea.getBoundingClientRect()
          const itemRect = selectedItem.getBoundingClientRect()

          // Only scroll if the selected item is outside the visible area
          // Check if item is above the visible area
          if (itemRect.top < containerRect.top) {
            selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          }
          // Check if item is below the visible area
          else if (itemRect.bottom > containerRect.bottom) {
            selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          }
          // Otherwise, item is already visible - don't scroll
        }
      })
    }

    function executeCommand(view: any, cmd: SlashCommand) {
      const state = slashCommandKey.getState(view.state)
      if (!state.range) return

      const { from } = state.range
      const to = view.state.selection.from
      const { tr, schema } = view.state

      // Delete the / and any typed text
      tr.delete(from, to)

      // Insert the block
      let node
      switch (cmd.command) {
        case 'heading1':
          node = schema.nodes.heading.create({ level: 1 })
          break
        case 'heading2':
          node = schema.nodes.heading.create({ level: 2 })
          break
        case 'heading3':
          node = schema.nodes.heading.create({ level: 3 })
          break
        case 'heading4':
          node = schema.nodes.heading.create({ level: 4 })
          break
        case 'heading5':
          node = schema.nodes.heading.create({ level: 5 })
          break
        case 'heading6':
          node = schema.nodes.heading.create({ level: 6 })
          break
        case 'bulletList':
          // Check if bullet_list exists in schema
          if (schema.nodes.bullet_list) {
            node = schema.nodes.bullet_list.create(
              null,
              schema.nodes.list_item.create(null, schema.nodes.paragraph.create())
            )
          } else if (schema.nodes.bulletList) {
            node = schema.nodes.bulletList.create(
              null,
              schema.nodes.listItem.create(null, schema.nodes.paragraph.create())
            )
          }
          break
        case 'orderedList':
          // Check if ordered_list exists in schema
          if (schema.nodes.ordered_list) {
            node = schema.nodes.ordered_list.create(
              null,
              schema.nodes.list_item.create(null, schema.nodes.paragraph.create())
            )
          } else if (schema.nodes.orderedList) {
            node = schema.nodes.orderedList.create(
              null,
              schema.nodes.listItem.create(null, schema.nodes.paragraph.create())
            )
          }
          break
        case 'codeBlock':
          // Check both code_block and codeBlock
          if (schema.nodes.code_block) {
            node = schema.nodes.code_block.create()
          } else if (schema.nodes.codeBlock) {
            node = schema.nodes.codeBlock.create()
          }
          break
        case 'blockquote':
          node = schema.nodes.blockquote.create(null, schema.nodes.paragraph.create())
          break
        case 'taskList':
          // Use bullet_list with list_item that has checked attribute
          if (schema.nodes.bullet_list && schema.nodes.list_item) {
            // Check what attributes list_item supports
            const listItemSpecAttrs = schema.nodes.list_item.spec.attrs || {}

            // Create list item with checked attribute set to null (unchecked checkbox)
            // In Milkdown GFM, checked: null means unchecked checkbox, checked: true means checked
            const listItemAttrs: any = {}
            if ('checked' in listItemSpecAttrs) {
              listItemAttrs.checked = null // null = unchecked checkbox (not false)
            }
            if ('listType' in listItemSpecAttrs) {
              listItemAttrs.listType = 'task'
            }

            node = schema.nodes.bullet_list.create(
              null,
              schema.nodes.list_item.create(
                listItemAttrs,
                schema.nodes.paragraph.create()
              )
            )
          } else if (schema.nodes.bulletList && schema.nodes.listItem) {
            const attrs = schema.nodes.listItem.spec.attrs || {}
            const listItemAttrs: any = {}
            if ('checked' in attrs) {
              listItemAttrs.checked = false
            }
            if ('listType' in attrs) {
              listItemAttrs.listType = 'task'
            }

            node = schema.nodes.bulletList.create(
              { listType: 'task' },
              schema.nodes.listItem.create(
                listItemAttrs,
                schema.nodes.paragraph.create()
              )
            )
          }
          break
        case 'divider':
          // Check both horizontal_rule and horizontalRule
          if (schema.nodes.horizontal_rule) {
            node = schema.nodes.horizontal_rule.create()
          } else if (schema.nodes.horizontalRule) {
            node = schema.nodes.horizontalRule.create()
          } else if (schema.nodes.hr) {
            node = schema.nodes.hr.create()
          }
          break
        case 'image':
          // For now, just insert a paragraph and let user add image manually
          // TODO: Add image upload dialog
          node = schema.nodes.paragraph.create()
          break
        case 'table':
          // Create a simple 3x3 table with proper GFM alignment attributes
          if (schema.nodes.table) {
            // GFM tables require alignment attribute on cells (null = default/left alignment)
            const cellAttrs = { alignment: null }

            const cell = schema.nodes.table_cell?.create(cellAttrs, schema.nodes.paragraph.create()) ||
                        schema.nodes.tableCell?.create(cellAttrs, schema.nodes.paragraph.create())
            const headerCell = schema.nodes.table_header?.create(cellAttrs, schema.nodes.paragraph.create()) || cell

            const headerRow = schema.nodes.table_row?.create(null, [headerCell, headerCell, headerCell]) ||
                             schema.nodes.tableRow?.create(null, [headerCell, headerCell, headerCell])
            const row = schema.nodes.table_row?.create(null, [cell, cell, cell]) ||
                       schema.nodes.tableRow?.create(null, [cell, cell, cell])

            node = schema.nodes.table.create(null, [headerRow, row, row])
          }
          break
        case 'math':
          // Math block not yet implemented
          node = schema.nodes.paragraph.create()
          break
        default:
          node = schema.nodes.paragraph.create()
      }

      if (!node) {
        console.error('[SlashCommand] Failed to create node for command:', cmd.command)
        closeMenu(view)
        return
      }

      // Replace current block with new node
      const $pos = tr.doc.resolve(from)
      const start = $pos.before()
      const end = $pos.after()

      tr.replaceWith(start, end, node)

      // Set cursor position
      const newPos = start + 1
      tr.setSelection(view.state.selection.constructor.near(tr.doc.resolve(newPos)))

      view.dispatch(tr)
      closeMenu(view)
    }

    function closeMenu(view: any) {
      if (menuElement) {
        menuElement.remove()
        menuElement = null
      }
      view.dispatch(view.state.tr.setMeta(slashCommandKey, { type: 'close' }))
    }
  })
}
