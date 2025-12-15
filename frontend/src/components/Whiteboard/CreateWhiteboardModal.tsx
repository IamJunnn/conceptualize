/**
 * CreateWhiteboardModal Component
 * Modal for creating a new whiteboard
 */

import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import './CreateWhiteboardModal.css';

interface CreateWhiteboardModalProps {
  onClose: () => void;
  onCreate: (name: string) => void;
}

const CreateWhiteboardModal: React.FC<CreateWhiteboardModalProps> = ({
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter a whiteboard name');
      return;
    }

    if (trimmedName.length > 100) {
      setError('Name must be less than 100 characters');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      await onCreate(trimmedName);
    } catch (err) {
      setError('Failed to create whiteboard. Please try again.');
      setIsCreating(false);
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="create-whiteboard-modal-backdrop" onClick={handleBackdropClick}>
      <div className="create-whiteboard-modal">
        <div className="modal-header">
          <h2>Create New Whiteboard</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="whiteboard-name">Whiteboard Name</label>
              <input
                ref={inputRef}
                id="whiteboard-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                placeholder="e.g., Q1 Planning, Brainstorm Ideas"
                maxLength={100}
                disabled={isCreating}
              />
              {error && <span className="error-message">{error}</span>}
            </div>

            <div className="templates-hint">
              <span className="hint-icon">💡</span>
              <span>
                Start with a blank canvas. Drag notes from your file tree to add them to the whiteboard.
              </span>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="cancel-btn"
              onClick={onClose}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="create-btn"
              disabled={isCreating || !name.trim()}
            >
              {isCreating ? 'Creating...' : 'Create Whiteboard'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateWhiteboardModal;
