import React, { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { UnifiedSidebar } from '../renderer/components/UnifiedSidebar'
import GraphView from './GraphView'
import FileViewer from './FileViewer'
import ContextMenu from './ContextMenu'
import { TabBar, OpenFile } from './TabBar'
import { DropZoneOverlay } from './DropZoneOverlay'
import { useDragDrop, EditorPane } from '../contexts/DragDropContext'
import './MainUI.css'

interface MainUIProps {
  rootPath: string
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

interface ContextMenuState {
  x: number;
  y: number;
  itemPath: string;
  itemType: 'file' | 'folder';
  itemName: string;
}

function MainUI({ rootPath }: MainUIProps) {
  const { draggedTab, setDraggedTab, dropZone, setDropZone, isDragging, setIsDragging } = useDragDrop();
  const mainContentRef = useRef<HTMLDivElement>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [activeTab, setActiveTab] = useState<string>('graph') // 'graph' | 'timeline' | file path
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([])
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [graphKey, setGraphKey] = useState(0) // For forcing graph refresh

  // Split view state
  const [splitView, setSplitView] = useState(false)
  const [activePane, setActivePane] = useState<EditorPane>('left')
  const [leftPaneTab, setLeftPaneTab] = useState<string>('graph')
  const [rightPaneTab, setRightPaneTab] = useState<string>('graph')
  const [leftPaneFiles, setLeftPaneFiles] = useState<OpenFile[]>([])
  const [rightPaneFiles, setRightPaneFiles] = useState<OpenFile[]>([])

  // Debug: Log split view state changes
  useEffect(() => {
    console.log('Split view state changed:', {
      splitView,
      leftPaneFiles: leftPaneFiles.length,
      rightPaneFiles: rightPaneFiles.length,
      leftPaneTab,
      rightPaneTab
    })
  }, [splitView, leftPaneFiles, rightPaneFiles, leftPaneTab, rightPaneTab])

  const loadFileTree = useCallback(async () => {
    try {
      const tree = await invoke<FileTreeNode[]>('get_file_tree', { rootPath })
      setFileTree(tree)
    } catch (error) {
      console.error('Failed to load file tree:', error)
    }
  }, [rootPath])

  useEffect(() => {
    loadFileTree()
  }, [loadFileTree])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+W or Cmd+W (Mac) - Close active tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault() // Prevent browser from closing tab/window

        // Only close if active tab is a file (not Graph or Timeline)
        if (activeTab !== 'graph' && activeTab !== 'timeline') {
          handleCloseFile(activeTab)
        }
      }

      // Ctrl+\ or Cmd+\ (Mac) - Toggle split view
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault()
        if (splitView) {
          handleCloseSplitView()
        } else {
          // Open split view with Graph in right pane
          handleOpenInSecondPane('graph', 'Graph')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeTab, splitView]) // Re-bind when active tab or splitView changes

  // Global mouse listeners for tab dragging
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!dragStartPos || !draggedTab) {
        return;
      }

      const dx = Math.abs(e.clientX - dragStartPos.x);
      const dy = Math.abs(e.clientY - dragStartPos.y);

      // Set dragging flag once threshold is exceeded
      if ((dx > 5 || dy > 5) && !isDragging) {
        console.log('🚀 DRAG START (tab):', draggedTab.fileName);
        setIsDragging(true);
      }
    };

    const handleGlobalMouseUp = () => {
      if (dragStartPos || draggedTab) {
        console.log('🏁 DRAG END (tab)');

        // Handle drop if we're over a drop zone
        if (isDragging) {
          handleTabDrop();
        }

        // Reset all drag state
        setDragStartPos(null);
        setDraggedTab(null);
        setDropZone(null);
        setIsDragging(false);
      }
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragStartPos, draggedTab, isDragging, dropZone]);

  const handleSelectFile = (filePath: string, fileName: string, pane?: EditorPane) => {
    console.log('handleSelectFile called:', { filePath, fileName, pane, splitView })

    if (!splitView || !pane) {
      // Single pane mode or no pane specified
      const existingFile = openFiles.find(f => f.path === filePath)
      if (existingFile) {
        setActiveTab(filePath)
      } else {
        setOpenFiles([...openFiles, { path: filePath, name: fileName }])
        setActiveTab(filePath)
      }
    } else {
      // Split view mode with pane specified
      const targetFiles = pane === 'left' ? leftPaneFiles : rightPaneFiles
      const setTargetFiles = pane === 'left' ? setLeftPaneFiles : setRightPaneFiles
      const setTargetTab = pane === 'left' ? setLeftPaneTab : setRightPaneTab

      const existingFile = targetFiles.find(f => f.path === filePath)
      if (existingFile) {
        setTargetTab(filePath)
      } else {
        setTargetFiles([...targetFiles, { path: filePath, name: fileName }])
        setTargetTab(filePath)
      }
      setActivePane(pane)
    }
  }

  const handleCloseFile = (filePath: string) => {
    const fileIndex = openFiles.findIndex(f => f.path === filePath)
    const newOpenFiles = openFiles.filter(f => f.path !== filePath)
    setOpenFiles(newOpenFiles)

    // If closing the active tab, switch to another tab
    if (activeTab === filePath) {
      if (newOpenFiles.length > 0) {
        // Switch to the previous file if available, otherwise the next one
        const newActiveIndex = Math.max(0, fileIndex - 1)
        setActiveTab(newOpenFiles[newActiveIndex]?.path || 'graph')
      } else {
        // No files left, switch to graph
        setActiveTab('graph')
      }
    }
  }

  const handleStartEditing = (path: string, type: 'rename' | 'new-note' | 'new-folder') => {
    setEditing({ path, type })
  }

  const handleFinishEditing = async (newName?: string) => {
    if (!editing || !newName || newName.trim() === '') {
      setEditing(null)
      return
    }

    try {
      if (editing.type === 'new-note') {
        const result = await invoke<{ success: boolean; path?: string; name?: string; error?: string }>('create_file', {
          parentPath: editing.path,
          fileName: newName
        })

        if (result.success) {
          await loadFileTree()
          console.log('Created file:', result.path)
          // TODO: Open the new file in editor
        } else {
          console.error('Failed to create file:', result.error)
          alert(`Failed to create file: ${result.error}`)
        }
      } else if (editing.type === 'new-folder') {
        const result = await invoke<{ success: boolean; path?: string; name?: string; error?: string }>('create_folder', {
          parentPath: editing.path,
          folderName: newName
        })

        if (result.success) {
          await loadFileTree()
          console.log('Created folder:', result.path)
        } else {
          console.error('Failed to create folder:', result.error)
          alert(`Failed to create folder: ${result.error}`)
        }
      } else if (editing.type === 'rename') {
        const result = await invoke<{ success: boolean; path?: string; name?: string; error?: string }>('rename_item', {
          oldPath: editing.path,
          newName: newName,
          rootPath: rootPath
        })

        if (result.success) {
          await loadFileTree()
          console.log('Renamed item:', result.path)

          // Refresh graph if it was a markdown file
          if (editing.path.endsWith('.md')) {
            setGraphKey(prev => prev + 1)
          }
        } else {
          console.error('Failed to rename item:', result.error)
          alert(`Failed to rename: ${result.error}`)
        }
      }
    } catch (error) {
      console.error('Error during editing:', error)
      alert('An error occurred while creating/renaming the file/folder')
    }

    setEditing(null)
  }

  const handleContextMenu = (e: React.MouseEvent, itemPath: string, itemType: 'file' | 'folder', itemName: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      itemPath,
      itemType,
      itemName
    })
  }

  const handleDeleteItem = async (itemPath: string) => {
    const confirmMessage = `Are you sure you want to delete this item? This action cannot be undone.`
    if (!window.confirm(confirmMessage)) {
      return
    }

    try {
      const result = await invoke<{ success: boolean; error?: string }>('delete_item', {
        itemPath
      })

      if (result.success) {
        await loadFileTree()
        console.log('Deleted item:', itemPath)
      } else {
        console.error('Failed to delete item:', result.error)
        alert(`Failed to delete: ${result.error}`)
      }
    } catch (error) {
      console.error('Error deleting item:', error)
      alert('An error occurred while deleting the item')
    }
  }

  const handleRenameItem = (itemPath: string, itemName: string) => {
    setEditing({ path: itemPath, type: 'rename' })
  }

  const handleCreateNote = (parentPath: string) => {
    setEditing({ path: parentPath, type: 'new-note' })
  }

  const handleCreateFolder = (parentPath: string) => {
    setEditing({ path: parentPath, type: 'new-folder' })
  }

  const handleRefresh = async () => {
    await loadFileTree()
  }

  const handleRevealInExplorer = async (itemPath: string) => {
    try {
      await invoke('reveal_in_explorer', { path: itemPath })
    } catch (error) {
      console.error('Error revealing in explorer:', error)
      alert('Failed to open file explorer')
    }
  }

  const handleMoveItem = async (sourcePath: string, destinationPath: string) => {
    try {
      console.log('🔄 Moving:', sourcePath, 'to:', destinationPath)

      const result = await invoke<{ success: boolean; path?: string; name?: string; error?: string }>('move_item', {
        sourcePath: sourcePath,
        destinationPath: destinationPath
      })

      if (result.success) {
        console.log('✅ Move successful! New path:', result.path, 'New name:', result.name)
        // Refresh the file tree to show the updated structure
        await loadFileTree()
      } else {
        console.error('❌ Failed to move item:', result.error)
        // Don't show alert for "already in folder" case
        if (result.error !== "Item is already in this folder") {
          alert(`Failed to move: ${result.error}`)
        }
      }
    } catch (error) {
      console.error('❌ Error moving item:', error)
      alert(`An error occurred while moving the item: ${error}`)
    }
  }

  const handleOpenInSecondPane = (filePath: string, fileName: string) => {
    console.log('Opening in second pane:', filePath, fileName)
    console.log('Current splitView state:', splitView)

    if (!splitView) {
      // Transfer current files to left pane
      setLeftPaneFiles(openFiles)
      setLeftPaneTab(activeTab)
      setSplitView(true)

      // Clear single pane state
      setOpenFiles([])
      setActiveTab('graph')
    }

    // Add file to right pane
    const existingFile = rightPaneFiles.find(f => f.path === filePath)
    if (!existingFile) {
      setRightPaneFiles([...rightPaneFiles, { path: filePath, name: fileName }])
    }
    setRightPaneTab(filePath)
    setActivePane('right')
  }

  const handleCloseSplitView = () => {
    console.log('Closing split view')

    // Transfer left pane files back to single pane
    setOpenFiles(leftPaneFiles)
    setActiveTab(leftPaneTab)

    // Clear split view state
    setSplitView(false)
    setLeftPaneFiles([])
    setLeftPaneTab('graph')
    setRightPaneFiles([])
    setRightPaneTab('graph')
    setActivePane('left')
  }

  // Handle tab drop
  const handleTabDrop = useCallback(() => {
    if (!draggedTab) return;

    console.log('Handling tab drop:', { draggedTab, dropZone });

    const { filePath, fileName, sourcePane } = draggedTab;

    // Only handle if dropping on left or right edge
    if (!dropZone || (dropZone !== 'left' && dropZone !== 'right')) {
      console.log('No valid drop zone - ignoring drop');
      setDraggedTab(null);
      setDropZone(null);
      return;
    }

    // Handle left/right edge drops - create new splits or move between panes
    if (dropZone === 'left' || dropZone === 'right') {
      if (!splitView) {
        // Create new split view
        console.log('Creating new split view');
        setLeftPaneFiles(openFiles);
        setLeftPaneTab(activeTab);
        setSplitView(true);
        setOpenFiles([]);
        setActiveTab('graph');

        // Add dragged file to right pane
        setRightPaneFiles([{ path: filePath, name: fileName }]);
        setRightPaneTab(filePath);
        setActivePane('right');

        // Remove from source if it was in openFiles
        const newOpenFiles = openFiles.filter(f => f.path !== filePath);
        setLeftPaneFiles(newOpenFiles);
      } else {
        // Already in split view - move tab to opposite pane
        if (sourcePane === 'left') {
          // Move from left to right
          const newLeftFiles = leftPaneFiles.filter(f => f.path !== filePath);
          setLeftPaneFiles(newLeftFiles);

          const existingInRight = rightPaneFiles.find(f => f.path === filePath);
          if (!existingInRight) {
            setRightPaneFiles([...rightPaneFiles, { path: filePath, name: fileName }]);
          }
          setRightPaneTab(filePath);
          setActivePane('right');
        } else if (sourcePane === 'right') {
          // Move from right to left
          const newRightFiles = rightPaneFiles.filter(f => f.path !== filePath);
          setRightPaneFiles(newRightFiles);

          const existingInLeft = leftPaneFiles.find(f => f.path === filePath);
          if (!existingInLeft) {
            setLeftPaneFiles([...leftPaneFiles, { path: filePath, name: fileName }]);
          }
          setLeftPaneTab(filePath);
          setActivePane('left');

          // Close split if right pane is empty
          if (newRightFiles.length === 0) {
            handleCloseSplitView();
          }
        }
      }
    }

    // Clear drag state
    setDraggedTab(null);
    setDropZone(null);
  }, [draggedTab, dropZone, splitView, openFiles, activeTab, leftPaneFiles, rightPaneFiles, leftPaneTab, rightPaneTab]);


  return (
    <div className="main-ui">
      {/* Left Sidebar - Explorer */}
      <div className="explorer-sidebar">
        <UnifiedSidebar
          fileTree={fileTree}
          onSelectFile={handleSelectFile}
          getRootPath={() => rootPath}
          editing={editing}
          onStartEditing={handleStartEditing}
          onFinishEditing={handleFinishEditing}
          refreshFileTree={loadFileTree}
          onContextMenu={handleContextMenu}
          onMoveItem={handleMoveItem}
        />
      </div>

      {/* Main Content Area */}
      <div
        className="main-content"
        ref={mainContentRef}
      >
        {isDragging && <DropZoneOverlay containerRef={mainContentRef} />}

        {!splitView ? (
          // Single pane mode
          <>
            <TabBar
              activeTab={activeTab}
              openFiles={openFiles}
              showGraphTab={true}
              showTimelineTab={true}
              onTabClick={setActiveTab}
              onTabClose={handleCloseFile}
              dragStartPos={dragStartPos}
              setDragStartPos={setDragStartPos}
            />
            <div className="tab-content">
              {activeTab === 'graph' && <GraphView key={graphKey} rootPath={rootPath} />}
              {activeTab === 'timeline' && (
                <div className="timeline-placeholder">
                  <p>Timeline view coming soon...</p>
                </div>
              )}
              {openFiles.map((file) => {
                const isMarkdown = file.name.toLowerCase().endsWith('.md')
                return activeTab === file.path && (
                  isMarkdown ? (
                    <FileViewer
                      key={file.path}
                      filePath={file.path}
                      fileName={file.name}
                      rootPath={rootPath}
                      onOpenFile={handleSelectFile}
                      onFileCreated={() => {
                        loadFileTree()
                        setGraphKey(prev => prev + 1)
                      }}
                      onFileRenamed={(oldPath, newPath, newName) => {
                        const updatedOpenFiles = openFiles.map(f =>
                          f.path === oldPath ? { path: newPath, name: newName } : f
                        )
                        setOpenFiles(updatedOpenFiles)
                        if (activeTab === oldPath) {
                          setActiveTab(newPath)
                        }
                        loadFileTree()
                        setGraphKey(prev => prev + 1)
                      }}
                    />
                  ) : (
                    <FileViewer
                      key={file.path}
                      filePath={file.path}
                      fileName={file.name}
                      rootPath={rootPath}
                    />
                  )
                )
              })}
            </div>
          </>
        ) : (
          // Split view mode
          <div className="split-view-container">
            {/* Left Pane */}
            <div className={`editor-pane ${activePane === 'left' ? 'active' : ''}`} onClick={() => setActivePane('left')}>
              <TabBar
                activeTab={leftPaneTab}
                openFiles={leftPaneFiles}
                pane="left"
                showGraphTab={true}
                showTimelineTab={true}
                onTabClick={setLeftPaneTab}
                onTabClose={(filePath) => {
                  const newFiles = leftPaneFiles.filter(f => f.path !== filePath);
                  setLeftPaneFiles(newFiles);
                  if (leftPaneTab === filePath) {
                    setLeftPaneTab(newFiles.length > 0 ? newFiles[0].path : 'graph');
                  }
                }}
                dragStartPos={dragStartPos}
                setDragStartPos={setDragStartPos}
              />
              <div className="tab-content">
                {leftPaneTab === 'graph' && <GraphView key={graphKey} rootPath={rootPath} />}
                {leftPaneTab === 'timeline' && (
                  <div className="timeline-placeholder">
                    <p>Timeline view coming soon...</p>
                  </div>
                )}
                {leftPaneFiles.map((file) => {
                  const isMarkdown = file.name.toLowerCase().endsWith('.md')
                  return leftPaneTab === file.path && (
                    isMarkdown ? (
                      <FileViewer
                        key={file.path}
                        filePath={file.path}
                        fileName={file.name}
                        rootPath={rootPath}
                        onOpenFile={(path, name) => handleSelectFile(path, name, 'left')}
                        onFileCreated={() => {
                          loadFileTree()
                          setGraphKey(prev => prev + 1)
                        }}
                        onFileRenamed={(oldPath, newPath, newName) => {
                          const updatedFiles = leftPaneFiles.map(f =>
                            f.path === oldPath ? { path: newPath, name: newName } : f
                          )
                          setLeftPaneFiles(updatedFiles)
                          if (leftPaneTab === oldPath) {
                            setLeftPaneTab(newPath)
                          }
                          loadFileTree()
                          setGraphKey(prev => prev + 1)
                        }}
                      />
                    ) : (
                      <FileViewer
                        key={file.path}
                        filePath={file.path}
                        fileName={file.name}
                        rootPath={rootPath}
                      />
                    )
                  )
                })}
              </div>
            </div>

            {/* Divider */}
            <div className="pane-divider"></div>

            {/* Right Pane */}
            <div className={`editor-pane ${activePane === 'right' ? 'active' : ''}`} onClick={() => setActivePane('right')}>
              <TabBar
                activeTab={rightPaneTab}
                openFiles={rightPaneFiles}
                pane="right"
                showGraphTab={false}
                showTimelineTab={false}
                showCloseSplit={true}
                onTabClick={setRightPaneTab}
                onTabClose={(filePath) => {
                  const newFiles = rightPaneFiles.filter(f => f.path !== filePath);
                  setRightPaneFiles(newFiles);
                  if (rightPaneTab === filePath) {
                    setRightPaneTab(newFiles.length > 0 ? newFiles[0].path : 'graph');
                  }
                  if (newFiles.length === 0) {
                    handleCloseSplitView();
                  }
                }}
                onCloseSplit={handleCloseSplitView}
                dragStartPos={dragStartPos}
                setDragStartPos={setDragStartPos}
              />
              <div className="tab-content">
                {rightPaneTab === 'graph' && <GraphView key={graphKey} rootPath={rootPath} />}
                {rightPaneTab === 'timeline' && (
                  <div className="timeline-placeholder">
                    <p>Timeline view coming soon...</p>
                  </div>
                )}
                {rightPaneFiles.map((file) => {
                  const isMarkdown = file.name.toLowerCase().endsWith('.md')
                  return rightPaneTab === file.path && (
                    isMarkdown ? (
                      <FileViewer
                        key={file.path}
                        filePath={file.path}
                        fileName={file.name}
                        rootPath={rootPath}
                        onOpenFile={(path, name) => handleSelectFile(path, name, 'right')}
                        onFileCreated={() => {
                          loadFileTree()
                          setGraphKey(prev => prev + 1)
                        }}
                        onFileRenamed={(oldPath, newPath, newName) => {
                          const updatedFiles = rightPaneFiles.map(f =>
                            f.path === oldPath ? { path: newPath, name: newName } : f
                          )
                          setRightPaneFiles(updatedFiles)
                          if (rightPaneTab === oldPath) {
                            setRightPaneTab(newPath)
                          }
                          loadFileTree()
                          setGraphKey(prev => prev + 1)
                        }}
                      />
                    ) : (
                      <FileViewer
                        key={file.path}
                        filePath={file.path}
                        fileName={file.name}
                        rootPath={rootPath}
                      />
                    )
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          itemPath={contextMenu.itemPath}
          itemType={contextMenu.itemType}
          itemName={contextMenu.itemName}
          onClose={() => setContextMenu(null)}
          onDelete={handleDeleteItem}
          onRename={handleRenameItem}
          onCreateNote={handleCreateNote}
          onCreateFolder={handleCreateFolder}
          onRefresh={handleRefresh}
          onRevealInExplorer={handleRevealInExplorer}
          onOpenInSecondPane={handleOpenInSecondPane}
        />
      )}
    </div>
  )
}

export default MainUI