/**
 * Todo Block Plugin
 * Renders inline todo blocks in the editor from {{todo:id}} syntax
 * Features:
 * - Compact, clean layout matching TodoPanel design
 * - Checkbox, title, priority badge, description, and end date
 * - Edit and delete buttons on hover
 * - Custom dark-themed delete confirmation modal
 */

import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'

const todoBlockKey = new PluginKey('todoBlock')

/**
 * Shows a custom dark-themed confirmation dialog for todo deletion
 * @returns Promise<boolean> - true if user confirms deletion, false otherwise
 */
function showDeleteConfirmation(): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.createElement('div')
    modal.className = 'todo-delete-modal-overlay'

    modal.innerHTML = `
      <div class="todo-delete-modal">
        <div class="todo-delete-modal-header">
          <h3>Delete this todo?</h3>
        </div>
        <div class="todo-delete-modal-body">
          <p>This action cannot be undone.</p>
        </div>
        <div class="todo-delete-modal-footer">
          <button class="todo-modal-btn todo-modal-btn-cancel">Cancel</button>
          <button class="todo-modal-btn todo-modal-btn-delete">Delete</button>
        </div>
      </div>
    `

    document.body.appendChild(modal)

    const cancelBtn = modal.querySelector('.todo-modal-btn-cancel') as HTMLButtonElement
    const deleteBtn = modal.querySelector('.todo-modal-btn-delete') as HTMLButtonElement

    const cleanup = () => {
      modal.remove()
    }

    cancelBtn.onclick = () => {
      cleanup()
      resolve(false)
    }

    deleteBtn.onclick = () => {
      cleanup()
      resolve(true)
    }

    modal.onclick = (e) => {
      if (e.target === modal) {
        cleanup()
        resolve(false)
      }
    }
  })
}

export const todoBlockPlugin = $prose(() => {
  return new Plugin({
    key: todoBlockKey,
    state: {
      init(_, { doc }) {
        return findTodoBlocks(doc)
      },
      apply(tr, _oldState) {
        return findTodoBlocks(tr.doc)
      }
    },
    props: {
      decorations(state) {
        return this.getState(state)
      }
    }
  })

  /**
   * Finds all {{todo:id}} patterns in the document and creates decorations
   * @param doc - ProseMirror document
   * @returns DecorationSet with widget decorations for todo blocks
   */
  function findTodoBlocks(doc: any) {
    const decorations: Decoration[] = []
    const regex = /\{\{todo:([a-zA-Z0-9-]+)\}\}/g

    doc.descendants((node: any, pos: number) => {
      if (!node.isText) return

      const text = node.text
      if (!text) return

      let match
      while ((match = regex.exec(text)) !== null) {
        const start = pos + match.index
        const end = start + match[0].length
        const todoId = match[1]

        // Create widget decoration that renders the todo block
        const decoration = Decoration.widget(
          start,
          () => createTodoWidget(todoId),
          {
            side: 0,
            key: `todo-${todoId}`,
          }
        )

        decorations.push(decoration)

        // Hide the original {{todo:id}} text
        decorations.push(
          Decoration.inline(start, end, {
            nodeName: 'span',
            style: 'display: none;',
          })
        )
      }
    })

    return DecorationSet.create(doc, decorations)
  }

  /**
   * Creates a todo widget DOM element
   * Layout: [checkbox] title P1
   *         description
   *         End: date    [edit][delete]
   * @param todoId - The unique ID of the todo
   * @returns DOM element for the todo block
   */
  function createTodoWidget(todoId: string) {
    const container = document.createElement('span')
    container.className = 'todo-block-wrapper'
    container.contentEditable = 'false'
    container.style.display = 'inline-block'
    container.style.width = '100%'
    container.style.verticalAlign = 'top'
    container.style.margin = '8px 0'

    const todoBlock = document.createElement('div')
    todoBlock.className = 'todo-block'

    // Create todo block structure
    todoBlock.innerHTML = `
      <div class="todo-block-top">
        <input type="checkbox" class="todo-checkbox" />
        <div class="todo-main">
          <div class="todo-title">Loading...</div>
          <div class="todo-description-container"></div>
        </div>
      </div>
      <div class="todo-block-bottom">
        <div class="todo-metadata"></div>
        <div class="todo-actions">
          <button class="todo-edit-btn" title="Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="todo-delete-btn" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `

    container.appendChild(todoBlock)

    loadTodoData(todoId, container)

    // Setup event handlers for checkbox, edit, and delete buttons
    const checkbox = todoBlock.querySelector('.todo-checkbox') as HTMLInputElement
    const editBtn = todoBlock.querySelector('.todo-edit-btn') as HTMLButtonElement
    const deleteBtn = todoBlock.querySelector('.todo-delete-btn') as HTMLButtonElement

    checkbox.onclick = async (e) => {
      e.stopPropagation()
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('toggle_todo_completion', { todoId })
      loadTodoData(todoId, container)
    }

    editBtn.onclick = (e) => {
      e.stopPropagation()
      window.dispatchEvent(new CustomEvent('editTodo', {
        detail: { todoId }
      }))
    }

    deleteBtn.onclick = async (e) => {
      e.stopPropagation()
      const shouldDelete = await showDeleteConfirmation()
      if (shouldDelete) {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('delete_todo', { todoId })
          // The decoration will be removed on next render
        } catch (error) {
          console.error('Failed to delete todo:', error)
        }
      }
    }

    return container
  }

  /**
   * Loads todo data from Tauri backend and updates the UI
   * @param todoId - The todo ID to load
   * @param container - The container element to update
   */
  async function loadTodoData(todoId: string, container: HTMLElement) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const todos = await invoke<any[]>('get_all_todos')
      const todo = todos.find((t: any) => t.id === todoId)

      if (todo) {
        updateTodoUI(container, todo)
      } else {
        const titleEl = container.querySelector('.todo-title')
        if (titleEl) {
          titleEl.textContent = 'Todo not found'
          titleEl.classList.add('todo-error')
        }
      }
    } catch (error) {
      console.error('Failed to load todo:', error)
      const titleEl = container.querySelector('.todo-title')
      if (titleEl) {
        titleEl.textContent = 'Failed to load todo'
        titleEl.classList.add('todo-error')
      }
    }
  }

  /**
   * Updates the todo block UI with todo data
   * Renders: title + priority, description, and end date
   * @param container - The container element
   * @param todo - The todo data object
   */
  function updateTodoUI(container: HTMLElement, todo: any) {
    const checkbox = container.querySelector('.todo-checkbox') as HTMLInputElement
    const titleEl = container.querySelector('.todo-title')
    const descriptionEl = container.querySelector('.todo-description-container')
    const metadataEl = container.querySelector('.todo-metadata')

    if (checkbox) {
      checkbox.checked = todo.completed
    }

    if (titleEl) {
      // Create title with priority on the same line
      let titleHTML = `<span class="todo-title-text ${todo.completed ? 'completed' : ''}">${todo.text}</span>`

      // Add priority badge on the same line
      if (todo.priority) {
        const priorityColors: Record<number, string> = {
          1: '#e74c3c',
          2: '#ff9800',
          3: '#ffd700',
          4: '#ffffff'
        }
        const priorityLabels: Record<number, string> = {
          1: 'P1',
          2: 'P2',
          3: 'P3',
          4: 'P4'
        }
        const color = priorityColors[todo.priority] || '#888'
        const label = priorityLabels[todo.priority] || `P${todo.priority}`
        titleHTML += `<span class="todo-priority" style="color: ${color}; border-color: ${color};">${label}</span>`
      }

      titleEl.innerHTML = titleHTML
    }

    // Description goes in its own container
    if (descriptionEl) {
      if (todo.description) {
        descriptionEl.innerHTML = `<div class="todo-description">${todo.description}</div>`
      } else {
        descriptionEl.innerHTML = ''
      }
    }

    // Metadata (end date) goes in bottom row with actions
    if (metadataEl) {
      if (todo.endDate) {
        const date = new Date(todo.endDate)
        const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        metadataEl.innerHTML = `
          <div class="todo-meta-row">
            <span class="todo-date-label">End:</span>
            <span class="todo-date">${formatted}</span>
          </div>
        `
      } else {
        metadataEl.innerHTML = ''
      }
    }
  }
})
