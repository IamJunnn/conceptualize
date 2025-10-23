import { $view } from '@milkdown/utils'
import type { Node } from '@milkdown/prose/model'
import type { EditorView, NodeView } from '@milkdown/prose/view'

// NodeView for rendering todo blocks
export const todoBlockView = $view((node: Node, view: EditorView, getPos: () => number | undefined) => {
  const dom = document.createElement('div')
  dom.className = 'todo-block-container'
  dom.contentEditable = 'false'

  const todoId = node.attrs.todoId

  // Create the todo block structure
  const todoBlock = document.createElement('div')
  todoBlock.className = 'todo-block'

  todoBlock.innerHTML = `
    <div class="todo-block-content">
      <input type="checkbox" class="todo-checkbox" />
      <div class="todo-main">
        <div class="todo-title">Loading...</div>
        <div class="todo-metadata"></div>
      </div>
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

  dom.appendChild(todoBlock)

  // Load todo data asynchronously
  loadTodoData(todoId, dom)

  // Setup event handlers
  const checkbox = todoBlock.querySelector('.todo-checkbox') as HTMLInputElement
  const editBtn = todoBlock.querySelector('.todo-edit-btn') as HTMLButtonElement
  const deleteBtn = todoBlock.querySelector('.todo-delete-btn') as HTMLButtonElement

  checkbox.onclick = async (e) => {
    e.stopPropagation()
    // Toggle todo completion
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('toggle_todo_completion', { todoId })
    // Reload data to update UI
    loadTodoData(todoId, dom)
  }

  editBtn.onclick = (e) => {
    e.stopPropagation()
    // Dispatch event to open edit modal
    window.dispatchEvent(new CustomEvent('editTodo', {
      detail: { todoId }
    }))
  }

  deleteBtn.onclick = async (e) => {
    e.stopPropagation()
    // Confirm and delete
    if (confirm('Delete this todo?')) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('delete_todo', { todoId })

        // Remove the node from the document
        const pos = getPos()
        if (pos !== undefined) {
          const tr = view.state.tr.delete(pos, pos + node.nodeSize)
          view.dispatch(tr)
        }
      } catch (error) {
        console.error('Failed to delete todo:', error)
      }
    }
  }

  return {
    dom,
    contentDOM: undefined, // No editable content inside
    update: (newNode: Node) => {
      // Only update if it's the same type of node
      if (newNode.type.name !== 'todoBlock') return false

      // If todoId changed, reload data
      if (newNode.attrs.todoId !== todoId) {
        loadTodoData(newNode.attrs.todoId, dom)
      }

      return true
    },
    destroy: () => {
      // Cleanup if needed
    },
  } as NodeView
})

async function loadTodoData(todoId: string, container: HTMLElement) {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const todos = await invoke<any[]>('get_all_todos')
    const todo = todos.find((t: any) => t.id === todoId)

    if (todo) {
      updateTodoUI(container, todo)
    } else {
      // Todo not found
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

function updateTodoUI(container: HTMLElement, todo: any) {
  const checkbox = container.querySelector('.todo-checkbox') as HTMLInputElement
  const titleEl = container.querySelector('.todo-title')
  const metadataEl = container.querySelector('.todo-metadata')

  if (checkbox) {
    checkbox.checked = todo.completed
  }

  if (titleEl) {
    titleEl.textContent = todo.text
    titleEl.className = 'todo-title'
    if (todo.completed) {
      titleEl.classList.add('completed')
    }
  }

  if (metadataEl) {
    const metaParts: string[] = []

    // Linked note
    if (todo.linkedNote) {
      metaParts.push(`
        <div class="todo-meta-item">
          <span class="todo-linked-note">[[${todo.linkedNote}]]</span>
        </div>
      `)
    }

    // Start date
    if (todo.startDate) {
      const date = new Date(todo.startDate)
      const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      metaParts.push(`
        <div class="todo-meta-item">
          <span class="todo-date-label">Start:</span>
          <span class="todo-date">${formatted}</span>
        </div>
      `)
    }

    // End date
    if (todo.endDate) {
      const date = new Date(todo.endDate)
      const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      metaParts.push(`
        <div class="todo-meta-item">
          <span class="todo-date-label">End:</span>
          <span class="todo-date">${formatted}</span>
        </div>
      `)
    }

    // Priority
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
      metaParts.push(`
        <div class="todo-meta-item">
          <span class="todo-priority" style="color: ${color}; border-color: ${color};">${label}</span>
        </div>
      `)
    }

    metadataEl.innerHTML = metaParts.join('')
  }
}
