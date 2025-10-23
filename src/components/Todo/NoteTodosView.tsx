import React, { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { PlusIcon, TrashIcon, ArchiveBoxIcon, FunnelIcon, ClipboardDocumentListIcon, ArrowLeftIcon, PencilIcon, CalendarIcon } from '@heroicons/react/24/outline'
import './NoteTodosView.css'
import QuickAddModal, { TodoFormData } from './QuickAddModal'
import EditTodoModal from './EditTodoModal'

interface NoteTodo {
  id: string
  title: string
  completed: boolean
  priority?: number // 1-4: 1=urgent(red), 2=high(orange), 3=medium(yellow), 4=low(white)
  start_date?: string
  end_date?: string
  note_path: string
  line_number: number
  created_at: string
  completed_at?: string
  description?: string
}

interface NoteTodosResult {
  active: NoteTodo[]
  archived: NoteTodo[]
}

type SortMode = 'date' | 'priority' | 'note'
type ViewMode = 'active' | 'archive'

interface NoteTodosViewProps {
  rootPath: string
  onOpenFile?: (filePath: string, fileName: string) => void
}

const NoteTodosView: React.FC<NoteTodosViewProps> = ({ rootPath, onOpenFile }) => {
  const [todos, setTodos] = useState<NoteTodosResult>({ active: [], archived: [] })
  const [sortMode, setSortMode] = useState<SortMode>('date')
  const [viewMode, setViewMode] = useState<ViewMode>('active')
  const [loading, setLoading] = useState(true)
  const [showQuickAddModal, setShowQuickAddModal] = useState(false)
  const [editingTodo, setEditingTodo] = useState<NoteTodo | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ show: boolean; todo: NoteTodo | null }>({ show: false, todo: null })
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [errorMessage, setErrorMessage] = useState<{ show: boolean; message: string }>({ show: false, message: '' })
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadTodos()
  }, [rootPath])

  // Handle ESC key to close delete confirmation modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (deleteConfirmation.show) {
          setDeleteConfirmation({ show: false, todo: null })
        }
        if (errorMessage.show) {
          setErrorMessage({ show: false, message: '' })
        }
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [deleteConfirmation.show, errorMessage.show])

  const loadTodos = async () => {
    try {
      setLoading(true)
      // Use unified command to get BOTH note todos AND todos.json todos
      const result = await invoke<NoteTodosResult>('get_unified_todos', { rootPath })
      setTodos(result)
    } catch (error) {
      console.error('Failed to load todos:', error)
    } finally {
      setLoading(false)
    }
  }

  const getPriorityColor = (priority?: number) => {
    switch (priority) {
      case 1: return '#e74c3c' // Red
      case 2: return '#ff9800' // Orange
      case 3: return '#ffd700' // Yellow
      case 4: return '#ffffff' // White
      default: return '#888'    // Gray (no priority)
    }
  }

  const getPriorityLabel = (priority?: number) => {
    switch (priority) {
      case 1: return 'P1 - Urgent'
      case 2: return 'P2 - High'
      case 3: return 'P3 - Medium'
      case 4: return 'P4 - Low'
      default: return 'No Priority'
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const isDateWarning = (todo: NoteTodo) => {
    return todo.end_date && !todo.start_date
  }

  const handleToggleTodo = async (todo: NoteTodo) => {
    try {
      // Check if this is a note-embedded todo (has line_number > 0 and valid note_path)
      if (todo.line_number > 0 && todo.note_path && todo.note_path.trim() !== '') {
        // This is a note-embedded todo - use toggle_note_todo
        await invoke('toggle_note_todo', {
          notePath: todo.note_path,
          lineNumber: todo.line_number,
          completed: !todo.completed
        })
      } else {
        // This is a standalone todo from todos.json - use update_todo
        // We need to find the list_id from the todo data
        const todoData = await invoke<{ lists: any[] }>('get_todos')
        let listId = null

        for (const list of todoData.lists) {
          const foundTodo = list.todos.find((t: any) => t.id === todo.id)
          if (foundTodo) {
            listId = list.id
            break
          }
        }

        if (listId) {
          await invoke('update_todo', {
            listId: listId,
            todoId: todo.id,
            text: null,
            completed: !todo.completed,
            dueDate: null,
            rootPath: rootPath
          })
        } else {
          console.error('Could not find list for todo:', todo.id)
        }
      }
      await loadTodos()
    } catch (error) {
      console.error('Failed to toggle todo:', error)
    }
  }

  const handleNoteClick = (todo: NoteTodo) => {
    if (onOpenFile && rootPath) {
      // Check if note_path is a full path or just a note name
      const isFullPath = todo.note_path.includes('/') || todo.note_path.includes('\\')

      let fullPath: string
      let fileName: string

      if (isFullPath) {
        // Already a full path (note-embedded todos)
        // Fix for .md.md issue: remove extra .md extensions
        fullPath = todo.note_path.replace(/\.md\.md$/, '.md')
        fileName = fullPath.split(/[\\/]/).pop() || ''
      } else {
        // Just a note name (standalone todos with linked note)
        // Remove .md extension if present, then add it back
        const noteName = todo.note_path.replace(/\.md$/, '')
        fullPath = `${rootPath}/${noteName}.md`
        fileName = `${noteName}.md`
      }

      onOpenFile(fullPath, fileName)
    }
  }

  const confirmDelete = (todo: NoteTodo) => {
    setDeleteConfirmation({ show: true, todo })
  }

  const handleDeleteTodo = async () => {
    const todo = deleteConfirmation.todo
    if (!todo) return

    setDeleteConfirmation({ show: false, todo: null })

    try {
      // Check if this is a note-based todo (has a line_number > 0)
      if (todo.line_number > 0 && todo.note_path) {
        // Read the note file
        const content = await invoke<string>('read_file', { filePath: todo.note_path })
        const lines = content.split('\n')

        // Remove the line at line_number (convert 1-indexed to 0-indexed)
        lines.splice(todo.line_number - 1, 1)

        // Write back to file
        const newContent = lines.join('\n')
        await invoke('write_file', { filePath: todo.note_path, content: newContent })
      } else {
        // This is a standalone todo from todos.json
        // Extract list_id from the todo id or search for it
        const todoData = await invoke<{ lists: any[] }>('get_todos')
        for (const list of todoData.lists) {
          const foundTodo = list.todos.find((t: any) => t.id === todo.id)
          if (foundTodo) {
            await invoke('delete_todo', {
              listId: list.id,
              todoId: todo.id
            })
            break
          }
        }
      }

      // Reload todos
      await loadTodos()
    } catch (error) {
      console.error('Failed to delete todo:', error)
      setErrorMessage({ show: true, message: 'Failed to delete todo. Please try again.' })
    }
  }

  const handleEditTodoSave = async (updatedTodo: NoteTodo) => {
    try {
      // Check if this is a note-embedded todo
      if (updatedTodo.line_number > 0 && updatedTodo.note_path && updatedTodo.note_path.trim() !== '') {
        // For note-embedded todos, we need to update the line in the note file
        const content = await invoke<string>('read_file', { filePath: updatedTodo.note_path })
        const lines = content.split('\n')

        if (updatedTodo.line_number <= lines.length) {
          // Build updated todo line with metadata
          let metadata_parts = []
          if (updatedTodo.priority) {
            metadata_parts.push(`priority: ${updatedTodo.priority}`)
          }
          if (updatedTodo.start_date) {
            metadata_parts.push(`start: ${updatedTodo.start_date.split('T')[0]}`)
          }
          if (updatedTodo.end_date) {
            metadata_parts.push(`end: ${updatedTodo.end_date.split('T')[0]}`)
          }
          if (updatedTodo.description) {
            const escaped_desc = updatedTodo.description.replace(/"/g, '\\"')
            metadata_parts.push(`desc: "${escaped_desc}"`)
          }

          const checkbox = updatedTodo.completed ? '- [x]' : '- [ ]'
          const todo_line = metadata_parts.length > 0
            ? `${checkbox} ${updatedTodo.title} {${metadata_parts.join(', ')}}`
            : `${checkbox} ${updatedTodo.title}`

          // Update the line (1-indexed to 0-indexed)
          lines[updatedTodo.line_number - 1] = todo_line

          // Write back to file
          const newContent = lines.join('\n')
          await invoke('write_file', { filePath: updatedTodo.note_path, content: newContent })
        }
      } else {
        // This is a standalone todo from todos.json - use update_todo
        const todoData = await invoke<{ lists: any[] }>('get_todos')
        let listId = null

        for (const list of todoData.lists) {
          const foundTodo = list.todos.find((t: any) => t.id === updatedTodo.id)
          if (foundTodo) {
            listId = list.id
            break
          }
        }

        if (listId) {
          await invoke('update_todo', {
            listId: listId,
            todoId: updatedTodo.id,
            text: updatedTodo.title,
            completed: updatedTodo.completed,
            dueDate: updatedTodo.end_date,
            rootPath: rootPath,
            priority: updatedTodo.priority || null,
            startDate: updatedTodo.start_date || null,
            description: updatedTodo.description || null
          })
        }
      }

      await loadTodos()
    } catch (error) {
      console.error('Failed to update todo:', error)
      setErrorMessage({ show: true, message: 'Failed to update todo. Please try again.' })
    }
  }

  const handleQuickAddSubmit = async (data: TodoFormData) => {
    try {
      console.log('📝 Submitting todo:', data)

      // Get current todos to find or create a list
      const todoData = await invoke<{ lists: Array<{ id: string; name: string }> }>('get_todos')

      let listId = todoData.lists[0]?.id

      // If no lists exist, create a default one
      if (!listId) {
        console.log('⚠️ No lists found, creating default list')
        const newList = await invoke<{ id: string }>('add_todo_list', {
          name: 'Quick Todos',
          icon: '📝'
        })
        listId = newList.id
      }

      console.log('📋 Using list ID:', listId)

      // Use add_unified_todo with proper parameters
      // For FAB-created todos: noteName=null (don't write to file), linkedNote=selected note (just reference)
      await invoke('add_unified_todo', {
        listId: listId,
        text: data.text,
        priority: data.priority,
        startDate: data.startDate,
        endDate: data.endDate,
        rootPath: rootPath,
        noteName: null, // Don't write to note from FAB button
        description: data.description,
        linkedNote: data.linkedNoteName // Pass the linked note for reference
      })

      console.log('✅ Todo created successfully')
      await loadTodos()
      setShowQuickAddModal(false)
    } catch (error) {
      console.error('❌ Failed to add todo:', error)
    }
  }

  const sortTodos = (todoList: NoteTodo[]): { [key: string]: NoteTodo[] } => {
    if (sortMode === 'priority') {
      // Create groups for each priority level
      const grouped: { [key: string]: NoteTodo[] } = {
        'Priority 1': [],
        'Priority 2': [],
        'Priority 3': [],
        'Priority 4': [],
        'No Priority': []
      }

      todoList.forEach(todo => {
        const priority = todo.priority || 0
        const key = priority === 0 ? 'No Priority' : `Priority ${priority}`
        grouped[key].push(todo)
      })

      // Remove empty groups and return in correct order (P1 first, most urgent)
      const orderedGroups: { [key: string]: NoteTodo[] } = {}
      const priorityOrder = ['Priority 1', 'Priority 2', 'Priority 3', 'Priority 4', 'No Priority']

      priorityOrder.forEach(key => {
        if (grouped[key] && grouped[key].length > 0) {
          orderedGroups[key] = grouped[key]
        }
      })

      return orderedGroups
    } else if (sortMode === 'note') {
      const grouped: { [key: string]: NoteTodo[] } = {}

      todoList.forEach(todo => {
        let noteName: string
        if (!todo.note_path || todo.note_path.trim() === '') {
          noteName = 'No note'
        } else {
          noteName = todo.note_path.split(/[\\/]/).pop()?.replace('.md', '') || 'No note'
        }
        if (!grouped[noteName]) grouped[noteName] = []
        grouped[noteName].push(todo)
      })

      return grouped
    } else {
      // Sort by actual date - group by exact date
      const grouped: { [key: string]: NoteTodo[] } = {}

      // First, sort all todos by date
      const sortedTodos = [...todoList].sort((a, b) => {
        if (!a.end_date && !b.end_date) return 0
        if (!a.end_date) return 1 // No date goes to end
        if (!b.end_date) return -1
        return new Date(a.end_date).getTime() - new Date(b.end_date).getTime()
      })

      // Group by formatted date
      sortedTodos.forEach(todo => {
        let dateKey: string
        if (!todo.end_date) {
          dateKey = 'No Date'
        } else {
          const endDate = new Date(todo.end_date)
          // Format as "Oct 24" or "Nov 5"
          dateKey = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }

        if (!grouped[dateKey]) {
          grouped[dateKey] = []
        }
        grouped[dateKey].push(todo)
      })

      return grouped
    }
  }

  const displayTodos = viewMode === 'active' ? todos.active : todos.archived
  const groupedTodos = sortTodos(displayTodos)

  if (loading) {
    return (
      <div className="note-todos-container">
        <div className="loading-state">Loading todos...</div>
      </div>
    )
  }

  return (
    <div className="note-todos-container">
      {/* Quick Add Modal */}
      <QuickAddModal
        isOpen={showQuickAddModal}
        onClose={() => setShowQuickAddModal(false)}
        onSubmit={handleQuickAddSubmit}
        rootPath={rootPath}
      />

      {/* Edit Todo Modal */}
      <EditTodoModal
        isOpen={editingTodo !== null}
        onClose={() => setEditingTodo(null)}
        onSave={handleEditTodoSave}
        todo={editingTodo}
        rootPath={rootPath}
      />

      {/* Floating Action Button */}
      <button
        className="fab-add-todo"
        onClick={() => setShowQuickAddModal(true)}
        title="Quick add todo"
      >
        <PlusIcon className="icon-medium" />
      </button>

      {/* Header */}
      <div className="note-todos-header">
        <div className="header-title">
          <ClipboardDocumentListIcon className="header-icon" />
          <h2>Todos</h2>
        </div>
        <div className="header-controls">
          <button
            className="filter-btn"
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            title="Filter todos"
          >
            <FunnelIcon className="icon-small" />
          </button>
          {showFilterMenu && (
            <div className="filter-dropdown">
              <button
                className={`filter-option ${sortMode === 'date' ? 'active' : ''}`}
                onClick={() => {
                  setSortMode('date')
                  setShowFilterMenu(false)
                }}
              >
                Date
              </button>
              <button
                className={`filter-option ${sortMode === 'priority' ? 'active' : ''}`}
                onClick={() => {
                  setSortMode('priority')
                  setShowFilterMenu(false)
                }}
              >
                Priority
              </button>
              <button
                className={`filter-option ${sortMode === 'note' ? 'active' : ''}`}
                onClick={() => {
                  setSortMode('note')
                  setShowFilterMenu(false)
                }}
              >
                By Note
              </button>
            </div>
          )}
          <button
            className={`archive-btn ${viewMode === 'archive' ? 'active' : ''}`}
            onClick={() => setViewMode(viewMode === 'active' ? 'archive' : 'active')}
            title={viewMode === 'active' ? `View archive (${todos.archived.length})` : 'Back to active todos'}
          >
            {viewMode === 'active' ? (
              <>
                <ArchiveBoxIcon className="icon-small" />
                {todos.archived.length > 0 && (
                  <span className="archive-count">{todos.archived.length}</span>
                )}
              </>
            ) : (
              <ArrowLeftIcon className="icon-small" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="note-todos-content">
        {Object.keys(groupedTodos).length === 0 ? (
          <div className="empty-state">
            <p>{viewMode === 'active' ? 'No active todos' : 'No archived todos'}</p>
            <p className="empty-hint">
              {viewMode === 'active'
                ? 'Add todos to your notes using checkboxes with metadata'
                : 'Completed todos will appear here'}
            </p>
          </div>
        ) : (
          Object.entries(groupedTodos).map(([groupName, todoList]) => (
            <div key={groupName} className="todo-group">
              <div className="group-header">
                <h3>{groupName}</h3>
                <span className="group-count">{todoList.length} {todoList.length === 1 ? 'task' : 'tasks'}</span>
              </div>

              <div className="todo-items">
                {todoList.map(todo => (
                  <div key={todo.id} className="note-todo-item-wrapper">
                    <div className="note-todo-item">
                      <button
                        className="todo-checkbox"
                        onClick={() => handleToggleTodo(todo)}
                        style={{ borderColor: getPriorityColor(todo.priority) }}
                      >
                        {todo.completed && <span>✓</span>}
                      </button>

                      <div className="todo-content">
                        <div className="todo-title-row">
                          <span className="todo-title">{todo.title}</span>
                          {todo.priority && (
                            <span
                              className="priority-flag"
                              style={{ color: getPriorityColor(todo.priority) }}
                              title={getPriorityLabel(todo.priority)}
                            >
                              ⚑
                            </span>
                          )}
                        </div>

                        {todo.description && (
                          <div className="todo-description">
                            {expandedDescriptions.has(todo.id) || todo.description.length <= 150 ? (
                              <>
                                {todo.description}
                                {todo.description.length > 150 && (
                                  <button
                                    className="description-toggle-btn"
                                    onClick={() => {
                                      const newExpanded = new Set(expandedDescriptions)
                                      newExpanded.delete(todo.id)
                                      setExpandedDescriptions(newExpanded)
                                    }}
                                  >
                                    Show less
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                {todo.description.slice(0, 150)}...
                                <button
                                  className="description-toggle-btn"
                                  onClick={() => {
                                    const newExpanded = new Set(expandedDescriptions)
                                    newExpanded.add(todo.id)
                                    setExpandedDescriptions(newExpanded)
                                  }}
                                >
                                  Read more
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Meta information with dates and actions */}
                    <div className="todo-meta">
                      <div className="todo-meta-left">
                        {/* Show note link if there's an actual note path and it's not the default "Quick Todos" */}
                        {todo.note_path && todo.note_path.trim() !== '' && !todo.note_path.includes('Quick Todos') && (() => {
                          const filename = todo.note_path.split(/[\\/]/).pop();
                          // Remove all .md extensions (handles .md.md cases) by chaining replace
                          const withoutExtension = filename?.replace(/\.md$/, '').replace(/\.md$/, '');
                          return (
                            <div className="todo-note-link-wrapper">
                              <button
                                className="note-link"
                                onClick={() => handleNoteClick(todo)}
                              >
                                [[{withoutExtension}]]
                              </button>
                            </div>
                          );
                        })()}

                        <div className="todo-dates">
                          <div className="date-badge">
                            <CalendarIcon className="date-icon" />
                            <span className="date-label">Start:</span>
                            <span className="date-value">{todo.start_date ? formatDate(todo.start_date) : 'Not set'}</span>
                          </div>
                          <div className="date-badge">
                            <CalendarIcon className="date-icon" />
                            <span className="date-label">End:</span>
                            <span className="date-value">{todo.end_date ? formatDate(todo.end_date) : 'Not set'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="todo-actions">
                        <button
                          className="todo-edit-btn"
                          onClick={() => setEditingTodo(todo)}
                          title="Edit todo"
                        >
                          <PencilIcon className="icon-small" />
                        </button>
                        <button
                          className="todo-delete-btn"
                          onClick={() => confirmDelete(todo)}
                          title="Delete todo"
                        >
                          <TrashIcon className="icon-small" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmation.show && deleteConfirmation.todo && (
        <div className="delete-modal-overlay">
          <div className="delete-modal">
            <div className="delete-modal-header">
              <h3>Delete Todo</h3>
            </div>
            <div className="delete-modal-body">
              <p>Are you sure you want to delete "{deleteConfirmation.todo.title}"?</p>
              <p className="delete-modal-hint">This action cannot be undone.</p>
            </div>
            <div className="delete-modal-footer">
              <button
                className="delete-modal-cancel"
                onClick={() => setDeleteConfirmation({ show: false, todo: null })}
              >
                Cancel
              </button>
              <button
                className="delete-modal-confirm"
                onClick={handleDeleteTodo}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Message Modal */}
      {errorMessage.show && (
        <div className="delete-modal-overlay">
          <div className="delete-modal">
            <div className="delete-modal-header">
              <h3>Error</h3>
            </div>
            <div className="delete-modal-body">
              <p>{errorMessage.message}</p>
            </div>
            <div className="delete-modal-footer">
              <button
                className="modal-btn-primary"
                onClick={() => setErrorMessage({ show: false, message: '' })}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default NoteTodosView
