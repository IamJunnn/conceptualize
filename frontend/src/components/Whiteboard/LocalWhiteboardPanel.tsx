/**
 * LocalWhiteboardPanel Component
 * Whiteboard interface for local mode (no team/Firebase features)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Tldraw,
  Editor,
  getSnapshot,
  loadSnapshot,
  TLAssetId,
  TLComponents,
  DefaultContextMenu,
  TLUiContextMenuProps,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  DefaultToolbar,
  DefaultToolbarContent,
  DefaultMainMenu,
  EditSubmenu,
  ViewSubmenu,
  ExportFileContentSubMenu,
  PreferencesGroup,
} from 'tldraw';
import 'tldraw/tldraw.css';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Download,
  Palette,
  Upload,
} from 'lucide-react';
import {
  LocalWhiteboard,
  LocalWhiteboardWithData,
  getLocalWhiteboard,
  queueLocalSave,
  flushLocalPendingSaves,
  saveLocalWhiteboardImage,
} from '../../services/localWhiteboardService';
import './LocalWhiteboardPanel.css';

// Export options interface
interface ExportOptions {
  format: 'png' | 'jpg' | 'pdf';
  quality: 'high' | 'medium' | 'low';
  includeBackground: boolean;
}

interface LocalWhiteboardPanelProps {
  rootPath: string;
  onExtractToNote?: (content: string, targetPath: string, fileName: string) => Promise<void>;
  fileTree?: Array<{ path: string; name: string; type: 'file' | 'folder' }>;
  selectedWhiteboardId?: string | null; // Controlled from parent (MainUI)
  onWhiteboardsChange?: (whiteboards: LocalWhiteboard[]) => void; // Notify parent of changes
}

// Custom toolbar with export and insert options
const CustomToolbar: React.FC<{
  onExport: (options: ExportOptions) => void;
  editor: Editor | null;
}> = ({ onExport, editor: _editor }) => {
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <div className="local-whiteboard-custom-toolbar">
      {/* Export button */}
      <div className="toolbar-dropdown">
        <button
          className="toolbar-btn"
          onClick={() => setShowExportMenu(!showExportMenu)}
          title="Export whiteboard"
        >
          <Download size={16} />
          <span>Export</span>
        </button>
        {showExportMenu && (
          <div className="toolbar-dropdown-menu">
            <button onClick={() => { onExport({ format: 'png', quality: 'high', includeBackground: true }); setShowExportMenu(false); }}>
              Export as PNG
            </button>
            <button onClick={() => { onExport({ format: 'jpg', quality: 'high', includeBackground: true }); setShowExportMenu(false); }}>
              Export as JPG
            </button>
            <button onClick={() => { onExport({ format: 'pdf', quality: 'high', includeBackground: true }); setShowExportMenu(false); }}>
              Export as PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Custom Main Menu
const CustomMainMenu = () => {
  return (
    <DefaultMainMenu>
      <EditSubmenu />
      <ViewSubmenu />
      <ExportFileContentSubMenu />
      <PreferencesGroup />
    </DefaultMainMenu>
  );
};

// Custom context menu
const CustomContextMenu = (props: TLUiContextMenuProps) => {
  return (
    <DefaultContextMenu {...props}>
      <TldrawUiMenuGroup id="custom-actions">
        <TldrawUiMenuItem
          id="copy"
          label="Copy"
          kbd="$c"
          onSelect={() => {
            const editor = (window as any).__tldrawEditor;
            if (editor) editor.copy();
          }}
        />
        <TldrawUiMenuItem
          id="paste"
          label="Paste"
          kbd="$v"
          onSelect={() => {
            const editor = (window as any).__tldrawEditor;
            if (editor) editor.paste();
          }}
        />
        <TldrawUiMenuItem
          id="delete"
          label="Delete"
          kbd="⌫"
          onSelect={() => {
            const editor = (window as any).__tldrawEditor;
            if (editor) editor.deleteShapes(editor.getSelectedShapeIds());
          }}
        />
      </TldrawUiMenuGroup>
    </DefaultContextMenu>
  );
};

// Custom Main Toolbar
const CustomMainToolbar = () => {
  return (
    <DefaultToolbar>
      <DefaultToolbarContent />
    </DefaultToolbar>
  );
};

// Custom components for tldraw
const customComponents: TLComponents = {
  Toolbar: CustomMainToolbar,
  ContextMenu: CustomContextMenu,
  MainMenu: CustomMainMenu,
};

const LocalWhiteboardPanel: React.FC<LocalWhiteboardPanelProps> = ({
  rootPath,
  onExtractToNote: _onExtractToNote,
  fileTree: _fileTree = [],
  selectedWhiteboardId, // Now controlled from parent
  onWhiteboardsChange: _onWhiteboardsChange,
}) => {
  // State - no more internal whiteboard list or selection (managed by parent/MainUI)
  const [activeWhiteboard, setActiveWhiteboard] = useState<LocalWhiteboardWithData | null>(null);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [isDraggingExternal, setIsDraggingExternal] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);
  const editorRef = useRef<Editor | null>(null);

  // Load whiteboard data when selection changes
  useEffect(() => {
    if (!selectedWhiteboardId) {
      setActiveWhiteboard(null);
      return;
    }

    setLoading(true);

    const loadWhiteboard = async () => {
      const wb = await getLocalWhiteboard(rootPath, selectedWhiteboardId);
      if (wb) {
        setActiveWhiteboard(wb);
      }
      setLoading(false);
    };

    loadWhiteboard();

    return () => {
      // Flush any pending saves when switching whiteboards
      flushLocalPendingSaves();
    };
  }, [selectedWhiteboardId, rootPath]);

  // Handle editor mount
  const handleMount = useCallback((newEditor: Editor) => {
    setEditor(newEditor);
    editorRef.current = newEditor;
    (window as any).__tldrawEditor = newEditor;

    // Load saved theme preference
    const savedTheme = localStorage.getItem('whiteboard-theme') as 'dark' | 'light' | null;
    const initialTheme = savedTheme || 'dark';
    newEditor.user.updateUserPreferences({ colorScheme: initialTheme });

    // Listen for theme changes
    let lastTheme = initialTheme;
    const unsubscribeTheme = newEditor.store.listen(() => {
      const currentTheme = newEditor.user.getUserPreferences().colorScheme;
      if (currentTheme && currentTheme !== lastTheme && (currentTheme === 'dark' || currentTheme === 'light')) {
        lastTheme = currentTheme;
        localStorage.setItem('whiteboard-theme', currentTheme);
      }
    }, { scope: 'session' });

    // Load existing data if available
    if (activeWhiteboard?.data) {
      try {
        loadSnapshot(newEditor.store, activeWhiteboard.data);
      } catch (error) {
        console.error('Failed to load whiteboard data:', error);
      }
    }

    // Listen for changes to save
    const handleChange = () => {
      if (selectedWhiteboardId) {
        const snapshot = getSnapshot(newEditor.store);
        queueLocalSave(rootPath, selectedWhiteboardId, snapshot);
      }
    };

    const unsubscribe = newEditor.store.listen(handleChange, {
      source: 'all',
      scope: 'all',
    });

    return () => {
      unsubscribe();
      unsubscribeTheme();
    };
  }, [selectedWhiteboardId, activeWhiteboard, rootPath]);

  // Export whiteboard
  const handleExport = async (options: ExportOptions) => {
    if (!editor) return;

    try {
      const qualityScale = options.quality === 'high' ? 2 : options.quality === 'medium' ? 1.5 : 1;
      const jpgQuality = options.quality === 'high' ? 0.95 : options.quality === 'medium' ? 0.8 : 0.6;

      const svg = await editor.getSvgString([...editor.getCurrentPageShapeIds()], {
        scale: qualityScale,
        background: options.includeBackground,
      });

      if (!svg) {
        console.error('Failed to generate SVG');
        return;
      }

      const img = document.createElement('img');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width || 1920;
        canvas.height = img.height || 1080;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          if (options.includeBackground) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, 0, 0);

          const fileName = activeWhiteboard?.name || 'whiteboard';

          if (options.format === 'pdf') {
            canvas.toBlob((blob) => {
              if (blob) {
                const url = URL.createObjectURL(blob);
                const printWindow = window.open('', '_blank');
                if (printWindow) {
                  printWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                      <head><title>${fileName}</title>
                        <style>
                          body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f0f0f0; }
                          img { max-width: 100%; max-height: 100vh; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
                          @media print { body { background: white; } img { box-shadow: none; } }
                        </style>
                      </head>
                      <body>
                        <img src="${url}" alt="${fileName}" />
                        <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };</script>
                      </body>
                    </html>
                  `);
                  printWindow.document.close();
                }
              }
            }, 'image/png', 1);
          } else if (options.format === 'jpg') {
            canvas.toBlob((blob) => {
              if (blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${fileName}.jpg`;
                a.click();
                URL.revokeObjectURL(url);
              }
            }, 'image/jpeg', jpgQuality);
          } else {
            canvas.toBlob((blob) => {
              if (blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${fileName}.png`;
                a.click();
                URL.revokeObjectURL(url);
              }
            }, 'image/png');
          }
        }
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.svg);
    } catch (error) {
      console.error('Failed to export:', error);
    }
  };

  // Drag and drop handling
  const hasExternalFiles = (e: React.DragEvent): boolean => {
    return e.dataTransfer.types.includes('Files');
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (hasExternalFiles(e) && selectedWhiteboardId) {
      setIsDraggingExternal(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDraggingExternal(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingExternal(false);

    if (!editor) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const point = editor.screenToPage({ x: e.clientX, y: e.clientY });
    let offsetX = 0;
    let offsetY = 0;

    for (const file of files) {
      const isImage = file.type.startsWith('image/');

      if (isImage && selectedWhiteboardId) {
        try {
          // Save image locally
          const localPath = await saveLocalWhiteboardImage(rootPath, file, file.name);

          // Read as data URL for display
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });

          const img = document.createElement('img');
          await new Promise<void>((resolve) => {
            img.onload = () => {
              const assetId = `asset:${crypto.randomUUID()}` as TLAssetId;

              let width = img.width;
              let height = img.height;
              const maxSize = 600;
              if (width > maxSize || height > maxSize) {
                const scale = maxSize / Math.max(width, height);
                width = width * scale;
                height = height * scale;
              }

              editor.createAssets([{
                id: assetId,
                type: 'image',
                typeName: 'asset',
                props: {
                  name: file.name,
                  src: dataUrl,
                  w: img.width,
                  h: img.height,
                  mimeType: file.type,
                  isAnimated: file.type === 'image/gif',
                },
                meta: { localPath },
              }]);

              editor.createShape({
                type: 'image',
                x: point.x + offsetX,
                y: point.y + offsetY,
                props: {
                  assetId: assetId,
                  w: width,
                  h: height,
                },
              });

              offsetX += width + 20;
              if (offsetX > 1200) {
                offsetX = 0;
                offsetY += height + 20;
              }

              resolve();
            };
            img.src = dataUrl;
          });
        } catch (error) {
          console.error('Failed to load dropped image:', error);
        }
      } else {
        // For non-image files, create a reference shape
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        let emoji = '📄';
        let color: 'yellow' | 'light-blue' | 'light-violet' | 'light-red' | 'light-green' = 'yellow';

        if (['pdf'].includes(ext)) { emoji = '📕'; color = 'light-red'; }
        else if (['doc', 'docx', 'txt', 'rtf', 'md'].includes(ext)) { emoji = '📝'; color = 'light-blue'; }
        else if (['xls', 'xlsx', 'csv'].includes(ext)) { emoji = '📊'; color = 'light-green'; }
        else if (['ppt', 'pptx'].includes(ext)) { emoji = '📽️'; color = 'light-violet'; }

        const sizeKB = Math.round(file.size / 1024);
        const sizeDisplay = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;

        editor.createShape({
          type: 'geo',
          x: point.x + offsetX,
          y: point.y + offsetY,
          props: {
            geo: 'rectangle',
            w: 200,
            h: 120,
            text: `${emoji} ${file.name}\n\nSize: ${sizeDisplay}\nType: ${file.type || 'Unknown'}`,
            color: color,
            size: 'm',
          },
        });

        offsetX += 220;
        if (offsetX > 800) {
          offsetX = 0;
          offsetY += 150;
        }
      }
    }
  };

  return (
    <div className="local-whiteboard-panel no-sidebar">
      {/* Main content - no sidebar, managed by UnifiedSidebar now */}
      <div className="local-whiteboard-content">
        {/* Custom toolbar */}
        {activeWhiteboard && selectedWhiteboardId && (
          <CustomToolbar onExport={handleExport} editor={editor} />
        )}

        {/* Canvas */}
        <div
          ref={containerRef}
          className="local-whiteboard-canvas"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drop overlay */}
          {isDraggingExternal && (
            <div className="drop-overlay">
              <div className="drop-overlay-content">
                <Upload size={48} strokeWidth={1.5} />
                <h3>Drop files here</h3>
                <p>Images will be embedded, other files will create reference cards</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="whiteboard-loading">Loading whiteboard...</div>
          ) : selectedWhiteboardId ? (
            <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
              <Tldraw
                onMount={handleMount}
                autoFocus
                components={customComponents}
                inferDarkMode
              />
            </Tooltip.Provider>
          ) : (
            <div className="whiteboard-empty-state">
              <Palette size={48} strokeWidth={1.5} className="empty-icon" />
              <p>Select a whiteboard from the sidebar or create a new one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LocalWhiteboardPanel;
