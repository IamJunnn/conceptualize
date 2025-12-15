/**
 * InsertFromAppModal - Modal for inserting app content into whiteboard
 * Similar style to ShareToChatModal - allows selecting notes, files, tasks, meetings, or recordings
 */

import { useState, useMemo } from 'react';
import { X, Search, Plus, FileText, Folder, CheckSquare, Calendar, Mic, Video } from 'lucide-react';
import { TeamTodo, formatTodoDate } from '../../services/teamTodoTypes';
import { Recording, formatRecordingDuration, formatRecordingDate } from '../../services/recordingTypes';
import './InsertFromAppModal.css';

// Insert mode
export type InsertMode = 'note-file' | 'task' | 'meeting' | 'recording';

// File tree item
export interface FileTreeItem {
  path: string;
  name: string;
  type: 'file' | 'folder';
  id?: string;
}

// Insert result
export interface InsertResult {
  mode: InsertMode;
  // For note-file mode
  selectedFiles?: FileTreeItem[];
  // For task mode
  selectedTasks?: TeamTodo[];
  // For meeting mode
  selectedMeetings?: TeamTodo[];
  // For recording mode
  selectedRecordings?: Recording[];
}

interface InsertFromAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: InsertMode;
  // Data sources
  fileTree?: FileTreeItem[];
  tasks?: TeamTodo[];
  recordings?: Recording[];
  // Callback
  onInsert: (result: InsertResult) => Promise<void>;
}

export default function InsertFromAppModal({
  isOpen,
  onClose,
  mode,
  fileTree = [],
  tasks = [],
  recordings = [],
  onInsert,
}: InsertFromAppModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [inserting, setInserting] = useState(false);

  // Get title and description based on mode
  const { title, description, emptyMessage } = useMemo(() => {
    switch (mode) {
      case 'note-file':
        return {
          title: 'Insert Note or File',
          description: 'Select files or folders from your workspace',
          emptyMessage: 'No files or folders available',
        };
      case 'task':
        return {
          title: 'Insert Task',
          description: 'Select tasks to add to the whiteboard',
          emptyMessage: 'No tasks available',
        };
      case 'meeting':
        return {
          title: 'Insert Meeting',
          description: 'Select meetings to add to the whiteboard',
          emptyMessage: 'No meetings available',
        };
      case 'recording':
        return {
          title: 'Insert Recording',
          description: 'Select recordings to add to the whiteboard',
          emptyMessage: 'No recordings available',
        };
      default:
        return { title: '', description: '', emptyMessage: '' };
    }
  }, [mode]);

  // Filter data based on mode and search
  const filteredData = useMemo(() => {
    const query = searchQuery.toLowerCase();

    if (mode === 'note-file') {
      return fileTree.filter(item => {
        if (!query) return true;
        return item.name.toLowerCase().includes(query) ||
               item.path.toLowerCase().includes(query);
      });
    } else if (mode === 'task') {
      const taskItems = tasks.filter(t => t.type !== 'meeting');
      return taskItems.filter(task => {
        if (!query) return true;
        return task.text.toLowerCase().includes(query) ||
               task.description?.toLowerCase().includes(query);
      });
    } else if (mode === 'meeting') {
      const meetingItems = tasks.filter(t => t.type === 'meeting');
      return meetingItems.filter(meeting => {
        if (!query) return true;
        return meeting.text.toLowerCase().includes(query) ||
               meeting.description?.toLowerCase().includes(query);
      });
    } else if (mode === 'recording') {
      return recordings.filter(rec => {
        if (!query) return true;
        return rec.channelName.toLowerCase().includes(query) ||
               rec.fileName?.toLowerCase().includes(query);
      });
    }

    return [];
  }, [mode, fileTree, tasks, recordings, searchQuery]);

  // Toggle item selection
  const toggleItem = (itemId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Handle insert
  const handleInsert = async () => {
    if (selectedIds.size === 0) return;

    setInserting(true);
    try {
      const result: InsertResult = { mode };

      if (mode === 'note-file') {
        result.selectedFiles = fileTree.filter(item => selectedIds.has(item.path));
      } else if (mode === 'task') {
        result.selectedTasks = tasks.filter(t => t.type !== 'meeting' && selectedIds.has(t.id));
      } else if (mode === 'meeting') {
        result.selectedMeetings = tasks.filter(t => t.type === 'meeting' && selectedIds.has(t.id));
      } else if (mode === 'recording') {
        result.selectedRecordings = recordings.filter(r => selectedIds.has(r.id));
      }

      await onInsert(result);

      // Reset and close
      onClose();
      setSelectedIds(new Set());
      setSearchQuery('');
    } catch (error) {
      console.error('Insert failed:', error);
      alert('Failed to insert content');
    } finally {
      setInserting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="insert-app-modal-overlay" onClick={handleBackdropClick}>
      <div className="insert-app-modal">
        {/* Header */}
        <div className="insert-app-modal-header">
          <div className="insert-app-header-text">
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          <button className="insert-app-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="insert-app-search">
          <Search size={16} className="insert-app-search-icon" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="insert-app-search-input"
          />
        </div>

        {/* Items list */}
        <div className="insert-app-list">
          {filteredData.length === 0 ? (
            <div className="insert-app-empty">
              {searchQuery ? 'No results found' : emptyMessage}
            </div>
          ) : (
            <>
              {mode === 'note-file' && (filteredData as FileTreeItem[]).map(item => {
                const isSelected = selectedIds.has(item.path);
                const isFolder = item.type === 'folder';

                return (
                  <div
                    key={item.path}
                    className={`insert-app-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleItem(item.path)}
                  >
                    {/* Icon */}
                    <div className={`insert-app-icon ${isFolder ? 'folder' : 'file'}`}>
                      {isFolder ? <Folder size={20} /> : <FileText size={20} />}
                    </div>

                    {/* Info */}
                    <div className="insert-app-info">
                      <span className="insert-app-name">
                        {item.name.replace(/\.md$/, '')}
                      </span>
                      <span className="insert-app-subtitle">
                        {isFolder ? 'Folder' : 'Note'} • {item.path}
                      </span>
                    </div>

                    {/* Checkbox */}
                    <div className={`insert-app-checkbox ${isSelected ? 'checked' : ''}`}>
                      {isSelected && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  </div>
                );
              })}

              {(mode === 'task' || mode === 'meeting') && (filteredData as TeamTodo[]).map(item => {
                const isSelected = selectedIds.has(item.id);
                const isMeeting = item.type === 'meeting';

                return (
                  <div
                    key={item.id}
                    className={`insert-app-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleItem(item.id)}
                  >
                    {/* Icon */}
                    <div className={`insert-app-icon ${isMeeting ? 'meeting' : 'task'}`}>
                      {isMeeting ? <Calendar size={20} /> : <CheckSquare size={20} />}
                    </div>

                    {/* Info */}
                    <div className="insert-app-info">
                      <span className="insert-app-name">{item.text}</span>
                      <span className="insert-app-subtitle">
                        {item.endDate && formatTodoDate(item.endDate)}
                        {item.assignees?.length > 0 && ` • ${item.assignees.length} assignee${item.assignees.length > 1 ? 's' : ''}`}
                      </span>
                    </div>

                    {/* Checkbox */}
                    <div className={`insert-app-checkbox ${isSelected ? 'checked' : ''}`}>
                      {isSelected && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  </div>
                );
              })}

              {mode === 'recording' && (filteredData as Recording[]).map(item => {
                const isSelected = selectedIds.has(item.id);
                const isVideo = item.type === 'video';

                return (
                  <div
                    key={item.id}
                    className={`insert-app-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleItem(item.id)}
                  >
                    {/* Icon */}
                    <div className={`insert-app-icon ${isVideo ? 'video' : 'audio'}`}>
                      {isVideo ? <Video size={20} /> : <Mic size={20} />}
                    </div>

                    {/* Info */}
                    <div className="insert-app-info">
                      <span className="insert-app-name">
                        {item.channelName} • {formatRecordingDate(item.startedAt)}
                      </span>
                      <span className="insert-app-subtitle">
                        {isVideo ? 'Video' : 'Voice'} Call
                        {item.duration !== undefined && ` • ${formatRecordingDuration(item.duration)}`}
                      </span>
                    </div>

                    {/* Checkbox */}
                    <div className={`insert-app-checkbox ${isSelected ? 'checked' : ''}`}>
                      {isSelected && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="insert-app-footer">
          <div className="insert-app-footer-info">
            {selectedIds.size > 0 && (
              <span>{selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected</span>
            )}
          </div>
          <button
            className="insert-app-btn"
            onClick={handleInsert}
            disabled={selectedIds.size === 0 || inserting}
          >
            {inserting ? 'Inserting...' : 'Insert'}
            {!inserting && <Plus size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
