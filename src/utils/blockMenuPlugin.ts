import { $ctx, $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import { editorViewCtx } from '@milkdown/core'

const blockMenuKey = new PluginKey('blockMenu')

// Helper function to create decorations
function createDecorations(state: any, ctx: any) {
  const decorations: Decoration[] = []
  const { doc } = state

  // Add block handle decoration for each block
  doc.forEach((node: any, offset: number) => {
    if (node.isBlock && node.type.name !== 'doc') {
      // Create widget decoration for block handle
      const widget = Decoration.widget(offset, () => {
        const button = document.createElement('button')
        button.className = 'block-menu-trigger'
        button.innerHTML = '<span>+</span>'
        button.contentEditable = 'false'

        button.onclick = (e) => {
          e.preventDefault()
          e.stopPropagation()

          // Get the editor view
          const view = (ctx as any).get(editorViewCtx)
          if (!view) return

          // Toggle menu
          const tr = view.state.tr
          const pluginState = blockMenuKey.getState(view.state)

          if (pluginState?.menuOpen && pluginState?.menuPos === offset) {
            tr.setMeta(blockMenuKey, { type: 'closeMenu' })
          } else {
            tr.setMeta(blockMenuKey, { type: 'openMenu', pos: offset })
            showBlockMenu(button, view, offset)
          }

          view.dispatch(tr)
        }

        return button
      }, {
        side: -1,
        key: `block-handle-${offset}`
      })

      decorations.push(widget)
    }
  })

  return DecorationSet.create(doc, decorations)
}

export const blockMenuPlugin = () => {
  return $prose((ctx) => {
    return new Plugin({
      key: blockMenuKey,
      state: {
        init(_, state) {
          return {
            decorations: createDecorations(state, ctx),
            menuOpen: false,
            menuPos: null
          }
        },
        apply(tr, value, oldState, newState) {
          const meta = tr.getMeta(blockMenuKey)

          if (meta?.type === 'openMenu') {
            return {
              decorations: createDecorations(newState, ctx),
              menuOpen: true,
              menuPos: meta.pos
            }
          }

          if (meta?.type === 'closeMenu') {
            return {
              decorations: createDecorations(newState, ctx),
              menuOpen: false,
              menuPos: null
            }
          }

          // Update decorations on document change
          if (tr.docChanged) {
            return {
              decorations: createDecorations(newState, ctx),
              menuOpen: value.menuOpen,
              menuPos: value.menuPos
            }
          }

          return value
        }
      },
      props: {
        decorations(state) {
          return blockMenuKey.getState(state)?.decorations || DecorationSet.empty
        }
      }
    })
  })
}

function showBlockMenu(button: HTMLElement, view: any, pos: number) {
  // Remove any existing menu
  const existingMenu = document.querySelector('.block-menu-dropdown')
  if (existingMenu) {
    existingMenu.remove()
  }

  // Create menu element
  const menu = document.createElement('div')
  menu.className = 'block-menu-dropdown show'
  menu.style.position = 'absolute'

  // Position menu below the button
  const buttonRect = button.getBoundingClientRect()
  menu.style.left = `${buttonRect.left}px`
  menu.style.top = `${buttonRect.bottom + 5}px`

  // Create menu content
  menu.innerHTML = `
    <div class="block-menu-tabs">
      <button class="block-menu-tab active" data-tab="basic">Basic</button>
      <button class="block-menu-tab" data-tab="advanced">Advanced</button>
    </div>
    <div class="block-menu-content">
      <div class="block-menu-section" data-section="basic">
        <div class="block-menu-label">Text</div>
        <button class="block-menu-item" data-type="paragraph">
          <span class="block-icon">¶</span>
          <span>Paragraph</span>
        </button>
        <button class="block-menu-item" data-type="heading1">
          <span class="block-icon">H1</span>
          <span>Heading 1</span>
        </button>
        <button class="block-menu-item" data-type="heading2">
          <span class="block-icon">H2</span>
          <span>Heading 2</span>
        </button>
        <button class="block-menu-item" data-type="heading3">
          <span class="block-icon">H3</span>
          <span>Heading 3</span>
        </button>
        <button class="block-menu-item" data-type="blockquote">
          <span class="block-icon">"</span>
          <span>Blockquote</span>
        </button>
        <div class="block-menu-divider"></div>
        <div class="block-menu-label">Lists</div>
        <button class="block-menu-item" data-type="bullet">
          <span class="block-icon">•</span>
          <span>Bullet List</span>
        </button>
        <button class="block-menu-item" data-type="ordered">
          <span class="block-icon">1.</span>
          <span>Ordered List</span>
        </button>
        <button class="block-menu-item" data-type="task">
          <span class="block-icon">☐</span>
          <span>Task List</span>
        </button>
      </div>
      <div class="block-menu-section" data-section="advanced" style="display: none;">
        <button class="block-menu-item" data-type="codeblock">
          <span class="block-icon">&lt;/&gt;</span>
          <span>Code Block</span>
        </button>
        <button class="block-menu-item" data-type="table">
          <span class="block-icon">⊞</span>
          <span>Table</span>
        </button>
        <button class="block-menu-item" data-type="divider">
          <span class="block-icon">―</span>
          <span>Divider</span>
        </button>
      </div>
    </div>
  `

  // Add tab switching
  const tabs = menu.querySelectorAll('.block-menu-tab')
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault()
      const tabName = (tab as HTMLElement).dataset.tab

      // Update active tab
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')

      // Show corresponding section
      const sections = menu.querySelectorAll('.block-menu-section')
      sections.forEach(section => {
        const sectionEl = section as HTMLElement
        sectionEl.style.display = sectionEl.dataset.section === tabName ? 'block' : 'none'
      })
    })
  })

  // Add click handlers for menu items
  const items = menu.querySelectorAll('.block-menu-item')
  items.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault()
      const type = (item as HTMLElement).dataset.type

      // Insert the block at the position
      insertBlock(view, pos, type || 'paragraph')

      // Close menu
      menu.remove()
      const tr = view.state.tr
      tr.setMeta(blockMenuKey, { type: 'closeMenu' })
      view.dispatch(tr)
    })
  })

  // Close menu on click outside
  setTimeout(() => {
    document.addEventListener('click', function closeMenu(e) {
      if (!menu.contains(e.target as Node) && e.target !== button) {
        menu.remove()
        document.removeEventListener('click', closeMenu)

        const tr = view.state.tr
        tr.setMeta(blockMenuKey, { type: 'closeMenu' })
        view.dispatch(tr)
      }
    })
  }, 0)

  document.body.appendChild(menu)
}

function insertBlock(view: any, pos: number, type: string) {
  const { state, dispatch } = view
  const { schema, tr } = state

  let node
  switch (type) {
    case 'heading1':
      node = schema.nodes.heading.create({ level: 1 })
      break
    case 'heading2':
      node = schema.nodes.heading.create({ level: 2 })
      break
    case 'heading3':
      node = schema.nodes.heading.create({ level: 3 })
      break
    case 'blockquote':
      node = schema.nodes.blockquote.create(
        null,
        schema.nodes.paragraph.create()
      )
      break
    case 'bullet':
      node = schema.nodes.bulletList.create(
        null,
        schema.nodes.listItem.create(
          null,
          schema.nodes.paragraph.create()
        )
      )
      break
    case 'ordered':
      node = schema.nodes.orderedList.create(
        null,
        schema.nodes.listItem.create(
          null,
          schema.nodes.paragraph.create()
        )
      )
      break
    case 'task':
      node = schema.nodes.bulletList.create(
        { tight: true },
        schema.nodes.listItem.create(
          { checked: false },
          schema.nodes.paragraph.create()
        )
      )
      break
    case 'codeblock':
      node = schema.nodes.codeBlock.create()
      break
    case 'table':
      // Create a 3x3 table
      const cell = schema.nodes.tableCell.create(
        null,
        schema.nodes.paragraph.create()
      )
      const headerCell = schema.nodes.tableHeader?.create(
        null,
        schema.nodes.paragraph.create()
      ) || cell

      const headerRow = schema.nodes.tableRow.create(null, [
        headerCell, headerCell, headerCell
      ])
      const row = schema.nodes.tableRow.create(null, [
        cell, cell, cell
      ])

      node = schema.nodes.table?.create(null, [headerRow, row, row]) ||
             schema.nodes.paragraph.create()
      break
    case 'divider':
      node = schema.nodes.horizontalRule.create()
      break
    default:
      node = schema.nodes.paragraph.create()
  }

  // Insert the node after the current block
  const $pos = state.doc.resolve(pos)
  const endOfBlock = $pos.end()

  tr.insert(endOfBlock + 1, node)

  // Move cursor to the new block
  const newPos = endOfBlock + 2
  tr.setSelection(state.selection.constructor.near(tr.doc.resolve(newPos)))

  dispatch(tr)
}
