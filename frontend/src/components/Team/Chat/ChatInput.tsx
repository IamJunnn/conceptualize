/**
 * ChatInput - Message composition and sending
 * Handles text input, sending, and basic formatting
 */

import { useState, useRef, KeyboardEvent } from 'react';
import { Send, Smile, Paperclip } from 'lucide-react';
import './ChatInput.css';

interface ChatInputProps {
  channelName: string;
  onSendMessage: (content: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({
  channelName,
  onSendMessage,
  disabled = false,
  placeholder,
}: ChatInputProps) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent || sending || disabled) return;

    setSending(true);
    try {
      await onSendMessage(trimmedContent);
      setContent('');

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);

    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  };

  const defaultPlaceholder = placeholder || `Message #${channelName}`;

  return (
    <div className="chat-input-container">
      <div className="chat-input-wrapper">
        {/* Main input area */}
        <div className="input-area">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={defaultPlaceholder}
            disabled={disabled || sending}
            className="message-input"
            rows={1}
          />

          {/* Action buttons */}
          <div className="input-actions">
            <button
              className="input-action-btn"
              title="Add emoji"
              disabled={disabled || sending}
              onClick={() => {
                // TODO: Implement emoji picker
                alert('Emoji picker coming soon!');
              }}
            >
              <Smile size={20} />
            </button>

            <button
              className="input-action-btn"
              title="Attach file (Pro feature)"
              disabled={disabled || sending}
              onClick={() => {
                // TODO: Implement file upload
                alert('File attachments coming soon!');
              }}
            >
              <Paperclip size={20} />
            </button>

            <button
              className="send-btn"
              onClick={handleSend}
              disabled={!content.trim() || sending || disabled}
              title="Send message (Enter)"
            >
              {sending ? (
                <div className="send-spinner" />
              ) : (
                <Send size={20} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Hint text */}
      <div className="input-hint">
        <span className="hint-text">
          Press <kbd>Enter</kbd> to send • <kbd>Shift+Enter</kbd> for new line
        </span>
      </div>
    </div>
  );
}
