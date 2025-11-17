import { useState, useEffect } from 'react';
import { Team } from '../../services/teamService';
import { TeamNote, listTeamNotes, createTeamNote, deleteTeamNote } from '../../services/teamNotesService';
import './TeamNotesViewer.css';

interface TeamNotesViewerProps {
  team: Team;
}

export default function TeamNotesViewer({ team }: TeamNotesViewerProps) {
  const [notes, setNotes] = useState<TeamNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateNote, setShowCreateNote] = useState(false);
  const [newNoteName, setNewNoteName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadNotes();
  }, [team.driveFolderId]);

  const loadNotes = async () => {
    try {
      setLoading(true);
      setError(null);
      const teamNotes = await listTeamNotes(team.driveFolderId);
      setNotes(teamNotes);
    } catch (err: any) {
      console.error('Failed to load team notes:', err);
      setError(err.message || 'Failed to load team notes');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNote = async () => {
    if (!newNoteName.trim()) return;

    try {
      setIsCreating(true);
      setError(null);

      const fileName = newNoteName.endsWith('.md') ? newNoteName : `${newNoteName}.md`;
      const initialContent = `# ${newNoteName}\n\nStart writing your team note here...`;

      await createTeamNote(team.driveFolderId, fileName, initialContent);

      // Reload notes
      await loadNotes();

      // Reset form
      setNewNoteName('');
      setShowCreateNote(false);
    } catch (err: any) {
      console.error('Failed to create note:', err);
      setError(err.message || 'Failed to create note');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteNote = async (noteId: string, noteName: string) => {
    if (!confirm(`Are you sure you want to delete "${noteName}"?`)) {
      return;
    }

    try {
      await deleteTeamNote(noteId);
      await loadNotes();
    } catch (err: any) {
      console.error('Failed to delete note:', err);
      setError(err.message || 'Failed to delete note');
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes <= 1 ? 'Just now' : `${minutes} minutes ago`;
      }
      return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (loading) {
    return (
      <div className="team-notes-viewer">
        <div className="notes-loading">
          <div className="loading-spinner"></div>
          <p>Loading team notes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="team-notes-viewer">
      <div className="notes-header">
        <h3>Team Notes ({notes.length})</h3>
        <button
          className="btn-create-note"
          onClick={() => setShowCreateNote(!showCreateNote)}
        >
          {showCreateNote ? 'Cancel' : '+ New Note'}
        </button>
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {showCreateNote && (
        <div className="create-note-form">
          <input
            type="text"
            value={newNoteName}
            onChange={(e) => setNewNoteName(e.target.value)}
            placeholder="Note name (e.g., Meeting Notes)"
            onKeyPress={(e) => e.key === 'Enter' && handleCreateNote()}
            disabled={isCreating}
            autoFocus
          />
          <button
            onClick={handleCreateNote}
            disabled={!newNoteName.trim() || isCreating}
            className="btn-create"
          >
            {isCreating ? 'Creating...' : 'Create'}
          </button>
        </div>
      )}

      {notes.length === 0 ? (
        <div className="notes-empty">
          <p>No team notes yet.</p>
          <p className="notes-hint">Create your first note to start collaborating!</p>
        </div>
      ) : (
        <div className="notes-list">
          {notes.map((note) => (
            <div key={note.id} className="note-item">
              <div className="note-icon">📄</div>
              <div className="note-content">
                <div className="note-name">{note.name}</div>
                <div className="note-meta">
                  <span className="note-time">{formatDate(note.modifiedTime)}</span>
                  <span className="note-preview">
                    {note.content.substring(0, 100).replace(/[#*`]/g, '')}...
                  </span>
                </div>
              </div>
              <div className="note-actions">
                {note.webViewLink && (
                  <a
                    href={note.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-view"
                    title="Open in Google Drive"
                  >
                    View
                  </a>
                )}
                <button
                  onClick={() => handleDeleteNote(note.id, note.name)}
                  className="btn-delete"
                  title="Delete note"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="notes-footer">
        <p className="notes-info">
          📂 Synced with Google Drive
          {' • '}
          <a
            href={`https://drive.google.com/drive/folders/${team.driveFolderId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open folder in Drive
          </a>
        </p>
      </div>
    </div>
  );
}
