import React, { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { XMarkIcon, PlusIcon, CheckIcon, TrashIcon, CalendarIcon } from '@heroicons/react/24/outline'
import './TodoPanel.css'
import QuickAddModal, { TodoFormData } from './QuickAddModal'

type ViewMode = 'list' | 'timeline'

interface Todo {
  id: string
  text: string
  completed: boolean
  dueDate?: string
  createdAt: string
  linkedNote?: string
  listId?: string
}

interface TodoList {
  id: string
  name: string
  icon: string
  todos: Todo[]
}

interface TodoData {
  lists: TodoList[]
}

interface TodoPanelProps {
  initialView?: ViewMode
  rootPath?: string
}

const TodoPanel: React.FC<TodoPanelProps> = ({ initialView = 'list', rootPath }) => {
  const viewMode = initialView
  const [todoData, setTodoData] = useState<TodoData>({ lists: [] })
  const [newTodoText, setNewTodoText] = useState('')
  const [newListName, setNewListName] = useState('')
  const [showNewListForm, setShowNewListForm] = useState(false)
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showQuickAddModal, setShowQuickAddModal] = useState(false)

  // Load todos on mount
  useEffect(() => {
    loadTodos()
  }, [])

  const loadTodos = async () => {
    try {
      const data = await invoke<TodoData>('get_todos')
      setTodoData(data)

      // Set first list as active if no active list
      if (!activeListId && data.lists.length > 0) {
        setActiveListId(data.lists[0].id)
      }
    } catch (error) {
      console.error('Failed to load todos:', error)
    }
  }

  const handleAddList = async () => {
    if (!newListName.trim()) return

    try {
      const newList = await invoke<TodoList>('add_todo_list', {
        name: newListName,
        icon: '📋'
      })

      await loadTodos()
      setActiveListId(newList.id)
      setNewListName('')
      setShowNewListForm(false)
    } catch (error) {
      console.error('Failed to add list:', error)
    }
  }

  const handleAddTodo = async (listId: string) => {
    if (!newTodoText.trim()) return

    try {
      await invoke('add_todo', {
        listId,
        text: newTodoText,
        dueDate: selectedDate,
        linkedNote: null
      })

      await loadTodos()
      setNewTodoText('')
      setSelectedDate(null)
    } catch (error) {
      console.error('Failed to add todo:', error)
    }
  }

  const handleToggleTodo = async (listId: string, todoId: string, completed: boolean) => {
    try {
      await invoke('update_todo', {
        listId,
        todoId,
        text: null,
        completed: !completed,
        dueDate: null,
        rootPath: rootPath || null
      })

      await loadTodos()
    } catch (error) {
      console.error('Failed to toggle todo:', error)
    }
  }

  const handleDeleteTodo = async (listId: string, todoId: string) => {
    try {
      await invoke('delete_todo', {
        listId,
        todoId
      })

      await loadTodos()
    } catch (error) {
      console.error('Failed to delete todo:', error)
    }
  }

  const getTodoCount = (listId: string) => {
    const list = todoData.lists.find(l => l.id === listId)
    if (!list) return 0
    return list.todos.filter(t => !t.completed).length
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return null
    const date = new Date(dateString)
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === now.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow'
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
  }

  // Get all todos with due dates, grouped by date
  const getTodosByDate = () => {
    const todosByDate: Record<string, Array<Todo & { listName: string; listIcon: string }>> = {}

    todoData.lists.forEach(list => {
      list.todos.forEach(todo => {
        if (todo.dueDate) {
          const dateKey = new Date(todo.dueDate).toDateString()
          if (!todosByDate[dateKey]) {
            todosByDate[dateKey] = []
          }
          todosByDate[dateKey].push({
            ...todo,
            listName: list.name,
            listIcon: list.icon
          })
        }
      })
    })

    return todosByDate
  }

  // Get sorted date keys (past, today, future)
  const getSortedDateKeys = (todosByDate: Record<string, any[]>) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    return Object.keys(todosByDate).sort((a, b) => {
      return new Date(a).getTime() - new Date(b).getTime()
    })
  }

  const handleAddTodoWithDate = async (dueDate: string) => {
    if (!newTodoText.trim()) return
    if (!activeListId) {
      // If no list selected, create a default "Quick Todos" list
      const quickList = todoData.lists.find(l => l.name === 'Quick Todos')
      if (quickList) {
        await handleAddTodoToList(quickList.id, dueDate)
      } else {
        const newList = await invoke<TodoList>('add_todo_list', {
          name: 'Quick Todos',
          icon: '⚡'
        })
        await loadTodos()
        await handleAddTodoToList(newList.id, dueDate)
      }
    } else {
      await handleAddTodoToList(activeListId, dueDate)
    }
  }

  const handleAddTodoToList = async (listId: string, dueDate?: string) => {
    if (!newTodoText.trim()) return

    try {
      await invoke('add_todo', {
        listId,
        text: newTodoText,
        dueDate: dueDate || null,
        linkedNote: null
      })

      await loadTodos()
      setNewTodoText('')
    } catch (error) {
      console.error('Failed to add todo:', error)
    }
  }

  const handleQuickAddSubmit = async (data: TodoFormData) => {
    try {
      if (!rootPath) {
        // Fallback to regular todo if no root path
        await invoke('add_todo', {
          listId: data.listId,
          text: data.text,
          dueDate: data.endDate,
          linkedNote: data.noteName
        })
      } else {
        // Use unified todo creation (writes to both systems)
        await invoke('add_unified_todo', {
          listId: data.listId,
          text: data.text,
          priority: data.priority,
          startDate: data.startDate,
          endDate: data.endDate,
          rootPath: rootPath,
          noteName: data.noteName
        })
      }

      await loadTodos()
      setShowQuickAddModal(false)
    } catch (error) {
      console.error('Failed to add unified todo:', error)
    }
  }

  const todosByDate = getTodosByDate()
  const sortedDateKeys = getSortedDateKeys(todosByDate)

  return (
    <div className="todo-panel-container">
        {/* Quick Add Modal */}
        <QuickAddModal
          isOpen={showQuickAddModal}
          onClose={() => setShowQuickAddModal(false)}
          onSubmit={handleQuickAddSubmit}
          lists={todoData.lists}
          activeListId={activeListId}
        />

        {/* Floating Action Button */}
        {rootPath && (
          <button
            className="fab-add-todo"
            onClick={() => setShowQuickAddModal(true)}
            title="Quick add todo"
          >
            <PlusIcon className="icon-medium" />
          </button>
        )}

        {/* Content Area */}
        <div className="todo-panel-content">
          {viewMode === 'list' && (
          <div className="todo-lists-sidebar">
            <div className="todo-lists-header">
              <h3>Lists</h3>
              <button
                className="new-list-button"
                onClick={() => setShowNewListForm(!showNewListForm)}
              >
                <PlusIcon className="icon-small" />
              </button>
            </div>

            {showNewListForm && (
              <div className="new-list-form">
                <input
                  type="text"
                  placeholder="List name"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddList()
                    if (e.key === 'Escape') setShowNewListForm(false)
                  }}
                  autoFocus
                />
              </div>
            )}

            {todoData.lists.map(list => (
              <div
                key={list.id}
                className={`todo-list-item ${activeListId === list.id ? 'active' : ''}`}
                onClick={() => setActiveListId(list.id)}
              >
                <span className="list-name">{list.name}</span>
                <span className="list-count">{getTodoCount(list.id)}</span>
              </div>
            ))}
          </div>
          )}

          {viewMode === 'list' && (
          <div className="todo-main-area">
            {activeListId && todoData.lists.find(l => l.id === activeListId) ? (
              <>
                <div className="todo-list-header">
                  <h3>
                    {todoData.lists.find(l => l.id === activeListId)?.name}
                  </h3>
                </div>

                {/* Add todo input */}
                <div className="add-todo-section">
                  <div className="add-todo-input-wrapper">
                    <input
                      type="text"
                      placeholder="+ New task"
                      value={newTodoText}
                      onChange={(e) => setNewTodoText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddTodo(activeListId)
                      }}
                    />
                    <div className="add-todo-actions">
                      {selectedDate && (
                        <span className="selected-date-badge">
                          {formatDate(selectedDate)}
                          <button
                            className="clear-date-btn"
                            onClick={() => setSelectedDate(null)}
                          >
                            <XMarkIcon className="icon-tiny" />
                          </button>
                        </span>
                      )}
                      <button
                        className={`date-picker-toggle ${showDatePicker ? 'active' : ''}`}
                        onClick={() => setShowDatePicker(!showDatePicker)}
                      >
                        <CalendarIcon className="icon-small" />
                      </button>
                    </div>
                  </div>
                  {showDatePicker && (
                    <div className="date-picker-dropdown">
                      <button
                        className="date-option"
                        onClick={() => {
                          const today = new Date()
                          setSelectedDate(today.toISOString())
                          setShowDatePicker(false)
                        }}
                      >
                        Today
                      </button>
                      <button
                        className="date-option"
                        onClick={() => {
                          const tomorrow = new Date()
                          tomorrow.setDate(tomorrow.getDate() + 1)
                          setSelectedDate(tomorrow.toISOString())
                          setShowDatePicker(false)
                        }}
                      >
                        Tomorrow
                      </button>
                      <button
                        className="date-option"
                        onClick={() => {
                          const nextWeek = new Date()
                          nextWeek.setDate(nextWeek.getDate() + 7)
                          setSelectedDate(nextWeek.toISOString())
                          setShowDatePicker(false)
                        }}
                      >
                        Next Week
                      </button>
                      <div className="date-picker-divider"></div>
                      <input
                        type="date"
                        className="custom-date-input"
                        onChange={(e) => {
                          if (e.target.value) {
                            setSelectedDate(new Date(e.target.value).toISOString())
                            setShowDatePicker(false)
                          }
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Todo items */}
                <div className="todo-items">
                  {todoData.lists
                    .find(l => l.id === activeListId)
                    ?.todos.map(todo => (
                      <div key={todo.id} className={`todo-item ${todo.completed ? 'completed' : ''}`}>
                        <button
                          className="todo-checkbox"
                          onClick={() => handleToggleTodo(activeListId, todo.id, todo.completed)}
                        >
                          {todo.completed && <CheckIcon className="icon-small" />}
                        </button>
                        <span className="todo-text">{todo.text}</span>
                        {todo.dueDate && (
                          <span className="todo-due-date">{formatDate(todo.dueDate)}</span>
                        )}
                        <button
                          className="todo-delete"
                          onClick={() => handleDeleteTodo(activeListId, todo.id)}
                        >
                          <TrashIcon className="icon-small" />
                        </button>
                      </div>
                    ))}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <p>Create a new list to get started</p>
              </div>
            )}
          </div>
          )}

          {/* Timeline View */}
          {viewMode === 'timeline' && (
            <div className="timeline-view">
              <div className="timeline-header">
                <h3 className="timeline-title">
                  <CalendarIcon className="timeline-title-icon" />
                  Timeline
                </h3>
                <input
                  type="text"
                  placeholder="+ Add todo with date..."
                  value={newTodoText}
                  onChange={(e) => setNewTodoText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && selectedDate) {
                      handleAddTodoWithDate(selectedDate)
                    }
                  }}
                  className="timeline-add-input"
                />
              </div>

              <div className="timeline-content">
                {sortedDateKeys.length === 0 ? (
                  <div className="empty-state">
                    <CalendarIcon className="empty-icon" />
                    <p>No scheduled todos</p>
                    <p className="empty-hint">Add due dates to your todos to see them here</p>
                  </div>
                ) : (
                  sortedDateKeys.map(dateKey => {
                    const date = new Date(dateKey)
                    const now = new Date()
                    const isPast = date < new Date(now.getFullYear(), now.getMonth(), now.getDate())
                    const isToday = date.toDateString() === now.toDateString()

                    return (
                      <div key={dateKey} className={`date-group ${isPast ? 'past' : ''} ${isToday ? 'today' : ''}`}>
                        <div className="date-header">
                          <h4>{formatDate(todosByDate[dateKey][0].dueDate) || date.toLocaleDateString()}</h4>
                          <span className="date-count">{todosByDate[dateKey].length} todos</span>
                        </div>

                        <div className="date-todos">
                          {todosByDate[dateKey].map(todo => {
                            const listId = todo.listId || ''
                            return (
                              <div key={todo.id} className={`timeline-todo ${todo.completed ? 'completed' : ''}`}>
                                <button
                                  className="todo-checkbox"
                                  onClick={() => handleToggleTodo(listId, todo.id, todo.completed)}
                                >
                                  {todo.completed && <CheckIcon className="icon-small" />}
                                </button>
                                <div className="todo-info">
                                  <span className="todo-text">{todo.text}</span>
                                  <span className="todo-list-badge">
                                    {todo.listIcon} {todo.listName}
                                  </span>
                                </div>
                                <button
                                  className="todo-delete"
                                  onClick={() => handleDeleteTodo(listId, todo.id)}
                                >
                                  <TrashIcon className="icon-small" />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
    </div>
  )
}

export default TodoPanel
