import React, { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { PlusIcon } from '@heroicons/react/24/outline'
import './NoteTodosView.css'
import QuickAddModal, { TodoFormData } from './QuickAddModal'

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
  const [todoLists, setTodoLists] = useState<{ id: string; name: string; icon: string }[]>([])

  useEffect(() => {
    loadTodos()
    loadTodoLists()
  }, [rootPath])

  const loadTodoLists = async () => {
    try {
      const data = await invoke<{ lists: { id: string; name: string; icon: string }[] }>('get_todos')
      setTodoLists(data.lists)
    } catch (error) {
      console.error('Failed to load todo lists:', error)
    }
  }

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
      await invoke('toggle_note_todo', {
        notePath: todo.note_path,
        lineNumber: todo.line_number,
        completed: !todo.completed
      })
      await loadTodos()
    } catch (error) {
      console.error('Failed to toggle todo:', error)
    }
  }

  const handleNoteClick = (todo: NoteTodo) => {
    if (onOpenFile) {
      const fileName = todo.note_path.split(/[\\/]/).pop() || ''
      onOpenFile(todo.note_path, fileName)
    }
  }

  const handleQuickAddSubmit = async (data: TodoFormData) => {
    try {
      await invoke('add_unified_todo', {
        listId: data.listId,
        text: data.text,
        priority: data.priority,
        startDate: data.startDate,
        endDate: data.endDate,
        rootPath: rootPath,
        noteName: data.noteName
      })

      await loadTodos()
      setShowQuickAddModal(false)
    } catch (error) {
      console.error('Failed to add unified todo:', error)
    }
  }

  const sortTodos = (todoList: NoteTodo[]): { [key: string]: NoteTodo[] } => {
    if (sortMode === 'priority') {
      const grouped: { [key: string]: NoteTodo[] } = {}

      todoList.forEach(todo => {
        const priority = todo.priority || 0
        const key = priority === 0 ? 'No Priority' : `Priority ${priority}`
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(todo)
      })

      return grouped
    } else if (sortMode === 'note') {
      const grouped: { [key: string]: NoteTodo[] } = {}

      todoList.forEach(todo => {
        const noteName = todo.note_path.split(/[\\/]/).pop()?.replace('.md', '') || 'Unknown'
        if (!grouped[noteName]) grouped[noteName] = []
        grouped[noteName].push(todo)
      })

      return grouped
    } else {
      // Sort by date
      const grouped: { [key: string]: NoteTodo[] } = {
        'No Date': [],
        'Today': [],
        'Tomorrow': [],
        'This Week': [],
        'Later': []
      }

      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const weekEnd = new Date(today)
      weekEnd.setDate(weekEnd.getDate() + 7)

      todoList.forEach(todo => {
        if (!todo.end_date) {
          grouped['No Date'].push(todo)
        } else {
          const endDate = new Date(todo.end_date)
          if (endDate.toDateString() === today.toDateString()) {
            grouped['Today'].push(todo)
          } else if (endDate.toDateString() === tomorrow.toDateString()) {
            grouped['Tomorrow'].push(todo)
          } else if (endDate < weekEnd) {
            grouped['This Week'].push(todo)
          } else {
            grouped['Later'].push(todo)
          }
        }
      })

      // Remove empty groups
      Object.keys(grouped).forEach(key => {
        if (grouped[key].length === 0) delete grouped[key]
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
        lists={todoLists}
        activeListId={todoLists.length > 0 ? todoLists[0].id : null}
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
        <h2>📋 Todos</h2>
        <div className="header-controls">
          <button
            className={`sort-btn ${sortMode === 'date' ? 'active' : ''}`}
            onClick={() => setSortMode('date')}
          >
            Date
          </button>
          <button
            className={`sort-btn ${sortMode === 'priority' ? 'active' : ''}`}
            onClick={() => setSortMode('priority')}
          >
            Priority
          </button>
          <button
            className={`sort-btn ${sortMode === 'note' ? 'active' : ''}`}
            onClick={() => setSortMode('note')}
          >
            By Note
          </button>
          <button
            className="archive-btn"
            onClick={() => setViewMode(viewMode === 'active' ? 'archive' : 'active')}
          >
            {viewMode === 'active' ? `📦 Archive (${todos.archived.length})` : '← Back'}
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
                  <div key={todo.id} className="note-todo-item">
                    <button
                      className="todo-checkbox"
                      onClick={() => handleToggleTodo(todo)}
                      style={{ borderColor: getPriorityColor(todo.priority) }}
                    >
                      {todo.completed && <span>✓</span>}
                    </button>

                    <div className="todo-content">
                      <div className="todo-title-row">
                        {todo.priority && (
                          <span
                            className="priority-dot"
                            style={{ backgroundColor: getPriorityColor(todo.priority) }}
                            title={getPriorityLabel(todo.priority)}
                          />
                        )}
                        <span className="todo-title">{todo.title}</span>
                      </div>

                      <div className="todo-meta">
                        <button
                          className="note-link"
                          onClick={() => handleNoteClick(todo)}
                        >
                          [[{todo.note_path.split(/[\\/]/).pop()?.replace('.md', '')}]]
                        </button>

                        {(todo.start_date || todo.end_date) && (
                          <span className="todo-dates">
                            {isDateWarning(todo) && (
                              <span className="date-warning" title="Start date not set">⚠️</span>
                            )}
                            {todo.start_date && <span>📅 {formatDate(todo.start_date)}</span>}
                            {todo.start_date && todo.end_date && <span> → </span>}
                            {todo.end_date && <span>📅 {formatDate(todo.end_date)}</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default NoteTodosView
