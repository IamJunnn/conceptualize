/**
 * InsertContentModal - Modal for inserting app content into chat messages
 * Allows selecting notes, files, tasks, meetings, or recordings to share in chat
 */

import { useState, useMemo } from 'react';
import { X, Search, Send, FileText, Folder, CheckSquare, Calendar, Mic, Video, PenTool } from 'lucide-react';
import { TeamTodo, formatTodoDate } from '../../../services/teamTodoTypes';
import { Recording, formatRecordingDuration, formatRecordingDate } from '../../../services/recordingTypes';
import { WhiteboardMeta } from '../../../services/whiteboardTypes';
import './InsertContentModal.css';

// Insert mode
export type InsertMode = 'note-file' | 'task' | 'meeting' | 'recording' | 'whiteboard';

// File tree item
export interface FileTreeItem {
  path: string;
  name: string;
  type: 'file' | 'folder';
  id?: string;
}

// Insert result - single item for chat (unlike whiteboard which supports multi-select)
export interface InsertResult {
  mode: InsertMode;
  // For note-file mode
  selectedFile?: FileTreeItem;
  // For task/meeting mode
  selectedTodo?: TeamTodo;
  // For recording mode
  selectedRecording?: Recording;
  // For whiteboard mode
  selectedWhiteboard?: WhiteboardMeta;
}

interface InsertContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: InsertMode;
  // Data sources
  fileTree?: FileTreeItem[];
  tasks?: TeamTodo[];
  recordings?: Recording[];
  whiteboards?: WhiteboardMeta[];
  // Current user for whiteboard creator display
  currentUserName?: string;
  // Callback
  onInsert: (result: InsertResult) => Promise<void>;
}

export default function InsertContentModal({
  isOpen,
  onClose,
  mode,
  fileTree = [],
  tasks = [],
  recordings = [],
  whiteboards = [],
  currentUserName = 'Unknown',
  onInsert,
}: InsertContentModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [inserting, setInserting] = useState(false);

  // Get title and description based on mode
  const { title, description, emptyMessage } = useMemo(() => {
    switch (mode) {
      case 'note-file':
        return {
          title: 'Share Note or File',
          description: 'Select a file or folder to share in chat',
          emptyMessage: 'No files or folders available',
        };
      case 'task':
        return {
          title: 'Share Task',
          description: 'Select a task to share in chat',
          emptyMessage: 'No tasks available',
        };
      case 'meeting':
        return {
          title: 'Share Meeting',
          description: 'Select a meeting to share in chat',
          emptyMessage: 'No meetings available',
        };
      case 'recording':
        return {
          title: 'Share Recording',
          description: 'Select a recording to share in chat',
          emptyMessage: 'No recordings available',
        };
      case 'whiteboard':
        return {
          title: 'Share Whiteboard',
          description: 'Select a whiteboard to share in chat',
          emptyMessage: 'No whiteboards available',
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
    } else if (mode === 'whiteboard') {
      return whiteboards.filter(wb => {
        if (!query) return true;
        return wb.name.toLowerCase().includes(query);
      });
    }

    return [];
  }, [mode, fileTree, tasks, recordings, whiteboards, searchQuery]);

  // Select item (single select for chat)
  const selectItem = (itemId: string) => {
    setSelectedId(prev => prev === itemId ? null : itemId);
  };

  // Handle insert/send
  const handleInsert = async () => {
    if (!selectedId) return;

    setInserting(true);
    try {
      const result: InsertResult = { mode };

      if (mode === 'note-file') {
        result.selectedFile = fileTree.find(item => item.path === selectedId);
      } else if (mode === 'task') {
        result.selectedTodo = tasks.find(t => t.type !== 'meeting' && t.id === selectedId);
      } else if (mode === 'meeting') {
        result.selectedTodo = tasks.find(t => t.type === 'meeting' && t.id === selectedId);
      } else if (mode === 'recording') {
        result.selectedRecording = recordings.find(r => r.id === selectedId);
      } else if (mode === 'whiteboard') {
        result.selectedWhiteboard = whiteboards.find(wb => wb.id === selectedId);
      }

      await onInsert(result);

      // Reset and close
      onClose();
      setSelectedId(null);
      setSearchQuery('');
    } catch (error) {
      console.error('Insert failed:', error);
      alert('Failed to share content');
    } finally {
      setInserting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Reset state when modal closes
  const handleClose = () => {
    onClose();
    setSelectedId(null);
    setSearchQuery('');
  };

  if (!isOpen) return null;

  return (
    <div className="insert-content-modal-overlay" onClick={handleBackdropClick}>
      <div className="insert-content-modal">
        {/* Header */}
        <div className="insert-content-modal-header">
          <div className="insert-content-header-text">
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          <button className="insert-content-modal-close" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="insert-content-search">
          <Search size={16} className="insert-content-search-icon" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="insert-content-search-input"
            autoFocus
          />
        </div>

        {/* Items list */}
        <div className="insert-content-list">
          {filteredData.length === 0 ? (
            <div className="insert-content-empty">
              {searchQuery ? 'No results found' : emptyMessage}
            </div>
          ) : (
            <>
              {mode === 'note-file' && (filteredData as FileTreeItem[]).map(item => {
                const isSelected = selectedId === item.path;
                const isFolder = item.type === 'folder';

                return (
                  <div
                    key={item.path}
                    className={`insert-content-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectItem(item.path)}
                  >
                    {/* Icon */}
                    <div className={`insert-content-icon ${isFolder ? 'folder' : 'file'}`}>
                      {isFolder ? <Folder size={20} /> : <FileText size={20} />}
                    </div>

                    {/* Info */}
                    <div className="insert-content-info">
                      <span className="insert-content-name">
                        {item.name.replace(/\.md$/, '')}
                      </span>
                      <span className="insert-content-subtitle">
                        {isFolder ? 'Folder' : 'Note'}
                      </span>
                    </div>

                    {/* Radio indicator */}
                    <div className={`insert-content-radio ${isSelected ? 'checked' : ''}`} />
                  </div>
                );
              })}

              {(mode === 'task' || mode === 'meeting') && (filteredData as TeamTodo[]).map(item => {
                const isSelected = selectedId === item.id;
                const isMeeting = item.type === 'meeting';

                return (
                  <div
                    key={item.id}
                    className={`insert-content-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectItem(item.id)}
                  >
                    {/* Icon */}
                    <div className={`insert-content-icon ${isMeeting ? 'meeting' : 'task'}`}>
                      {isMeeting ? <Calendar size={20} /> : <CheckSquare size={20} />}
                    </div>

                    {/* Info */}
                    <div className="insert-content-info">
                      <span className="insert-content-name">{item.text}</span>
                      <span className="insert-content-subtitle">
                        {item.endDate && formatTodoDate(item.endDate)}
                        {item.assignees?.length > 0 && ` • ${item.assignees.length} assignee${item.assignees.length > 1 ? 's' : ''}`}
                      </span>
                    </div>

                    {/* Radio indicator */}
                    <div className={`insert-content-radio ${isSelected ? 'checked' : ''}`} />
                  </div>
                );
              })}

              {mode === 'recording' && (filteredData as Recording[]).map(item => {
                const isSelected = selectedId === item.id;
                const isVideo = item.type === 'video';

                return (
                  <div
                    key={item.id}
                    className={`insert-content-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectItem(item.id)}
                  >
                    {/* Icon */}
                    <div className={`insert-content-icon ${isVideo ? 'video' : 'audio'}`}>
                      {isVideo ? <Video size={20} /> : <Mic size={20} />}
                    </div>

                    {/* Info */}
                    <div className="insert-content-info">
                      <span className="insert-content-name">
                        {item.channelName} • {formatRecordingDate(item.startedAt)}
                      </span>
                      <span className="insert-content-subtitle">
                        {isVideo ? 'Video' : 'Voice'} Call
                        {item.duration !== undefined && ` • ${formatRecordingDuration(item.duration)}`}
                      </span>
                    </div>

                    {/* Radio indicator */}
                    <div className={`insert-content-radio ${isSelected ? 'checked' : ''}`} />
                  </div>
                );
              })}

              {mode === 'whiteboard' && (filteredData as WhiteboardMeta[]).map(item => {
                const isSelected = selectedId === item.id;

                return (
                  <div
                    key={item.id}
                    className={`insert-content-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectItem(item.id)}
                  >
                    {/* Icon */}
                    <div className="insert-content-icon whiteboard">
                      <PenTool size={20} />
                    </div>

                    {/* Info */}
                    <div className="insert-content-info">
                      <span className="insert-content-name">{item.name}</span>
                      <span className="insert-content-subtitle">
                        Whiteboard • Created by {item.createdByName || currentUserName}
                      </span>
                    </div>

                    {/* Radio indicator */}
                    <div className={`insert-content-radio ${isSelected ? 'checked' : ''}`} />
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="insert-content-footer">
          <div className="insert-content-footer-info">
            {selectedId && (
              <span>1 item selected</span>
            )}
          </div>
          <button
            className="insert-content-btn"
            onClick={handleInsert}
            disabled={!selectedId || inserting}
          >
            {inserting ? 'Sending...' : 'Send'}
            {!inserting && <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
