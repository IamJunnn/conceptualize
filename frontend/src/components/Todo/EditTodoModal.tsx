import React, { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import './QuickAddModal.css' // Reuse the same styles

interface NoteTodo {
  id: string
  title: string
  completed: boolean
  priority?: number
  start_date?: string
  end_date?: string
  note_path: string
  line_number: number
  created_at: string
  completed_at?: string
  description?: string
}

interface EditTodoModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (updatedTodo: NoteTodo) => void
  todo: NoteTodo | null
  rootPath: string
}

const EditTodoModal: React.FC<EditTodoModalProps> = ({
  isOpen,
  onClose,
  onSave,
  todo,
  rootPath: _rootPath
}) => {
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<number | null>(null)
  const [startDate, setStartDate] = useState<string | null>(null)
  const [endDate, setEndDate] = useState<string | null>(null)
  const [description, setDescription] = useState<string | null>(null)

  // Load todo data when modal opens
  useEffect(() => {
    if (isOpen && todo) {
      setText(todo.title)
      setPriority(todo.priority || null)
      setStartDate(todo.start_date || null)
      setEndDate(todo.end_date || null)
      setDescription(todo.description || null)
    }
  }, [isOpen, todo])

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || !todo) return

    const updatedTodo: NoteTodo = {
      ...todo,
      title: text.trim(),
      priority: priority || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      description: description || undefined
    }

    onSave(updatedTodo)
    onClose()
  }

  const getPriorityColor = (p: number) => {
    switch (p) {
      case 1: return '#e74c3c' // Red - Urgent
      case 2: return '#ff9800' // Orange - High
      case 3: return '#ffd700' // Yellow - Medium
      case 4: return '#ffffff' // White - Low
      default: return '#888'
    }
  }

  const formatDateForInput = (dateStr: string | null) => {
    if (!dateStr) return ''
    return dateStr.split('T')[0] // ISO date to YYYY-MM-DD
  }

  const handleQuickDate = (type: 'today' | 'tomorrow' | 'next-week') => {
    const now = new Date()
    let date = new Date()

    switch (type) {
      case 'today':
        date = now
        break
      case 'tomorrow':
        date.setDate(now.getDate() + 1)
        break
      case 'next-week':
        date.setDate(now.getDate() + 7)
        break
    }

    setEndDate(date.toISOString())
  }

  const isQuickDateActive = (type: 'today' | 'tomorrow' | 'next-week') => {
    if (!endDate) return false

    const selectedDate = new Date(endDate)
    const now = new Date()

    // Normalize to date only (ignore time)
    const normalizeDate = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const normalizedSelected = normalizeDate(selectedDate)
    const normalizedNow = normalizeDate(now)

    switch (type) {
      case 'today':
        return normalizedSelected.getTime() === normalizedNow.getTime()
      case 'tomorrow':
        const tomorrow = new Date(normalizedNow)
        tomorrow.setDate(tomorrow.getDate() + 1)
        return normalizedSelected.getTime() === tomorrow.getTime()
      case 'next-week':
        const nextWeek = new Date(normalizedNow)
        nextWeek.setDate(nextWeek.getDate() + 7)
        return normalizedSelected.getTime() === nextWeek.getTime()
      default:
        return false
    }
  }

  if (!isOpen || !todo) return null

  return (
    <div className="quick-add-modal-overlay">
      <div className="quick-add-modal">
        <div className="modal-header">
          <h3>Edit Task</h3>
          <button className="close-btn" onClick={onClose}>
            <XMarkIcon className="icon-small" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="text"
              className="task-input"
              placeholder="Task name"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          </div>

          {/* Options */}
          <div className="form-options">
            {/* Priority Selector */}
            <div className="form-section">
              <label>Priority</label>
              <div className="priority-buttons">
                {[1, 2, 3, 4].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`priority-btn ${priority === p ? 'active' : ''}`}
                    onClick={() => setPriority(priority === p ? null : p)}
                    style={{
                      borderColor: priority === p ? getPriorityColor(p) : undefined,
                      color: priority === p ? getPriorityColor(p) : undefined
                    }}
                  >
                    P{p}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Selector */}
            <div className="form-section">
              <label>Due Date</label>
              <div className="date-quick-buttons">
                <button
                  type="button"
                  className={isQuickDateActive('today') ? 'active' : ''}
                  onClick={() => handleQuickDate('today')}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={isQuickDateActive('tomorrow') ? 'active' : ''}
                  onClick={() => handleQuickDate('tomorrow')}
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  className={isQuickDateActive('next-week') ? 'active' : ''}
                  onClick={() => handleQuickDate('next-week')}
                >
                  Next Week
                </button>
              </div>
              <div className="date-inputs">
                <div className="date-input-group">
                  <label>Start</label>
                  <input
                    type="date"
                    value={formatDateForInput(startDate)}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value).toISOString() : null)}
                  />
                </div>
                <div className="date-input-group">
                  <label>End</label>
                  <input
                    type="date"
                    value={formatDateForInput(endDate)}
                    min={startDate ? formatDateForInput(startDate) : undefined}
                    onChange={(e) => setEndDate(e.target.value ? new Date(e.target.value).toISOString() : null)}
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="form-section">
              <label>Description (optional)</label>
              <textarea
                placeholder="Add notes or details..."
                value={description || ''}
                onChange={(e) => setDescription(e.target.value || null)}
                rows={3}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={!text.trim()}>
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditTodoModal
