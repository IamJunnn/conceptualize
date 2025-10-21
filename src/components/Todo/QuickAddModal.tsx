import React, { useState, useEffect } from 'react'
import { XMarkIcon, CalendarIcon, FlagIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import './QuickAddModal.css'

interface QuickAddModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: TodoFormData) => void
  lists: { id: string; name: string; icon: string }[]
  activeListId: string | null
}

export interface TodoFormData {
  text: string
  priority: number | null
  startDate: string | null
  endDate: string | null
  listId: string
  noteName: string | null
}

const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  lists,
  activeListId
}) => {
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<number | null>(null)
  const [startDate, setStartDate] = useState<string | null>(null)
  const [endDate, setEndDate] = useState<string | null>(null)
  const [selectedListId, setSelectedListId] = useState<string>(activeListId || '')
  const [noteName, setNoteName] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    if (activeListId) {
      setSelectedListId(activeListId)
    }
  }, [activeListId])

  useEffect(() => {
    if (isOpen) {
      // Reset form when modal opens
      setText('')
      setPriority(null)
      setStartDate(null)
      setEndDate(null)
      setNoteName(null)
      setShowAdvanced(false)
      if (activeListId) {
        setSelectedListId(activeListId)
      }
    }
  }, [isOpen, activeListId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || !selectedListId) return

    onSubmit({
      text: text.trim(),
      priority,
      startDate,
      endDate,
      listId: selectedListId,
      noteName
    })

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

  const getPriorityLabel = (p: number) => {
    switch (p) {
      case 1: return 'P1 - Urgent'
      case 2: return 'P2 - High'
      case 3: return 'P3 - Medium'
      case 4: return 'P4 - Low'
      default: return 'No Priority'
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

  if (!isOpen) return null

  return (
    <div className="quick-add-modal-overlay" onClick={onClose}>
      <div className="quick-add-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Task</h3>
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

          {/* Quick Actions */}
          <div className="quick-actions">
            <button
              type="button"
              className={`action-btn ${endDate ? 'active' : ''}`}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <CalendarIcon className="icon-small" />
              {endDate ? new Date(endDate).toLocaleDateString() : 'Due date'}
            </button>

            <button
              type="button"
              className={`action-btn ${priority ? 'active' : ''}`}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <FlagIcon className="icon-small" style={{ color: priority ? getPriorityColor(priority) : undefined }} />
              {priority ? getPriorityLabel(priority) : 'Priority'}
            </button>

            <button
              type="button"
              className={`action-btn ${noteName ? 'active' : ''}`}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <DocumentTextIcon className="icon-small" />
              {noteName || 'Note'}
            </button>
          </div>

          {/* Advanced Options */}
          {showAdvanced && (
            <div className="advanced-options">
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
                  {priority && (
                    <button
                      type="button"
                      className="clear-btn"
                      onClick={() => setPriority(null)}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Date Selector */}
              <div className="form-section">
                <label>Due Date</label>
                <div className="date-quick-buttons">
                  <button type="button" onClick={() => handleQuickDate('today')}>Today</button>
                  <button type="button" onClick={() => handleQuickDate('tomorrow')}>Tomorrow</button>
                  <button type="button" onClick={() => handleQuickDate('next-week')}>Next Week</button>
                </div>
                <div className="date-inputs">
                  <div className="date-input-group">
                    <label>Start</label>
                    <input
                      type="date"
                      value={formatDateForInput(startDate)}
                      onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value).toISOString() : null)}
                    />
                  </div>
                  <div className="date-input-group">
                    <label>End</label>
                    <input
                      type="date"
                      value={formatDateForInput(endDate)}
                      onChange={(e) => setEndDate(e.target.value ? new Date(e.target.value).toISOString() : null)}
                    />
                  </div>
                </div>
              </div>

              {/* List Selector */}
              <div className="form-section">
                <label>List</label>
                <select
                  value={selectedListId}
                  onChange={(e) => setSelectedListId(e.target.value)}
                >
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.icon} {list.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Note Name */}
              <div className="form-section">
                <label>Save to Note (optional)</label>
                <input
                  type="text"
                  placeholder="Note name (e.g., Quick Todos)"
                  value={noteName || ''}
                  onChange={(e) => setNoteName(e.target.value || null)}
                />
                <small>Leave empty to use default "Quick Todos" note</small>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="modal-footer">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={!text.trim() || !selectedListId}>
              Add Task
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default QuickAddModal
