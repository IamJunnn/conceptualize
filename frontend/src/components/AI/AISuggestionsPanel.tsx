import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Link2, Loader2, Check, ThumbsUp, AlertTriangle } from 'lucide-react';

interface SmartSuggestion {
  source_file: string;
  target_file: string;
  source_folder: string;
  target_folder: string;
  relationship: string;
  confidence: number;
  reason: string;
}

interface IdeaAnalysis {
  idea_file: string;
  tech_stack_matches: string[];
  advantages: string[];
  disadvantages: string[];
  complexity_score: number;
}

interface IndexStatus {
  indexed_files: number;
  total_chunks: number;
  needs_update: boolean;
}

interface IndexProgress {
  total: number;
  current: number;
  file_path: string;
  status: string;
}

interface AISuggestionsPanelProps {
  rootPath: string | null;
  onOpenFile: (filePath: string) => void;
}

export default function AISuggestionsPanel({ rootPath, onOpenFile }: AISuggestionsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [analysis, setAnalysis] = useState<IdeaAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<SmartSuggestion | null>(null);
  const [activeTab, setActiveTab] = useState<'suggestions' | 'analysis'>('suggestions');
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);

  // Auto-index on mount or when rootPath changes
  useEffect(() => {
    if (rootPath) {
      checkAndAutoIndex();
    }
  }, [rootPath]);

  // Listen for indexing progress
  useEffect(() => {
    const unlisten = listen<IndexProgress>('index-progress', (event) => {
      setIndexProgress(event.payload);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const checkAndAutoIndex = async () => {
    if (!rootPath) return;

    try {
      const status = await invoke<IndexStatus>('get_index_status');
      setIndexStatus(status);

      // Auto-index if needed
      if (status.needs_update || status.indexed_files === 0) {
        await startAutoIndex();
      } else {
        // Index is ready, auto-load suggestions
        await loadSuggestions();
      }
    } catch (err) {
      console.error('Failed to check index status:', err);
    }
  };

  const startAutoIndex = async () => {
    if (!rootPath || isIndexing) return;

    setIsIndexing(true);
    setError(null);

    try {
      console.log('🔄 Starting auto-index...');
      const message = await invoke<string>('auto_index_notes', { rootPath });
      console.log(message);

      // Update status
      const status = await invoke<IndexStatus>('get_index_status');
      setIndexStatus(status);

      // Auto-load suggestions after indexing
      await loadSuggestions();
    } catch (err) {
      setError(`Indexing failed: ${err}`);
      console.error('Indexing error:', err);
    } finally {
      setIsIndexing(false);
      setIndexProgress(null);
    }
  };

  const loadSuggestions = async () => {
    if (!rootPath) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await invoke<SmartSuggestion[]>('find_cross_folder_suggestions', {
        rootPath,
      });
      setSuggestions(result);
      if (result.length === 0) {
        setError('No cross-folder relationships found. Try adding more notes in different folders.');
      }
    } catch (err) {
      setError(`Failed to find suggestions: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyzeIdea = async (ideaFile: string, techStackFiles: string[]) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await invoke<IdeaAnalysis>('analyze_idea', {
        ideaFilePath: ideaFile,
        techStackNotes: techStackFiles,
      });
      setAnalysis(result);
      setActiveTab('analysis');
    } catch (err) {
      setError(`Failed to analyze idea: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getFileName = (path: string) => {
    return path.split(/[\\/]/).pop() || path;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence > 0.9) return '#4ade80'; // green
    if (confidence > 0.8) return '#fbbf24'; // yellow
    return '#fb923c'; // orange
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '90px',
          right: '20px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
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
        title="AI Smart Suggestions"
      >
        <Link2 size={20} />
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '500px',
        height: '600px',
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
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          padding: '16px',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link2 size={20} />
          <div>
            <h3 style={{ margin: 0, fontSize: '16px' }}>AI Smart Suggestions</h3>
            {indexStatus && (
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.9)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {isIndexing ? (
                  <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Indexing {indexProgress?.current || 0}/{indexProgress?.total || 0}...</>
                ) : (
                  <><Check size={12} /> {indexStatus.indexed_files} notes indexed</>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!isIndexing && (
            <button
              onClick={startAutoIndex}
              disabled={isLoading}
              style={{
                background: 'rgba(255,255,255,0.9)',
                border: 'none',
                color: '#6366f1',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
              title="Refresh index"
            >
              🔄 Refresh
            </button>
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

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #333',
          background: '#252525',
        }}
      >
        <button
          onClick={() => setActiveTab('suggestions')}
          style={{
            flex: 1,
            padding: '12px',
            background: activeTab === 'suggestions' ? '#1e1e1e' : 'transparent',
            border: 'none',
            color: activeTab === 'suggestions' ? '#6366f1' : '#888',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            borderBottom: activeTab === 'suggestions' ? '2px solid #6366f1' : 'none',
          }}
        >
          Suggestions ({suggestions.length})
        </button>
        <button
          onClick={() => setActiveTab('analysis')}
          style={{
            flex: 1,
            padding: '12px',
            background: activeTab === 'analysis' ? '#1e1e1e' : 'transparent',
            border: 'none',
            color: activeTab === 'analysis' ? '#6366f1' : '#888',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            borderBottom: activeTab === 'analysis' ? '2px solid #6366f1' : 'none',
          }}
        >
          Analysis {analysis && '✓'}
        </button>
      </div>

      {/* Content Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          color: '#e0e0e0',
          fontSize: '14px',
        }}
      >
        {error && (
          <div
            style={{
              background: '#ff4444',
              color: 'white',
              padding: '12px',
              borderRadius: '8px',
              marginBottom: '12px',
            }}
          >
            {error}
          </div>
        )}

        {activeTab === 'suggestions' && (
          <>
            {isIndexing && (
              <div style={{ textAlign: 'center', marginTop: '40px' }}>
                <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'center' }}>
                  <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
                </div>
                <p style={{ color: '#888' }}>
                  Indexing notes... {indexProgress?.current || 0}/{indexProgress?.total || 0}
                </p>
                {indexProgress && (
                  <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                    {getFileName(indexProgress.file_path)}
                  </p>
                )}
              </div>
            )}

            {!isIndexing && suggestions.length === 0 && !isLoading && !error && (
              <div style={{ color: '#888', textAlign: 'center', marginTop: '40px' }}>
                <p>No cross-folder relationships discovered yet.</p>
                <p style={{ fontSize: '12px', marginTop: '8px' }}>
                  Add notes in different folders to discover connections.
                </p>
              </div>
            )}

            {isLoading && !isIndexing && (
              <div style={{ textAlign: 'center', marginTop: '40px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔄</div>
                <p style={{ color: '#888' }}>Searching for suggestions...</p>
              </div>
            )}

            {suggestions.map((suggestion, index) => (
              <div
                key={index}
                style={{
                  background: '#2d2d2d',
                  padding: '12px',
                  borderRadius: '8px',
                  marginBottom: '12px',
                  cursor: 'pointer',
                  border: selectedSuggestion === suggestion ? '2px solid #6366f1' : '2px solid transparent',
                }}
                onClick={() => setSelectedSuggestion(suggestion)}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#888' }}>
                    <span style={{ color: '#6366f1', fontWeight: 'bold' }}>
                      {suggestion.source_folder}
                    </span>
                    {' → '}
                    <span style={{ color: '#8b5cf6', fontWeight: 'bold' }}>
                      {suggestion.target_folder}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: getConfidenceColor(suggestion.confidence),
                      fontWeight: 'bold',
                    }}
                  >
                    {Math.round(suggestion.confidence * 100)}%
                  </div>
                </div>

                <div style={{ fontSize: '13px', marginBottom: '4px' }}>
                  <strong>{getFileName(suggestion.source_file)}</strong>
                  <span style={{ color: '#888' }}> ↔ </span>
                  <strong>{getFileName(suggestion.target_file)}</strong>
                </div>

                <div style={{ fontSize: '12px', color: '#aaa', marginTop: '8px' }}>
                  {suggestion.reason}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenFile(suggestion.source_file);
                    }}
                    style={{
                      background: '#6366f1',
                      border: 'none',
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    Open Source
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenFile(suggestion.target_file);
                    }}
                    style={{
                      background: '#8b5cf6',
                      border: 'none',
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    Open Target
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAnalyzeIdea(suggestion.source_file, [suggestion.target_file]);
                    }}
                    style={{
                      background: '#10b981',
                      border: 'none',
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    Analyze
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === 'analysis' && (
          <>
            {!analysis && !isLoading && (
              <div style={{ color: '#888', textAlign: 'center', marginTop: '40px' }}>
                <p>Select a suggestion and click "Analyze" to evaluate an idea.</p>
              </div>
            )}

            {isLoading && (
              <div style={{ textAlign: 'center', marginTop: '40px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🤔</div>
                <p style={{ color: '#888' }}>Analyzing idea...</p>
              </div>
            )}

            {analysis && (
              <div>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                    Analyzing:
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                    {getFileName(analysis.idea_file)}
                  </div>
                </div>

                {analysis.tech_stack_matches.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ margin: '0 0 8px 0', color: '#6366f1', fontSize: '14px' }}>
                      Recommended Tech Stack
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {analysis.tech_stack_matches.map((tech, idx) => (
                        <span
                          key={idx}
                          style={{
                            background: '#6366f1',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                          }}
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.advantages.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ margin: '0 0 8px 0', color: '#10b981', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ThumbsUp size={14} /> Advantages
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {analysis.advantages.map((adv, idx) => (
                        <li key={idx} style={{ marginBottom: '4px', fontSize: '13px' }}>
                          {adv}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.disadvantages.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ margin: '0 0 8px 0', color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertTriangle size={14} /> Disadvantages & Challenges
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {analysis.disadvantages.map((dis, idx) => (
                        <li key={idx} style={{ marginBottom: '4px', fontSize: '13px' }}>
                          {dis}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div
                  style={{
                    background: '#2d2d2d',
                    padding: '12px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontSize: '13px', color: '#888' }}>Complexity:</span>
                  <div style={{ flex: 1, display: 'flex', gap: '4px' }}>
                    {Array.from({ length: 10 }).map((_, idx) => (
                      <div
                        key={idx}
                        style={{
                          flex: 1,
                          height: '8px',
                          borderRadius: '2px',
                          background:
                            idx < analysis.complexity_score
                              ? analysis.complexity_score > 7
                                ? '#ef4444'
                                : analysis.complexity_score > 4
                                ? '#fbbf24'
                                : '#10b981'
                              : '#444',
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 'bold' }}>
                    {analysis.complexity_score}/10
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
