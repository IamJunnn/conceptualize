import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface AiChatResult {
  success: boolean;
  response?: string;
  error?: string;
}

interface Message {
  role: 'user' | 'assistant' | 'error';
  content: string;
}

interface AIChatProps {
  rootPath: string | null;
}

export default function AIChat({ rootPath }: AIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState({ current: 0, total: 0 });
  const [isIndexed, setIsIndexed] = useState(false);

  // Listen for indexing progress
  useEffect(() => {
    const unlisten = listen<{ total: number; current: number; file_path: string }>(
      'index-progress',
      (event) => {
        setIndexProgress({ current: event.payload.current, total: event.payload.total });
      }
    );

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const handleIndex = async () => {
    if (!rootPath) {
      setMessages(prev => [...prev, { role: 'error', content: 'No root path selected' }]);
      return;
    }

    setIsIndexing(true);
    setIndexProgress({ current: 0, total: 0 });

    try {
      const result = await invoke<string>('index_notes', { rootPath });
      setIsIndexed(true);
      setMessages(prev => [...prev, { role: 'assistant', content: `✅ ${result}` }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'error', content: `Failed to index notes: ${err}` }]);
    } finally {
      setIsIndexing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const userMessage = prompt;
    setPrompt(''); // Clear input immediately

    // Add user message to chat
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // Use RAG-powered chat if notes are indexed, otherwise use basic chat
      const command = isIndexed ? 'ai_chat_with_context' : 'ai_chat';
      const result = await invoke<AiChatResult>(command, { prompt: userMessage });

      if (result.success && result.response) {
        setMessages(prev => [...prev, { role: 'assistant', content: result.response! }]);
      } else {
        setMessages(prev => [...prev, { role: 'error', content: result.error || 'Unknown error' }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'error', content: `Failed to get AI response: ${err}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          border: 'none',
          color: 'white',
          fontSize: '24px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        title="Open AI Chat"
      >
        ✨
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '400px',
        height: '500px',
        background: '#1e1e1e',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '16px',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '20px' }}>✨</span>
          <h3 style={{ margin: 0, fontSize: '16px' }}>
            {isIndexed ? 'AI Assistant (RAG Enabled)' : 'AI Assistant'}
          </h3>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!isIndexing && !isIndexed && (
            <button
              onClick={handleIndex}
              style={{
                background: 'rgba(255,255,255,0.9)',
                border: 'none',
                color: '#667eea',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            >
              📚 Index Notes
            </button>
          )}
          {isIndexing && (
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.9)' }}>
              Indexing {indexProgress.current}/{indexProgress.total}...
            </div>
          )}
          {isIndexed && !isIndexing && (
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.9)' }}>
              ✅ Indexed
            </div>
          )}
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              width: '24px',
              height: '24px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Response Area */}
      <div
        style={{
          flex: 1,
          padding: '16px',
          overflowY: 'auto',
          color: '#e0e0e0',
          fontSize: '14px',
          lineHeight: '1.6',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {messages.length === 0 && !isLoading && (
          <div style={{ color: '#888', textAlign: 'center', marginTop: '40px' }}>
            <p>Ask me anything about your notes!</p>
            <p style={{ fontSize: '12px', marginTop: '8px' }}>
              (Make sure Ollama is running)
            </p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
            }}
          >
            {msg.role === 'user' && (
              <div
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  padding: '12px',
                  borderRadius: '12px',
                  borderBottomRightRadius: '4px',
                }}
              >
                {msg.content}
              </div>
            )}

            {msg.role === 'assistant' && (
              <div
                style={{
                  background: '#2d2d2d',
                  color: '#e0e0e0',
                  padding: '12px',
                  borderRadius: '12px',
                  borderBottomLeftRadius: '4px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {msg.content}
              </div>
            )}

            {msg.role === 'error' && (
              <div
                style={{
                  background: '#ff4444',
                  color: 'white',
                  padding: '12px',
                  borderRadius: '12px',
                }}
              >
                <strong>Error:</strong> {msg.content}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div style={{ color: '#888', textAlign: 'center', marginTop: '8px' }}>
            <div style={{ fontSize: '24px', marginBottom: '4px' }}>🤔</div>
            <p style={{ fontSize: '12px' }}>Thinking...</p>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '16px',
          borderTop: '1px solid #333',
          display: 'flex',
          gap: '8px',
        }}
      >
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask a question..."
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '12px',
            background: '#2d2d2d',
            border: '1px solid #444',
            borderRadius: '8px',
            color: '#e0e0e0',
            fontSize: '14px',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#667eea';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#444';
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          style={{
            padding: '12px 20px',
            background: isLoading || !prompt.trim() ? '#444' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            cursor: isLoading || !prompt.trim() ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
