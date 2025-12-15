/**
 * CreatePollModal - Modal for creating polls in chat
 */

import { useState } from 'react';
import { X, Plus, Trash2, BarChart2 } from 'lucide-react';
import './CreatePollModal.css';

interface CreatePollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreatePoll: (question: string, options: string[], allowMultiple: boolean) => Promise<void>;
}

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

export default function CreatePollModal({
  isOpen,
  onClose,
  onCreatePoll,
}: CreatePollModalProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddOption = () => {
    if (options.length < MAX_OPTIONS) {
      setOptions([...options, '']);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > MIN_OPTIONS) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const validatePoll = (): string | null => {
    if (!question.trim()) {
      return 'Please enter a question';
    }

    const filledOptions = options.filter(opt => opt.trim());
    if (filledOptions.length < MIN_OPTIONS) {
      return `Please provide at least ${MIN_OPTIONS} options`;
    }

    const uniqueOptions = new Set(filledOptions.map(opt => opt.trim().toLowerCase()));
    if (uniqueOptions.size !== filledOptions.length) {
      return 'Options must be unique';
    }

    return null;
  };

  const handleCreate = async () => {
    const validationError = validatePoll();
    if (validationError) {
      setError(validationError);
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const filledOptions = options.filter(opt => opt.trim()).map(opt => opt.trim());
      await onCreatePoll(question.trim(), filledOptions, allowMultiple);
      handleClose();
    } catch (err) {
      console.error('Failed to create poll:', err);
      setError('Failed to create poll. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setQuestion('');
    setOptions(['', '']);
    setAllowMultiple(false);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="create-poll-overlay" onClick={handleClose}>
      <div className="create-poll-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-title">
            <BarChart2 size={20} />
            <h3>Create Poll</h3>
          </div>
          <button className="close-btn" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Question input */}
          <div className="form-group">
            <label>Question</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question..."
              disabled={creating}
              maxLength={200}
            />
          </div>

          {/* Options */}
          <div className="form-group">
            <label>Options</label>
            <div className="options-list">
              {options.map((option, index) => (
                <div key={index} className="option-row">
                  <span className="option-number">{index + 1}</span>
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    placeholder={`Option ${index + 1}`}
                    disabled={creating}
                    maxLength={100}
                  />
                  {options.length > MIN_OPTIONS && (
                    <button
                      className="remove-option-btn"
                      onClick={() => handleRemoveOption(index)}
                      disabled={creating}
                      title="Remove option"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < MAX_OPTIONS && (
              <button
                className="add-option-btn"
                onClick={handleAddOption}
                disabled={creating}
              >
                <Plus size={16} />
                Add Option
              </button>
            )}
          </div>

          {/* Settings */}
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={allowMultiple}
                onChange={(e) => setAllowMultiple(e.target.checked)}
                disabled={creating}
              />
              <span>Allow multiple selections</span>
            </label>
          </div>

          {/* Error message */}
          {error && (
            <div className="poll-error">
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={handleClose} disabled={creating}>
            Cancel
          </button>
          <button
            className="create-btn"
            onClick={handleCreate}
            disabled={creating || !question.trim()}
          >
            {creating ? (
              <>
                <span className="create-spinner" />
                Creating...
              </>
            ) : (
              <>
                <BarChart2 size={16} />
                Create Poll
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
