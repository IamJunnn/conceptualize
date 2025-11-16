import { useState, useEffect, useRef } from 'react';
import { User } from '../../services/authServiceTauri';
import { getUserTeams, Team } from '../../services/teamService';
import TitleBar from '../UI/TitleBar';
import { UnifiedSidebar } from '../../renderer/components/UnifiedSidebar';
import GraphView from '../Graph/GraphView';
import FileViewer from '../Viewers/FileViewer';
import { TabBar, OpenFile } from '../UI/TabBar';
import TodoPanel from '../Todo/TodoPanel';
import NoteTodosView from '../Todo/NoteTodosView';
import SettingsPanel from '../Settings/SettingsPanel';
import { CloudStorageBackend, getCloudStorageBackend } from '../../services/cloudStorageBackend';
import { DragDropProvider } from '../../contexts/DragDropContext';
import { GraphVisibilityProvider } from '../../contexts/GraphVisibilityContext';
import CreateTeamModal from './CreateTeamModal';
import './TeamMainUI.css';

interface TeamMainUIProps {
  user: User;
}

interface FileTreeNode {
  path: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
}

interface EditingState {
  path: string;
  type: 'rename' | 'new-note' | 'new-folder';
}

export default function TeamMainUI({ user }: TeamMainUIProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageBackend, setStorageBackend] = useState<CloudStorageBackend | null>(null);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);

  // MainUI-like state
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeTab, setActiveTab] = useState<string>('graph');
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [graphKey, setGraphKey] = useState(0);
  const [todoKey, setTodoKey] = useState(0);
  const [filesWithIncomingLinks, setFilesWithIncomingLinks] = useState<Set<string>>(new Set());

  const sidebarRef = useRef<any>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);

  // Load user's teams on mount
  useEffect(() => {
    loadTeams();
  }, [user.email]);

  const loadTeams = async () => {
    try {
      setLoading(true);
      const userTeams = await getUserTeams(user.email);
      setTeams(userTeams);

      // Auto-select first team if available
      if (userTeams.length > 0 && !selectedTeam) {
        setSelectedTeam(userTeams[0]);
      } else if (userTeams.length === 0) {
        // If no teams, automatically show create team modal
        setShowCreateTeamModal(true);
      }
    } catch (error) {
      console.error('Failed to load teams:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initialize storage backend when team is selected
  useEffect(() => {
    if (selectedTeam) {
      console.log('✅ Initializing team storage backend with Cloud Storage...');
      console.log('☁️ Using Firebase Cloud Storage for team files');

      const backend = getCloudStorageBackend(selectedTeam.id);
      setStorageBackend(backend);
      loadFileTree(backend);
    }
  }, [selectedTeam]);

  const loadFileTree = async (backend?: CloudStorageBackend) => {
    const backendToUse = backend || storageBackend;
    if (!backendToUse) return;

    try {
      const tree = await backendToUse.getFileTree();
      setFileTree(tree);
    } catch (error) {
      console.error('Failed to load file tree:', error);

      // If authentication failed, show helpful message
      if (error instanceof Error && error.message.includes('Not authenticated')) {
        console.log('💡 Tip: Please make sure you are signed in with Firebase Authentication.');
      }
    }
  };

  const handleSelectFile = (filePath: string, fileName: string) => {
    // Check if file is already open
    const existingFile = openFiles.find(f => f.path === filePath);

    if (!existingFile) {
      // Add to open files
      setOpenFiles([...openFiles, { path: filePath, name: fileName }]);
    }

    setActiveTab(filePath);
  };

  const handleCloseFile = (filePath: string) => {
    const newOpenFiles = openFiles.filter(f => f.path !== filePath);
    setOpenFiles(newOpenFiles);

    // If closing active tab, switch to another tab
    if (activeTab === filePath) {
      if (newOpenFiles.length > 0) {
        setActiveTab(newOpenFiles[newOpenFiles.length - 1].path);
      } else {
        setActiveTab('graph');
      }
    }
  };

  const handleStartEditing = (path: string, type: 'rename' | 'new-note' | 'new-folder') => {
    setEditing({ path, type });
  };

  const handleFinishEditing = () => {
    setEditing(null);
    if (storageBackend) {
      loadFileTree(storageBackend);
    }
  };

  const handleSidebarDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(500, startWidth + (e.clientX - startX)));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  if (loading) {
    return (
      <div className="team-main-ui">
        <TitleBar
          onSearchResultClick={() => {}}
          onSettingsOpen={() => setShowSettings(true)}
          rootPath=""
        />
        <div className="loading-state">
          <p>Loading your teams...</p>
        </div>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="team-main-ui">
        <TitleBar
          onSearchResultClick={() => {}}
          onSettingsOpen={() => setShowSettings(true)}
          rootPath=""
        />
        {/* Show loading state while waiting for modal to open */}
        <div className="loading-state">
          <p>Setting up your team workspace...</p>
        </div>

        {showCreateTeamModal && (
          <CreateTeamModal
            user={user}
            onClose={() => setShowCreateTeamModal(false)}
            onTeamCreated={() => {
              setShowCreateTeamModal(false);
              loadTeams();
            }}
          />
        )}
      </div>
    );
  }

  if (!selectedTeam || !storageBackend) {
    return (
      <div className="team-main-ui">
        <TitleBar
          onSearchResultClick={() => {}}
          onSettingsOpen={() => setShowSettings(true)}
          rootPath=""
        />
        <div className="loading-state">
          <p>Initializing team workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <GraphVisibilityProvider>
      <DragDropProvider>
        <div className="team-main-ui">
          <TitleBar
            onSearchResultClick={handleSelectFile}
            onSettingsOpen={() => setShowSettings(true)}
            rootPath={selectedTeam.driveFolderId}
          />

          <div className="main-ui-content">
            {/* Left Sidebar - File Tree */}
            <div className="explorer-sidebar" style={{ width: `${sidebarWidth}px` }}>
              <UnifiedSidebar
                ref={sidebarRef}
                fileTree={fileTree}
                onSelectFile={handleSelectFile}
                getRootPath={() => selectedTeam.driveFolderId}
                editing={editing}
                onStartEditing={handleStartEditing}
                onFinishEditing={handleFinishEditing}
                refreshFileTree={() => loadFileTree()}
                onContextMenu={() => {}}
                onMoveItem={() => {}}
                onChangeFolderPath={() => {}}
                filesWithIncomingLinks={filesWithIncomingLinks}
              />
            </div>

            {/* Sidebar Divider */}
            <div className="sidebar-divider" onMouseDown={handleSidebarDividerMouseDown}></div>

            {/* Main Content Area */}
            <div className="main-content" ref={mainContentRef}>
              <TabBar
                activeTab={activeTab}
                openFiles={openFiles}
                showGraphTab={true}
                onTabClick={setActiveTab}
                onTabClose={handleCloseFile}
                dragStartPos={{ x: 0, y: 0 }}
                setDragStartPos={() => {}}
                isPaneActive={true}
                onRevealInTree={() => {}}
                onPaneActivate={() => {}}
              />

              <div className="tab-content">
                {activeTab === 'graph' && (
                  <GraphView
                    key={graphKey}
                    rootPath={selectedTeam.driveFolderId}
                    onFileOpen={handleSelectFile}
                    onNodeContextMenu={() => {}}
                  />
                )}
                {activeTab === 'special://todos' && (
                  <NoteTodosView
                    key={todoKey}
                    rootPath={selectedTeam.driveFolderId}
                    onOpenFile={handleSelectFile}
                    onTodoCreated={() => setTodoKey(prev => prev + 1)}
                  />
                )}
                {activeTab === 'special://timeline' && (
                  <TodoPanel
                    key={todoKey}
                    initialView="timeline"
                    rootPath={selectedTeam.driveFolderId}
                    onTodoCreated={() => setTodoKey(prev => prev + 1)}
                  />
                )}
                {openFiles.filter(file => !file.path.startsWith('special://')).map((file) => {
                  const isEditable = file.name.toLowerCase().endsWith('.md') || file.name.toLowerCase().endsWith('.txt');
                  return activeTab === file.path && (
                    isEditable ? (
                      <FileViewer
                        key={file.path}
                        filePath={file.path}
                        fileName={file.name}
                        rootPath={selectedTeam.driveFolderId}
                        onOpenFile={handleSelectFile}
                        onFileCreated={() => {
                          loadFileTree();
                          setGraphKey(prev => prev + 1);
                        }}
                        onFileRenamed={(oldPath, newPath, newName) => {
                          const updatedOpenFiles = openFiles.map(f =>
                            f.path === oldPath ? { path: newPath, name: newName } : f
                          );
                          setOpenFiles(updatedOpenFiles);
                          if (activeTab === oldPath) {
                            setActiveTab(newPath);
                          }
                          loadFileTree();
                          setGraphKey(prev => prev + 1);
                        }}
                        isActive={true}
                      />
                    ) : (
                      <FileViewer
                        key={file.path}
                        filePath={file.path}
                        fileName={file.name}
                        rootPath={selectedTeam.driveFolderId}
                      />
                    )
                  );
                })}
              </div>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <SettingsPanel
              onClose={() => setShowSettings(false)}
              currentTeam={selectedTeam}
              availableTeams={teams}
              onSwitchTeam={(team) => {
                setSelectedTeam(team);
                setShowSettings(false);
              }}
            />
          )}
        </div>
      </DragDropProvider>
    </GraphVisibilityProvider>
  );
}
