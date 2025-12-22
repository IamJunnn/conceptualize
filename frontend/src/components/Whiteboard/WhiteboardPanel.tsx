/**
 * WhiteboardPanel Component
 * Main whiteboard interface using tldraw with real-time collaboration
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Tldraw,
  Editor,
  getSnapshot,
  loadSnapshot,
  TLAssetId,
  toRichText,
  TLUiOverrides,
  TLComponents,
  DefaultContextMenu,
  TLUiContextMenuProps,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  TldrawUiMenuSubmenu,
  useEditor,
  useValue,
  useActions,
  DefaultToolbar,
  DefaultToolbarContent,
  // Individual menu components for custom context menu
  ReorderMenuSubmenu,
  CutMenuItem,
  CopyMenuItem,
  PasteMenuItem,
  DuplicateMenuItem,
  DeleteMenuItem,
  // Main menu components
  DefaultMainMenu,
  EditSubmenu,
  ViewSubmenu,
  ExportFileContentSubMenu,
  PreferencesGroup,
} from 'tldraw';
import 'tldraw/tldraw.css';
import * as Tooltip from '@radix-ui/react-tooltip';
import { invoke } from '@tauri-apps/api/core';
import {
  Download,
  FileText,
  Users,
  Palette,
  ChevronDown,
  Plus,
  FileUp,
  CheckSquare,
  AtSign,
  Calendar,
  Image,
  Link,
  Youtube,
  MonitorPlay,
  Upload,
  Lock,
  Unlock,
  FlipHorizontal2,
  FlipVertical2,
} from 'lucide-react';
import {
  getWhiteboard,
  uploadWhiteboardImage,
} from '../../services/whiteboardService';
import {
  initializeSync,
  cleanupSync,
  queueSave,
  updateCursor,
  flushPendingSaves,
} from '../../services/whiteboardSyncService';
import {
  Whiteboard,
  WhiteboardPresence,
  FileTreeDragData,
} from '../../services/whiteboardTypes';
import { TeamTodo } from '../../services/teamTodoTypes';
import { Recording } from '../../services/recordingTypes';
import ExtractToNoteModal from './ExtractToNoteModal';
import InsertFromAppModal, { InsertMode, InsertResult, FileTreeItem } from './InsertFromAppModal';
import './WhiteboardPanel.css';

// Google Fonts - 24 fonts organized by category
const CUSTOM_FONTS = {
  'Sans Serif': [
    { name: 'Inter', value: 'Inter' },
    { name: 'Open Sans', value: 'Open Sans' },
    { name: 'Roboto', value: 'Roboto' },
    { name: 'Lato', value: 'Lato' },
    { name: 'Montserrat', value: 'Montserrat' },
    { name: 'Poppins', value: 'Poppins' },
    { name: 'Nunito', value: 'Nunito' },
  ],
  'Serif': [
    { name: 'Playfair Display', value: 'Playfair Display' },
    { name: 'Merriweather', value: 'Merriweather' },
    { name: 'Lora', value: 'Lora' },
    { name: 'PT Serif', value: 'PT Serif' },
    { name: 'Crimson Text', value: 'Crimson Text' },
  ],
  'Handwritten': [
    { name: 'Caveat', value: 'Caveat' },
    { name: 'Pacifico', value: 'Pacifico' },
    { name: 'Dancing Script', value: 'Dancing Script' },
    { name: 'Indie Flower', value: 'Indie Flower' },
    { name: 'Shadows Into Light', value: 'Shadows Into Light' },
  ],
  'Monospace': [
    { name: 'Fira Code', value: 'Fira Code' },
    { name: 'JetBrains Mono', value: 'JetBrains Mono' },
    { name: 'Source Code Pro', value: 'Source Code Pro' },
    { name: 'Roboto Mono', value: 'Roboto Mono' },
  ],
  'Display': [
    { name: 'Oswald', value: 'Oswald' },
    { name: 'Raleway', value: 'Raleway' },
    { name: 'Bebas Neue', value: 'Bebas Neue' },
  ],
};

// Load Google Fonts dynamically
const loadGoogleFonts = () => {
  const fontFamilies = Object.values(CUSTOM_FONTS)
    .flat()
    .map(f => f.value.replace(/ /g, '+'))
    .join('&family=');

  const linkId = 'google-fonts-whiteboard';
  if (!document.getElementById(linkId)) {
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${fontFamilies}&display=swap`;
    document.head.appendChild(link);
  }
};

interface WhiteboardPanelProps {
  teamId: string;
  userId: string;
  userName: string;
  selectedWhiteboardId?: string | null; // Whiteboard ID selected from sidebar
  onExtractToNote?: (content: string, targetPath: string, fileName: string) => Promise<void>;
  fileTree?: Array<{ path: string; name: string; type: 'file' | 'folder'; id?: string }>;
  // Data for insert modals
  tasks?: TeamTodo[];
  recordings?: Recording[];
  // Optional callbacks
  onInsertMention?: () => void;
}

// Export options interface
interface ExportOptions {
  format: 'png' | 'jpg' | 'pdf';
  quality: 'high' | 'medium' | 'low';
  includeBackground: boolean;
}

// Custom Toolbar Component
interface CustomToolbarProps {
  onExport: (options: ExportOptions) => void;
  onExtractToNote?: () => void;
  onInsertNoteFile?: () => void;
  onInsertTask?: () => void;
  onInsertMeeting?: () => void;
  onInsertRecording?: () => void;
  onInsertMention?: () => void;
  editor: Editor | null;
  teamId: string;
  whiteboardId: string;
}

const CustomToolbar: React.FC<CustomToolbarProps> = ({
  onExport,
  onExtractToNote,
  onInsertNoteFile,
  onInsertTask,
  onInsertMeeting,
  onInsertRecording,
  onInsertMention,
  editor,
  teamId,
  whiteboardId,
}) => {
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportFormat, setExportFormat] = useState<'png' | 'jpg' | 'pdf'>('png');
  const [exportQuality, setExportQuality] = useState<'high' | 'medium' | 'low'>('high');
  const [includeBackground, setIncludeBackground] = useState(true);
  const insertMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (insertMenuRef.current && !insertMenuRef.current.contains(e.target as Node)) {
        setShowInsertMenu(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };

    if (showInsertMenu || showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showInsertMenu, showExportMenu]);

  // Handle export with current options
  const handleExport = () => {
    onExport({
      format: exportFormat,
      quality: exportQuality,
      includeBackground: includeBackground,
    });
    setShowExportMenu(false);
  };

  // Helper to get viewport center in page coordinates
  const getPageCenter = () => {
    if (!editor) return { x: 0, y: 0 };
    const screenCenter = editor.getViewportScreenCenter();
    return editor.screenToPage(screenCenter);
  };

  // Insert image from file input - upload to Storage and embed using URL
  const handleInsertImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && editor) {
        try {
          // Upload to Firebase Storage
          const storageUrl = await uploadWhiteboardImage(teamId, whiteboardId, file, file.name);

          // Load image to get dimensions
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });

          const img = document.createElement('img');
          img.onload = () => {
            const center = getPageCenter();
            const assetId = `asset:${crypto.randomUUID()}` as TLAssetId;

            // Calculate dimensions - scale down if too large
            let width = img.width;
            let height = img.height;
            const maxSize = 800;
            if (width > maxSize || height > maxSize) {
              const scale = maxSize / Math.max(width, height);
              width = width * scale;
              height = height * scale;
            }

            // Create the asset with Storage URL
            editor.createAssets([{
              id: assetId,
              type: 'image',
              typeName: 'asset',
              props: {
                name: file.name,
                src: storageUrl, // Use Storage URL instead of data URL
                w: img.width,
                h: img.height,
                mimeType: file.type || 'image/png',
                isAnimated: false,
              },
              meta: {},
            }]);

            // Then create the image shape referencing the asset
            editor.createShape({
              type: 'image',
              x: center.x - width / 2,
              y: center.y - height / 2,
              props: {
                assetId: assetId,
                w: width,
                h: height,
              },
            });
          };
          img.src = dataUrl;
        } catch (error) {
          console.error('Failed to upload image:', error);
          alert('Failed to upload image. Please try again.');
        }
      }
    };
    input.click();
    setShowInsertMenu(false);
  };

  // Insert link as text shape
  const handleInsertLink = () => {
    const url = prompt('Enter URL:');
    if (url && editor) {
      const center = getPageCenter();
      editor.createShape({
        type: 'text',
        x: center.x - 100,
        y: center.y - 50,
        props: {
          richText: toRichText(`🔗 ${url}`),
        },
      });
    }
    setShowInsertMenu(false);
  };

  // Insert YouTube embed as text shape
  const handleInsertYoutube = () => {
    const url = prompt('Enter YouTube URL:');
    if (url && editor) {
      const center = getPageCenter();
      // Extract video ID
      const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)?.[1];
      editor.createShape({
        type: 'text',
        x: center.x - 100,
        y: center.y - 50,
        props: {
          richText: toRichText(`📺 YouTube\n${videoId ? `ID: ${videoId}` : url}`),
        },
      });
    }
    setShowInsertMenu(false);
  };

  return (
    <div className="custom-toolbar-container">
      {/* Export dropdown button */}
      <div style={{ position: 'relative' }} ref={exportMenuRef}>
        <button
          className={`custom-toolbar-btn ${showExportMenu ? 'active' : ''}`}
          onClick={() => setShowExportMenu(!showExportMenu)}
        >
          <Download />
          Export
          <ChevronDown className="chevron" />
        </button>

        {showExportMenu && (
          <div className="export-dropdown">
            {/* Format Section */}
            <div className="export-dropdown-section">
              <div className="export-dropdown-section-label">Format</div>
              <div className="export-format-options">
                <button
                  className={`format-option ${exportFormat === 'png' ? 'active' : ''}`}
                  onClick={() => setExportFormat('png')}
                >
                  PNG
                </button>
                <button
                  className={`format-option ${exportFormat === 'jpg' ? 'active' : ''}`}
                  onClick={() => setExportFormat('jpg')}
                >
                  JPG
                </button>
                <button
                  className={`format-option ${exportFormat === 'pdf' ? 'active' : ''}`}
                  onClick={() => setExportFormat('pdf')}
                >
                  PDF
                </button>
              </div>
            </div>

            {/* Quality Section */}
            <div className="export-dropdown-section">
              <div className="export-dropdown-section-label">Quality</div>
              <div className="export-quality-options">
                <button
                  className={`quality-option ${exportQuality === 'high' ? 'active' : ''}`}
                  onClick={() => setExportQuality('high')}
                >
                  High
                </button>
                <button
                  className={`quality-option ${exportQuality === 'medium' ? 'active' : ''}`}
                  onClick={() => setExportQuality('medium')}
                >
                  Medium
                </button>
                <button
                  className={`quality-option ${exportQuality === 'low' ? 'active' : ''}`}
                  onClick={() => setExportQuality('low')}
                >
                  Low
                </button>
              </div>
            </div>

            {/* Background Option */}
            <div className="export-dropdown-section">
              <label className="export-checkbox-label">
                <input
                  type="checkbox"
                  checked={includeBackground}
                  onChange={(e) => setIncludeBackground(e.target.checked)}
                />
                <span>Include background</span>
              </label>
            </div>

            {/* Export Button */}
            <div className="export-dropdown-section export-action">
              <button className="export-action-btn" onClick={handleExport}>
                <Download size={16} />
                Export as {exportFormat.toUpperCase()}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Extract to Note */}
      {onExtractToNote && (
        <button className="custom-toolbar-btn" onClick={onExtractToNote} title="Extract to Note">
          <FileUp />
          Extract
        </button>
      )}
    </div>
  );
}

// Helper function to download Firebase Storage image
async function downloadFirebaseImage(imageUrl: string, fileName: string): Promise<void> {
  console.log('[WHITEBOARD] Downloading image from Firebase Storage:', imageUrl);

  try {
    // The download URL from Firebase Storage already includes auth tokens
    // So we can fetch it directly and convert to blob
    const response = await fetch(imageUrl, {
      method: 'GET',
      mode: 'cors',
    });

    if (!response.ok) {
      console.error('[WHITEBOARD] Failed to fetch image:', response.status, response.statusText);
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    console.log('[WHITEBOARD] Image blob created:', blob.size, 'bytes');

    const objectUrl = URL.createObjectURL(blob);

    // Trigger download
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName || 'image.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

    console.log('[WHITEBOARD] Image download triggered successfully');
  } catch (error) {
    console.error('[WHITEBOARD] Failed to download image:', error);
    alert(`Failed to download image: ${error instanceof Error ? error.message : 'Unknown error'}\n\nCheck the console for details.`);
    throw error;
  }
}

// Global state for export transparency (shared between context menu and actions)
let exportTransparent = false;

// Custom context menu with direct Lock toggle and Flip with Lucide icons
function CustomContextMenu(props: TLUiContextMenuProps) {
  const editor = useEditor();
  const actions = useActions();
  const selectedShapes = editor.getSelectedShapes();
  const [isTransparent, setIsTransparent] = React.useState(exportTransparent);

  // Check if any selected shape is locked
  const isLocked = useValue(
    'isLocked',
    () => {
      const shapes = editor.getSelectedShapes();
      return shapes.length > 0 && shapes.every((shape) => shape.isLocked);
    },
    [editor]
  );

  const hasSelection = selectedShapes.length > 0;

  // Check if shapes can be flipped (at least one shape selected and not all locked)
  const canFlip = useValue(
    'canFlip',
    () => {
      const shapes = editor.getSelectedShapes();
      return shapes.length > 0 && !shapes.every((shape) => shape.isLocked);
    },
    [editor]
  );

  // Get all shape IDs on the current page
  const allShapeIds = editor.getCurrentPageShapeIds();
  const hasShapesOnPage = allShapeIds.size > 0;

  // Helper to select all and perform action
  const selectAllAndAction = (actionFn: () => void) => {
    const currentSelection = editor.getSelectedShapeIds();
    editor.selectAll();
    actionFn();
    // Restore previous selection after a short delay
    setTimeout(() => {
      editor.setSelectedShapes(currentSelection);
    }, 100);
  };

  return (
    <DefaultContextMenu {...props}>
      {/* When NO selection - show canvas context menu */}
      {!hasSelection && (
        <>
          {/* Paste */}
          <TldrawUiMenuGroup id="paste-group">
            <PasteMenuItem />
          </TldrawUiMenuGroup>

          {/* Copy as and Export as - for all objects */}
          {hasShapesOnPage && (
            <TldrawUiMenuGroup id="canvas-export-group">
              {/* Copy as submenu - copies all objects */}
              <TldrawUiMenuSubmenu id="copy-all-as-submenu" label="Copy as">
                <TldrawUiMenuGroup id="copy-all-as-actions">
                  <TldrawUiMenuItem
                    id="copy-all-as-svg"
                    label="SVG"
                    onSelect={() => {
                      editor.updateInstanceState({ exportBackground: !isTransparent });
                      selectAllAndAction(() => {
                        const action = actions['copy-as-svg'];
                        if (action) action.onSelect('context-menu');
                      });
                    }}
                  />
                  <TldrawUiMenuItem
                    id="copy-all-as-png"
                    label="PNG"
                    onSelect={() => {
                      editor.updateInstanceState({ exportBackground: !isTransparent });
                      selectAllAndAction(() => {
                        const action = actions['copy-as-png'];
                        if (action) action.onSelect('context-menu');
                      });
                    }}
                  />
                </TldrawUiMenuGroup>
                <TldrawUiMenuGroup id="copy-all-as-options">
                  <TldrawUiMenuItem
                    id="toggle-transparent-copy-all"
                    label={isTransparent ? '☑ Transparent' : '☐ Transparent'}
                    onSelect={() => {
                      const newValue = !isTransparent;
                      setIsTransparent(newValue);
                      exportTransparent = newValue;
                    }}
                    noClose
                  />
                </TldrawUiMenuGroup>
              </TldrawUiMenuSubmenu>

              {/* Export as submenu - exports all objects */}
              <TldrawUiMenuSubmenu id="export-all-as-submenu" label="Export as">
                <TldrawUiMenuGroup id="export-all-as-actions">
                  <TldrawUiMenuItem
                    id="export-all-as-svg"
                    label="SVG"
                    onSelect={() => {
                      editor.updateInstanceState({ exportBackground: !isTransparent });
                      selectAllAndAction(() => {
                        const action = actions['export-as-svg'];
                        if (action) action.onSelect('context-menu');
                      });
                    }}
                  />
                  <TldrawUiMenuItem
                    id="export-all-as-png"
                    label="PNG"
                    onSelect={() => {
                      editor.updateInstanceState({ exportBackground: !isTransparent });
                      selectAllAndAction(() => {
                        const action = actions['export-as-png'];
                        if (action) action.onSelect('context-menu');
                      });
                    }}
                  />
                </TldrawUiMenuGroup>
                <TldrawUiMenuGroup id="export-all-as-options">
                  <TldrawUiMenuItem
                    id="toggle-transparent-export-all"
                    label={isTransparent ? '☑ Transparent' : '☐ Transparent'}
                    onSelect={() => {
                      const newValue = !isTransparent;
                      setIsTransparent(newValue);
                      exportTransparent = newValue;
                    }}
                    noClose
                  />
                </TldrawUiMenuGroup>
              </TldrawUiMenuSubmenu>
            </TldrawUiMenuGroup>
          )}

          {/* Select all */}
          <TldrawUiMenuGroup id="select-all-group">
            <TldrawUiMenuItem
              id="select-all"
              label="Select all"
              kbd="$a"
              onSelect={() => {
                editor.selectAll();
              }}
            />
          </TldrawUiMenuGroup>
        </>
      )}

      {/* When HAS selection - show shape context menu */}
      {hasSelection && (
        <>
          {/* Group 1: Lock, Flip, Reorder */}
          <TldrawUiMenuGroup id="lock-flip-reorder-group">
            {/* Lock/Unlock with Lucide icon */}
            <TldrawUiMenuItem
              id="toggle-lock-direct"
              label={isLocked ? 'Unlock' : 'Lock'}
              iconLeft={isLocked ? <Unlock size={16} /> : <Lock size={16} />}
              onSelect={() => {
                editor.toggleLock(editor.getSelectedShapeIds());
              }}
            />
            {/* Flip submenu with Lucide icons */}
            {canFlip && (
              <TldrawUiMenuSubmenu id="flip-submenu" label="Flip">
                <TldrawUiMenuGroup id="flip-actions">
                  <TldrawUiMenuItem
                    id="flip-h"
                    label="Flip H"
                    iconLeft={<FlipHorizontal2 size={16} />}
                    onSelect={() => {
                      editor.flipShapes(editor.getSelectedShapeIds(), 'horizontal');
                    }}
                  />
                  <TldrawUiMenuItem
                    id="flip-v"
                    label="Flip V"
                    iconLeft={<FlipVertical2 size={16} />}
                    onSelect={() => {
                      editor.flipShapes(editor.getSelectedShapeIds(), 'vertical');
                    }}
                  />
                </TldrawUiMenuGroup>
              </TldrawUiMenuSubmenu>
            )}
            {/* Reorder submenu */}
            <ReorderMenuSubmenu />
          </TldrawUiMenuGroup>

          {/* Group 2: Cut, Copy, Duplicate, Delete */}
          <TldrawUiMenuGroup id="clipboard">
            <CutMenuItem />
            <CopyMenuItem />
            <DuplicateMenuItem />
            <DeleteMenuItem />
          </TldrawUiMenuGroup>
        </>
      )}
      {/* Group 3: Copy as, Export selection, Download original */}
      {hasSelection && (
        <TldrawUiMenuGroup id="export-group">
          {/* Copy as submenu */}
          <TldrawUiMenuSubmenu id="copy-as-submenu" label="Copy as">
            <TldrawUiMenuGroup id="copy-as-actions">
              <TldrawUiMenuItem
                id="copy-as-svg"
                label="SVG"
                onSelect={() => {
                  editor.updateInstanceState({ exportBackground: !isTransparent });
                  const action = actions['copy-as-svg'];
                  if (action) action.onSelect('context-menu');
                }}
              />
              <TldrawUiMenuItem
                id="copy-as-png"
                label="PNG"
                onSelect={() => {
                  editor.updateInstanceState({ exportBackground: !isTransparent });
                  const action = actions['copy-as-png'];
                  if (action) action.onSelect('context-menu');
                }}
              />
            </TldrawUiMenuGroup>
            <TldrawUiMenuGroup id="copy-as-options">
              <TldrawUiMenuItem
                id="toggle-transparent-copy"
                label={isTransparent ? '☑ Transparent' : '☐ Transparent'}
                onSelect={() => {
                  const newValue = !isTransparent;
                  setIsTransparent(newValue);
                  exportTransparent = newValue;
                }}
                noClose
              />
            </TldrawUiMenuGroup>
          </TldrawUiMenuSubmenu>
          {/* Export selection submenu */}
          <TldrawUiMenuSubmenu id="export-selection-submenu" label="Export selection">
            <TldrawUiMenuGroup id="export-selection-actions">
              <TldrawUiMenuItem
                id="export-as-svg"
                label="SVG"
                onSelect={() => {
                  editor.updateInstanceState({ exportBackground: !isTransparent });
                  const action = actions['export-as-svg'];
                  if (action) action.onSelect('context-menu');
                }}
              />
              <TldrawUiMenuItem
                id="export-as-png"
                label="PNG"
                onSelect={() => {
                  editor.updateInstanceState({ exportBackground: !isTransparent });
                  const action = actions['export-as-png'];
                  if (action) action.onSelect('context-menu');
                }}
              />
            </TldrawUiMenuGroup>
            <TldrawUiMenuGroup id="export-options">
              <TldrawUiMenuItem
                id="toggle-transparent"
                label={isTransparent ? '☑ Transparent' : '☐ Transparent'}
                onSelect={() => {
                  const newValue = !isTransparent;
                  setIsTransparent(newValue);
                  exportTransparent = newValue;
                }}
                noClose
              />
            </TldrawUiMenuGroup>
          </TldrawUiMenuSubmenu>
          {/* Download original - only for images */}
          {selectedShapes.length === 1 && selectedShapes[0].type === 'image' && (
            <TldrawUiMenuItem
              id="download-original"
              label="Download original"
              onSelect={() => {
                const action = actions['download-original'];
                if (action) action.onSelect('context-menu');
              }}
            />
          )}
        </TldrawUiMenuGroup>
      )}

      {/* Select all - always available when shapes are selected */}
      {hasSelection && (
        <TldrawUiMenuGroup id="select-all-group-selection">
          <TldrawUiMenuItem
            id="select-all-selection"
            label="Select all"
            kbd="$a"
            onSelect={() => {
              editor.selectAll();
            }}
          />
        </TldrawUiMenuGroup>
      )}
    </DefaultContextMenu>
  );
}

// Custom UI overrides to handle image downloads with Firebase Storage authentication
const customUiOverrides: TLUiOverrides = {
  actions(editor, actions) {
    // Create custom download action for Firebase images
    const customDownloadImage = {
      id: 'download-firebase-image',
      label: 'Download image',
      kbd: '$d',
      onSelect: async () => {
        const selectedShapes = editor.getSelectedShapes();
        console.log('[WHITEBOARD] Download action triggered, selected shapes:', selectedShapes.length);

        if (selectedShapes.length === 1 && selectedShapes[0].type === 'image') {
          const shape = selectedShapes[0] as any;
          const asset = shape.props?.assetId ? editor.getAsset(shape.props.assetId) : null;

          if (asset && asset.type === 'image' && asset.props.src) {
            const imageUrl = asset.props.src;
            console.log('[WHITEBOARD] Image URL:', imageUrl);

            // If it's a Firebase Storage URL, use our custom handler
            if (imageUrl.includes('firebasestorage.googleapis.com')) {
              await downloadFirebaseImage(imageUrl, asset.props.name || 'image.png');
              return;
            }
          }
        }

        console.log('[WHITEBOARD] Not a Firebase image or no image selected');
      },
    };

    // Override existing export actions
    const originalExportAsPng = actions['export-as-png'];
    const originalExportAsSvg = actions['export-as-svg'];
    const originalDownloadOriginal = actions['download-original'];
    const originalCopyAsSvg = actions['copy-as-svg'];

    // Helper function to export selected shapes only
    const exportSelectedShapes = async (format: 'png' | 'svg') => {
      const selectedShapeIds = editor.getSelectedShapeIds();
      console.log('[WHITEBOARD] exportSelectedShapes called, format:', format, 'selectedShapeIds:', selectedShapeIds.length);

      if (selectedShapeIds.length === 0) {
        console.log('[WHITEBOARD] No shapes selected, returning false');
        return false;
      }

      // Read from editor's instance state (set by updateInstanceState)
      // Fall back to global variable if not set
      const instanceState = editor.getInstanceState();
      const useTransparent = instanceState.exportBackground === false || exportTransparent;
      console.log('[WHITEBOARD] useTransparent:', useTransparent, 'exportBackground:', instanceState.exportBackground, 'exportTransparent:', exportTransparent);

      try {
        // Get SVG string for selected shapes only
        console.log('[WHITEBOARD] Getting SVG string...');
        const svgResult = await editor.getSvgString([...selectedShapeIds], {
          scale: 2,
          background: !useTransparent, // Include background unless transparent is enabled
        });

        if (!svgResult) {
          console.log('[WHITEBOARD] getSvgString returned null');
          return false;
        }
        console.log('[WHITEBOARD] SVG result:', svgResult.width, 'x', svgResult.height);

        if (format === 'svg') {
          // Download as SVG
          const blob = new Blob([svgResult.svg], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'selection.svg';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          console.log('[WHITEBOARD] SVG download triggered');
          return true;
        }

        // Convert SVG to PNG
        console.log('[WHITEBOARD] Converting SVG to PNG...');
        const img = document.createElement('img');
        return new Promise<boolean>((resolve) => {
          img.onload = () => {
            console.log('[WHITEBOARD] Image loaded, creating canvas...');

            // Limit canvas size to prevent browser crashes (max 8192px per dimension for safety)
            const MAX_DIMENSION = 8192;
            let canvasWidth = svgResult.width;
            let canvasHeight = svgResult.height;

            if (canvasWidth > MAX_DIMENSION || canvasHeight > MAX_DIMENSION) {
              const scale = Math.min(MAX_DIMENSION / canvasWidth, MAX_DIMENSION / canvasHeight);
              canvasWidth = Math.floor(canvasWidth * scale);
              canvasHeight = Math.floor(canvasHeight * scale);
              console.log('[WHITEBOARD] Scaled down canvas to:', canvasWidth, 'x', canvasHeight);
            }

            const canvas = document.createElement('canvas');
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              // Only fill white background if NOT transparent
              if (!useTransparent) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
              }
              // Draw scaled image
              ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

              canvas.toBlob((blob) => {
                if (blob) {
                  console.log('[WHITEBOARD] Blob created, size:', blob.size);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `selection.png`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  console.log('[WHITEBOARD] PNG download triggered');
                } else {
                  console.error('[WHITEBOARD] toBlob returned null');
                }
                resolve(true);
              }, 'image/png');
            } else {
              console.log('[WHITEBOARD] Failed to get canvas context');
              resolve(false);
            }
          };
          img.onerror = (e) => {
            console.error('[WHITEBOARD] Image load error:', e);
            resolve(false);
          };
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgResult.svg);
        });
      } catch (error) {
        console.error('[WHITEBOARD] Failed to export selected shapes:', error);
        return false;
      }
    };

    // Helper function to copy selected shapes to clipboard
    const copySelectedShapes = async (format: 'png' | 'svg') => {
      const selectedShapeIds = editor.getSelectedShapeIds();
      console.log('[WHITEBOARD] copySelectedShapes called, format:', format, 'selectedShapeIds:', selectedShapeIds.length);

      if (selectedShapeIds.length === 0) return false;

      // Read from editor's instance state (set by updateInstanceState)
      const instanceState = editor.getInstanceState();
      const useTransparent = instanceState.exportBackground === false || exportTransparent;
      console.log('[WHITEBOARD] Copy useTransparent:', useTransparent);

      try {
        const svgResult = await editor.getSvgString([...selectedShapeIds], {
          scale: 2,
          background: !useTransparent,
        });

        if (!svgResult) return false;

        if (format === 'svg') {
          // Copy SVG to clipboard
          await navigator.clipboard.writeText(svgResult.svg);
          console.log('[WHITEBOARD] SVG copied to clipboard');
          return true;
        }

        // Convert SVG to PNG and copy to clipboard
        const img = document.createElement('img');
        return new Promise<boolean>((resolve) => {
          img.onload = async () => {
            // Limit canvas size to prevent browser crashes
            const MAX_DIMENSION = 8192;
            let canvasWidth = svgResult.width;
            let canvasHeight = svgResult.height;

            if (canvasWidth > MAX_DIMENSION || canvasHeight > MAX_DIMENSION) {
              const scale = Math.min(MAX_DIMENSION / canvasWidth, MAX_DIMENSION / canvasHeight);
              canvasWidth = Math.floor(canvasWidth * scale);
              canvasHeight = Math.floor(canvasHeight * scale);
            }

            const canvas = document.createElement('canvas');
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              if (!useTransparent) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
              }
              ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

              canvas.toBlob(async (blob) => {
                if (blob) {
                  try {
                    await navigator.clipboard.write([
                      new ClipboardItem({ 'image/png': blob })
                    ]);
                    console.log('[WHITEBOARD] PNG copied to clipboard');
                    resolve(true);
                  } catch (e) {
                    console.error('[WHITEBOARD] Failed to copy to clipboard:', e);
                    resolve(false);
                  }
                } else {
                  console.error('[WHITEBOARD] toBlob returned null for copy');
                  resolve(false);
                }
              }, 'image/png');
            } else {
              resolve(false);
            }
          };
          img.onerror = () => resolve(false);
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgResult.svg);
        });
      } catch (error) {
        console.error('[WHITEBOARD] Failed to copy selected shapes:', error);
        return false;
      }
    };

    // Export as PNG - exports only selected shapes (respects cropping)
    const exportAsPngOverride = {
      ...originalExportAsPng,
      onSelect: async (source: any) => {
        console.log('[WHITEBOARD] export-as-png triggered');
        const selectedShapes = editor.getSelectedShapes();

        // Export selected shapes only (this respects cropping)
        if (selectedShapes.length > 0) {
          const exported = await exportSelectedShapes('png');
          if (exported) return;
        }

        // Fallback to original action
        if (originalExportAsPng?.onSelect) {
          originalExportAsPng.onSelect(source);
        }
      },
    };

    // Export as SVG - exports only selected shapes (respects cropping)
    const exportAsSvgOverride = {
      ...originalExportAsSvg,
      kbd: undefined, // Remove keyboard shortcut
      onSelect: async (source: any) => {
        console.log('[WHITEBOARD] export-as-svg triggered');
        const selectedShapes = editor.getSelectedShapes();

        // Export selected shapes only (this respects cropping)
        if (selectedShapes.length > 0) {
          const exported = await exportSelectedShapes('svg');
          if (exported) return;
        }

        // Fallback to original action
        if (originalExportAsSvg?.onSelect) {
          originalExportAsSvg.onSelect(source);
        }
      },
    };

    // Override download-original action (this is triggered by the download button)
    const downloadOriginalOverride = {
      ...originalDownloadOriginal,
      onSelect: async (source: any) => {
        console.log('[WHITEBOARD] download-original triggered');
        const selectedShapes = editor.getSelectedShapes();

        // If a single image is selected, handle it specially
        if (selectedShapes.length === 1 && selectedShapes[0].type === 'image') {
          const shape = selectedShapes[0] as any;
          const asset = shape.props?.assetId ? editor.getAsset(shape.props.assetId) : null;

          if (asset && asset.type === 'image' && asset.props.src) {
            const imageUrl = asset.props.src;

            // If it's a Firebase Storage URL, use our custom handler
            if (imageUrl.includes('firebasestorage.googleapis.com')) {
              await downloadFirebaseImage(imageUrl, asset.props.name || 'image.png');
              return;
            }
          }
        }

        // For other cases, use the original action
        if (originalDownloadOriginal?.onSelect) {
          originalDownloadOriginal.onSelect(source);
        }
      },
    };

    // Override copy-as-svg to respect transparency
    const originalCopyAsPng = actions['copy-as-png'];

    const copyAsSvgOverride = {
      ...originalCopyAsSvg,
      kbd: undefined, // Remove keyboard shortcut
      onSelect: async (source: any) => {
        console.log('[WHITEBOARD] copy-as-svg triggered');
        const selectedShapes = editor.getSelectedShapes();

        if (selectedShapes.length > 0) {
          const copied = await copySelectedShapes('svg');
          if (copied) return;
        }

        // Fallback to original action
        if (originalCopyAsSvg?.onSelect) {
          originalCopyAsSvg.onSelect(source);
        }
      },
    };

    // Override copy-as-png to respect transparency
    const copyAsPngOverride = {
      ...originalCopyAsPng,
      onSelect: async (source: any) => {
        console.log('[WHITEBOARD] copy-as-png triggered');
        const selectedShapes = editor.getSelectedShapes();

        if (selectedShapes.length > 0) {
          const copied = await copySelectedShapes('png');
          if (copied) return;
        }

        // Fallback to original action
        if (originalCopyAsPng?.onSelect) {
          originalCopyAsPng.onSelect(source);
        }
      },
    };

    return {
      ...actions,
      'download-firebase-image': customDownloadImage,
      'export-as-png': exportAsPngOverride,
      'export-as-svg': exportAsSvgOverride,
      'copy-as-svg': copyAsSvgOverride,
      'copy-as-png': copyAsPngOverride,
      'download-original': downloadOriginalOverride,
    };
  },
};

// Custom Toolbar - uses default toolbar content
function CustomMainToolbar(props: any) {
  return (
    <DefaultToolbar {...props}>
      <DefaultToolbarContent />
    </DefaultToolbar>
  );
}

// Custom Main Menu - removes Insert embed and Upload media options
function CustomMainMenu() {
  return (
    <DefaultMainMenu>
      <EditSubmenu />
      <ViewSubmenu />
      <ExportFileContentSubMenu />
      {/* Insert embed and Upload media removed */}
      <PreferencesGroup />
    </DefaultMainMenu>
  );
}

// Custom components for tldraw (toolbar and context menu)
const customComponents: TLComponents = {
  Toolbar: CustomMainToolbar,
  ContextMenu: CustomContextMenu,
  MainMenu: CustomMainMenu,
};

const WhiteboardPanel: React.FC<WhiteboardPanelProps> = ({
  teamId,
  userId,
  userName,
  selectedWhiteboardId,
  onExtractToNote,
  fileTree = [],
  tasks = [],
  recordings = [],
  onInsertMention,
}) => {
  // State
  const [activeWhiteboard, setActiveWhiteboard] = useState<Whiteboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [presence, setPresence] = useState<WhiteboardPresence[]>([]);
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [showInsertModal, setShowInsertModal] = useState(false);
  const [insertMode, setInsertMode] = useState<InsertMode>('note-file');
  const [isDraggingExternal, setIsDraggingExternal] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0); // Track drag enter/leave balance
  const editorRef = useRef<Editor | null>(null);
  const isProcessingTauriDrop = useRef(false); // Track if Tauri is handling the drop
  const lastDropTimestamp = useRef(0); // Track last drop time for debouncing

  // Hide tools and style More dropdown - using both CSS injection and DOM manipulation
  useEffect(() => {
    // Inject CSS styles
    const styleId = 'tldraw-more-dropdown-styles';
    let style = document.getElementById(styleId) as HTMLStyleElement;
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `
      /* Hide duplicate tools from More dropdown - high specificity */
      .tlui-grid button[data-testid="tools.more.select"],
      .tlui-grid button[data-testid="tools.more.hand"],
      .tlui-grid button[data-testid="tools.more.draw"],
      .tlui-grid button[data-testid="tools.more.eraser"],
      .tlui-grid button[data-testid="tools.more.arrow"],
      .tlui-grid button[data-testid="tools.more.text"],
      .tlui-grid button[data-testid="tools.more.note"],
      .tlui-grid button[data-testid="tools.more.asset"],
      .tlui-main-toolbar__overflow-content button[data-testid="tools.more.select"],
      .tlui-main-toolbar__overflow-content button[data-testid="tools.more.hand"],
      .tlui-main-toolbar__overflow-content button[data-testid="tools.more.draw"],
      .tlui-main-toolbar__overflow-content button[data-testid="tools.more.eraser"],
      .tlui-main-toolbar__overflow-content button[data-testid="tools.more.arrow"],
      .tlui-main-toolbar__overflow-content button[data-testid="tools.more.text"],
      .tlui-main-toolbar__overflow-content button[data-testid="tools.more.note"],
      .tlui-main-toolbar__overflow-content button[data-testid="tools.more.asset"] {
        display: none !important;
        visibility: hidden !important;
        width: 0 !important;
        height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        position: absolute !important;
        pointer-events: none !important;
      }

    `;

    // Also use MutationObserver to directly hide elements
    const toolsToHide = [
      'tools.more.select', 'tools.more.hand', 'tools.more.draw', 'tools.more.eraser',
      'tools.more.arrow', 'tools.more.text', 'tools.more.note', 'tools.more.asset', 'tools.more.geo'
    ];

    // Inject CSS to make toolbar buttons 32x32 instead of 40x40 and fix hover
    const compactStyleId = 'whiteboard-compact-toolbar';
    if (!document.getElementById(compactStyleId)) {
      const compactStyle = document.createElement('style');
      compactStyle.id = compactStyleId;
      compactStyle.textContent = `
        .tlui-main-toolbar__tools button.tlui-button__tool {
          width: 32px !important;
          height: 32px !important;
          min-width: 32px !important;
          min-height: 32px !important;
          padding: 0 !important;
          background: transparent !important;
        }
        .tlui-main-toolbar__tools button.tlui-button__tool:hover {
          background: transparent !important;
        }
        .tlui-main-toolbar__tools button.tlui-button__tool::after {
          display: none !important;
        }
        .tlui-main-toolbar__tools button.tlui-button__tool .tlui-icon,
        .tlui-main-toolbar__tools button.tlui-button__tool .tlui-button__icon {
          width: 18px !important;
          height: 18px !important;
        }
      `;
      document.head.appendChild(compactStyle);
    }

    const applyStyles = () => {
      toolsToHide.forEach(id => {
        const btn = document.querySelector(`button[data-testid="${id}"]`) as HTMLElement;
        if (btn) btn.style.cssText = 'display: none !important;';
      });

      // Style the hamburger menu nav container - transparent, no size constraints
      const menuZoneNav = document.querySelector('nav.tlui-menu-zone') as HTMLElement;
      if (menuZoneNav) {
        menuZoneNav.style.cssText = 'background: transparent !important; background-color: transparent !important; padding: 0 !important; margin: 0 !important; border: none !important; box-shadow: none !important; border-radius: 0 !important;';
      }

      // Remove background from hamburger menu zone row - BUT NOT the action bar toolbar
      const menuZoneRows = document.querySelectorAll('nav.tlui-menu-zone .tlui-row');
      menuZoneRows.forEach((el) => {
        const htmlEl = el as HTMLElement;
        // Skip if this is the action bar toolbar (has tlui-toolbar class)
        if (!htmlEl.classList.contains('tlui-toolbar')) {
          htmlEl.style.cssText = 'background: transparent !important; background-color: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; gap: 0 !important; border-radius: 0 !important;';
        }
      });

      // Also try the direct selector - remove background from all elements in menu zone (except action bar)
      const menuZoneElements = document.querySelectorAll('.tlui-menu-zone, .tlui-menu-zone > *, nav.tlui-menu-zone, nav.tlui-menu-zone > *');
      menuZoneElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        // Skip buttons and the action bar toolbar
        if (!htmlEl.classList.contains('tlui-button') && htmlEl.tagName !== 'BUTTON' && !htmlEl.classList.contains('tlui-toolbar')) {
          htmlEl.style.cssText = 'background: transparent !important; background-color: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; gap: 0 !important; border-radius: 0 !important;';
        }
      });

      // Collapse the popover container when not open
      const menuPopover = document.querySelector('nav.tlui-menu-zone .tlui-popover') as HTMLElement;
      if (menuPopover) {
        menuPopover.style.cssText = 'position: absolute !important; width: 0 !important; height: 0 !important; overflow: visible !important; background: transparent !important;';
      }
    };

    // Only need to update on resize
    const handleResize = () => {
      requestAnimationFrame(applyStyles);
    };
    window.addEventListener('resize', handleResize);

    // Run initially and multiple times after tldraw loads to ensure styles are applied
    applyStyles();
    const timeoutId = setTimeout(applyStyles, 500);
    const timeoutId2 = setTimeout(applyStyles, 1000);
    const timeoutId3 = setTimeout(applyStyles, 2000);

    // Also run periodically for the first few seconds to catch late-rendered elements
    const intervalId = setInterval(applyStyles, 300);
    const clearIntervalTimeout = setTimeout(() => clearInterval(intervalId), 5000);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
      clearTimeout(clearIntervalTimeout);
      clearInterval(intervalId);
      // Clean up injected compact toolbar style
      const compactStyleEl = document.getElementById(compactStyleId);
      if (compactStyleEl) compactStyleEl.remove();
    };
  }, []);

  // Inject font and size dropdowns into the rich text toolbar
  useEffect(() => {
    if (!editor) return;

    // Add CSS for the dropdowns (always update to ensure latest styles)
    const dropdownStyleId = 'rich-text-dropdown-styles';
    let existingStyle = document.getElementById(dropdownStyleId);
    if (existingStyle) existingStyle.remove();
    const style = document.createElement('style');
    style.id = dropdownStyleId;
    style.textContent = `
        .custom-font-dropdown, .custom-size-dropdown {
          position: relative;
          display: flex;
          align-items: center;
        }
        .custom-font-dropdown > button, .custom-size-dropdown > button {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          background: transparent;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          white-space: nowrap;
        }
        .custom-font-dropdown > button {
          min-width: 100px !important;
          width: 100px !important;
        }
        .custom-size-dropdown > button {
          min-width: 80px !important;
          width: 80px !important;
        }
        .custom-font-dropdown button:hover, .custom-size-dropdown button:hover {
          background: rgba(255,255,255,0.1);
        }
        .dropdown-menu {
          position: absolute;
          bottom: 100%;
          left: 0;
          margin-bottom: 4px;
          background: #2c2c2c;
          border: 1px solid #444;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          max-height: 280px;
          overflow-y: auto;
          min-width: 140px;
          z-index: 10000;
        }
        .dropdown-menu button {
          display: block;
          width: 100%;
          padding: 6px 12px;
          border: none;
          background: transparent;
          cursor: pointer;
          text-align: left;
          font-size: 12px;
          color: #fff;
        }
        .dropdown-menu button:hover {
          background: rgba(255,255,255,0.1);
        }
        .dropdown-menu button.selected {
          background: rgba(59, 130, 246, 0.3);
        }
        .dropdown-category {
          padding: 4px 12px;
          font-size: 10px;
          font-weight: 600;
          color: #888;
          text-transform: uppercase;
          background: #1a1a1a;
          border-top: 1px solid #444;
        }
        .dropdown-separator {
          width: 1px;
          height: 20px;
          background: #555;
          margin: 0 6px;
        }
        /* Hide link button from rich text toolbar */
        .tlui-toolbar button[data-testid="rich-text.link"],
        .tlui-menu button[data-testid="rich-text.link"] {
          display: none !important;
        }
      `;
    document.head.appendChild(style);

    let currentFontDropdownOpen = false;
    let currentSizeDropdownOpen = false;

    const injectDropdowns = (toolbar: HTMLElement) => {
      console.log('[Whiteboard] injectDropdowns called, toolbar:', toolbar);
      console.log('[Whiteboard] toolbar children:', toolbar.children.length, toolbar.innerHTML.substring(0, 200));

      // Remove existing dropdowns to ensure fresh injection with latest styles
      const existingContainer = toolbar.querySelector('.custom-dropdown-container');
      if (existingContainer) {
        console.log('[Whiteboard] Removing existing container');
        existingContainer.remove();
      }

      // Get the first child (the toolbar content)
      const firstChild = toolbar.firstElementChild as HTMLElement;
      console.log('[Whiteboard] firstChild:', firstChild);
      if (!firstChild) {
        console.log('[Whiteboard] No firstChild, appending to toolbar directly');
      }

      // Create container for dropdowns
      const dropdownContainer = document.createElement('div');
      dropdownContainer.className = 'custom-dropdown-container';
      dropdownContainer.style.setProperty('display', 'flex', 'important');
      dropdownContainer.style.setProperty('align-items', 'center', 'important');
      dropdownContainer.style.setProperty('gap', '2px', 'important');
      dropdownContainer.style.setProperty('flex-shrink', '0', 'important');

      // Get current editing shape
      const getEditingShape = () => {
        const editingId = editor.getEditingShapeId();
        return editingId ? editor.getShape(editingId) : null;
      };

      // Detect if we're in light mode
      const isLightMode = document.querySelector('.tl-theme__light') !== null;
      const textColor = isLightMode ? '#333' : '#fff';

      // Font dropdown
      const fontDropdown = document.createElement('div');
      fontDropdown.className = 'custom-font-dropdown';
      fontDropdown.style.setProperty('position', 'relative', 'important');
      fontDropdown.style.setProperty('display', 'flex', 'important');
      fontDropdown.style.setProperty('flex-shrink', '0', 'important');

      const fontButton = document.createElement('button');
      fontButton.style.setProperty('width', '100px', 'important');
      fontButton.style.setProperty('min-width', '100px', 'important');
      fontButton.style.setProperty('max-width', '100px', 'important');
      fontButton.style.setProperty('flex-shrink', '0', 'important');
      fontButton.style.setProperty('display', 'flex', 'important');
      fontButton.style.setProperty('align-items', 'center', 'important');
      fontButton.style.setProperty('justify-content', 'space-between', 'important');
      fontButton.style.setProperty('gap', '4px', 'important');
      fontButton.style.setProperty('padding', '4px 8px', 'important');
      fontButton.style.setProperty('background', 'transparent', 'important');
      fontButton.style.setProperty('border', 'none', 'important');
      fontButton.style.setProperty('border-radius', '4px', 'important');
      fontButton.style.setProperty('cursor', 'pointer', 'important');
      fontButton.style.setProperty('font-size', '12px', 'important');
      fontButton.style.setProperty('color', textColor, 'important');
      const updateFontButton = () => {
        const shape = getEditingShape();
        const customFont = shape?.meta?.customFont as string | undefined;
        fontButton.innerHTML = `<span style="font-family: ${customFont || 'inherit'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${customFont || 'Default'}</span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
      };
      updateFontButton();
      fontDropdown.appendChild(fontButton);

      const fontMenu = document.createElement('div');
      fontMenu.className = 'dropdown-menu whiteboard-font-menu';
      fontMenu.style.setProperty('display', 'none', 'important');
      fontMenu.style.setProperty('position', 'fixed', 'important');
      fontMenu.style.setProperty('background', '#2c2c2c', 'important');
      fontMenu.style.setProperty('border', '1px solid #444', 'important');
      fontMenu.style.setProperty('border-radius', '6px', 'important');
      fontMenu.style.setProperty('box-shadow', '0 4px 12px rgba(0,0,0,0.3)', 'important');
      fontMenu.style.setProperty('max-height', '280px', 'important');
      fontMenu.style.setProperty('overflow-y', 'auto', 'important');
      fontMenu.style.setProperty('min-width', '140px', 'important');
      fontMenu.style.setProperty('z-index', '999999', 'important');
      // Portal to body to avoid overflow issues
      document.body.appendChild(fontMenu);

      const positionFontMenu = () => {
        const rect = fontButton.getBoundingClientRect();
        fontMenu.style.setProperty('left', `${rect.left}px`, 'important');
        fontMenu.style.setProperty('bottom', `${window.innerHeight - rect.top + 4}px`, 'important');
      };

      // Add font options
      const fonts = [
        { name: 'Default', value: '' },
        { name: 'Inter', value: 'Inter', category: 'Sans Serif' },
        { name: 'Open Sans', value: 'Open Sans' },
        { name: 'Roboto', value: 'Roboto' },
        { name: 'Lato', value: 'Lato' },
        { name: 'Montserrat', value: 'Montserrat' },
        { name: 'Poppins', value: 'Poppins' },
        { name: 'Playfair Display', value: 'Playfair Display', category: 'Serif' },
        { name: 'Merriweather', value: 'Merriweather' },
        { name: 'Georgia', value: 'Georgia' },
        { name: 'Caveat', value: 'Caveat', category: 'Handwritten' },
        { name: 'Dancing Script', value: 'Dancing Script' },
        { name: 'Comic Sans MS', value: 'Comic Sans MS' },
        { name: 'Fira Code', value: 'Fira Code', category: 'Monospace' },
        { name: 'JetBrains Mono', value: 'JetBrains Mono' },
        { name: 'Consolas', value: 'Consolas' },
        { name: 'Bebas Neue', value: 'Bebas Neue', category: 'Display' },
        { name: 'Pacifico', value: 'Pacifico' },
        { name: 'Permanent Marker', value: 'Permanent Marker' },
      ];

      fonts.forEach(font => {
        if (font.category) {
          const categoryDiv = document.createElement('div');
          categoryDiv.className = 'dropdown-category';
          categoryDiv.textContent = font.category;
          categoryDiv.style.setProperty('padding', '4px 12px', 'important');
          categoryDiv.style.setProperty('font-size', '10px', 'important');
          categoryDiv.style.setProperty('font-weight', '600', 'important');
          categoryDiv.style.setProperty('color', '#888', 'important');
          categoryDiv.style.setProperty('text-transform', 'uppercase', 'important');
          categoryDiv.style.setProperty('background', '#1a1a1a', 'important');
          categoryDiv.style.setProperty('border-top', '1px solid #444', 'important');
          fontMenu.appendChild(categoryDiv);
        }
        const btn = document.createElement('button');
        btn.textContent = font.name;
        btn.style.setProperty('display', 'block', 'important');
        btn.style.setProperty('width', '100%', 'important');
        btn.style.setProperty('padding', '6px 12px', 'important');
        btn.style.setProperty('border', 'none', 'important');
        btn.style.setProperty('background', 'transparent', 'important');
        btn.style.setProperty('cursor', 'pointer', 'important');
        btn.style.setProperty('text-align', 'left', 'important');
        btn.style.setProperty('font-size', '12px', 'important');
        btn.style.setProperty('color', '#fff', 'important');
        btn.style.setProperty('font-family', font.value || 'inherit', 'important');
        btn.onmouseenter = () => btn.style.setProperty('background', 'rgba(255,255,255,0.1)', 'important');
        btn.onmouseleave = () => btn.style.setProperty('background', 'transparent', 'important');
        btn.onpointerdown = (e) => {
          e.stopPropagation();
          e.preventDefault();
          const shape = getEditingShape();
          if (shape) {
            editor.updateShape({
              id: shape.id,
              type: shape.type,
              meta: { ...shape.meta, customFont: font.value || undefined },
            });
          }
          fontMenu.style.setProperty('display', 'none', 'important');
          currentFontDropdownOpen = false;
          updateFontButton();
        };
        fontMenu.appendChild(btn);
      });

      fontButton.onpointerdown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        currentFontDropdownOpen = !currentFontDropdownOpen;
        console.log('[Whiteboard] Font button clicked, open:', currentFontDropdownOpen);
        if (currentFontDropdownOpen) {
          positionFontMenu();
        }
        fontMenu.style.setProperty('display', currentFontDropdownOpen ? 'block' : 'none', 'important');
        sizeMenu.style.setProperty('display', 'none', 'important');
        currentSizeDropdownOpen = false;
        updateFontButton();
      };

      // Size dropdown
      const sizeDropdown = document.createElement('div');
      sizeDropdown.className = 'custom-size-dropdown';
      sizeDropdown.style.setProperty('position', 'relative', 'important');
      sizeDropdown.style.setProperty('display', 'flex', 'important');
      sizeDropdown.style.setProperty('flex-shrink', '0', 'important');

      const sizeButton = document.createElement('button');
      sizeButton.style.setProperty('width', '80px', 'important');
      sizeButton.style.setProperty('min-width', '80px', 'important');
      sizeButton.style.setProperty('max-width', '80px', 'important');
      sizeButton.style.setProperty('flex-shrink', '0', 'important');
      sizeButton.style.setProperty('display', 'flex', 'important');
      sizeButton.style.setProperty('align-items', 'center', 'important');
      sizeButton.style.setProperty('justify-content', 'space-between', 'important');
      sizeButton.style.setProperty('gap', '4px', 'important');
      sizeButton.style.setProperty('padding', '4px 8px', 'important');
      sizeButton.style.setProperty('background', 'transparent', 'important');
      sizeButton.style.setProperty('border', 'none', 'important');
      sizeButton.style.setProperty('border-radius', '4px', 'important');
      sizeButton.style.setProperty('cursor', 'pointer', 'important');
      sizeButton.style.setProperty('font-size', '12px', 'important');
      sizeButton.style.setProperty('color', textColor, 'important');
      const sizes = [
        { name: 'Small', value: 's' },
        { name: 'Medium', value: 'm' },
        { name: 'Large', value: 'l' },
        { name: 'X-Large', value: 'xl' },
      ];

      const updateSizeButton = () => {
        const shape = getEditingShape();
        const currentSize = (shape as any)?.props?.size || 'm';
        const sizeName = sizes.find(s => s.value === currentSize)?.name || 'Medium';
        sizeButton.innerHTML = `<span>${sizeName}</span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
      };
      updateSizeButton();
      sizeDropdown.appendChild(sizeButton);

      const sizeMenu = document.createElement('div');
      sizeMenu.className = 'dropdown-menu whiteboard-size-menu';
      sizeMenu.style.setProperty('display', 'none', 'important');
      sizeMenu.style.setProperty('position', 'fixed', 'important');
      sizeMenu.style.setProperty('background', '#2c2c2c', 'important');
      sizeMenu.style.setProperty('border', '1px solid #444', 'important');
      sizeMenu.style.setProperty('border-radius', '6px', 'important');
      sizeMenu.style.setProperty('box-shadow', '0 4px 12px rgba(0,0,0,0.3)', 'important');
      sizeMenu.style.setProperty('min-width', '80px', 'important');
      sizeMenu.style.setProperty('z-index', '999999', 'important');
      // Portal to body to avoid overflow issues
      document.body.appendChild(sizeMenu);

      const positionSizeMenu = () => {
        const rect = sizeButton.getBoundingClientRect();
        sizeMenu.style.setProperty('left', `${rect.left}px`, 'important');
        sizeMenu.style.setProperty('bottom', `${window.innerHeight - rect.top + 4}px`, 'important');
      };

      sizes.forEach(size => {
        const btn = document.createElement('button');
        btn.textContent = size.name;
        btn.style.setProperty('display', 'block', 'important');
        btn.style.setProperty('width', '100%', 'important');
        btn.style.setProperty('padding', '6px 12px', 'important');
        btn.style.setProperty('border', 'none', 'important');
        btn.style.setProperty('background', 'transparent', 'important');
        btn.style.setProperty('cursor', 'pointer', 'important');
        btn.style.setProperty('text-align', 'left', 'important');
        btn.style.setProperty('font-size', '12px', 'important');
        btn.style.setProperty('color', '#fff', 'important');
        btn.onmouseenter = () => btn.style.setProperty('background', 'rgba(255,255,255,0.1)', 'important');
        btn.onmouseleave = () => btn.style.setProperty('background', 'transparent', 'important');
        btn.onpointerdown = (e) => {
          e.stopPropagation();
          e.preventDefault();
          const shape = getEditingShape();
          if (shape) {
            editor.updateShape({
              id: shape.id,
              type: shape.type,
              props: { ...(shape as any).props, size: size.value },
            });
          }
          sizeMenu.style.setProperty('display', 'none', 'important');
          currentSizeDropdownOpen = false;
          updateSizeButton();
        };
        sizeMenu.appendChild(btn);
      });

      sizeButton.onpointerdown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        currentSizeDropdownOpen = !currentSizeDropdownOpen;
        if (currentSizeDropdownOpen) {
          positionSizeMenu();
        }
        sizeMenu.style.setProperty('display', currentSizeDropdownOpen ? 'block' : 'none', 'important');
        fontMenu.style.setProperty('display', 'none', 'important');
        currentFontDropdownOpen = false;
        updateSizeButton();
      };

      // Separator
      const separator = document.createElement('div');
      separator.className = 'dropdown-separator';

      // Assemble
      dropdownContainer.appendChild(fontDropdown);
      dropdownContainer.appendChild(sizeDropdown);
      dropdownContainer.appendChild(separator);

      // Insert at the beginning of the toolbar
      if (firstChild) {
        toolbar.insertBefore(dropdownContainer, firstChild);
      } else {
        toolbar.appendChild(dropdownContainer);
      }
      console.log('[Whiteboard] Dropdowns injected successfully, container:', dropdownContainer);

      // Close dropdowns when clicking outside
      const closeDropdowns = (e: PointerEvent) => {
        const target = e.target as Node;
        // Check if click is inside font dropdown button or menu
        if (!fontDropdown.contains(target) && !fontMenu.contains(target)) {
          fontMenu.style.setProperty('display', 'none', 'important');
          currentFontDropdownOpen = false;
        }
        // Check if click is inside size dropdown button or menu
        if (!sizeDropdown.contains(target) && !sizeMenu.contains(target)) {
          sizeMenu.style.setProperty('display', 'none', 'important');
          currentSizeDropdownOpen = false;
        }
      };
      document.addEventListener('pointerdown', closeDropdowns);

      // Update buttons when shape changes and cleanup portaled menus
      const interval = setInterval(() => {
        if (toolbar.isConnected) {
          const editingShape = getEditingShape();
          // Only show font/size dropdowns for text shapes (text, note, geo with text)
          const isTextShape = editingShape && (
            editingShape.type === 'text' ||
            editingShape.type === 'note' ||
            (editingShape.type === 'geo' && (editingShape as any).props?.text)
          );
          dropdownContainer.style.setProperty('display', isTextShape ? 'flex' : 'none', 'important');
          if (isTextShape) {
            updateFontButton();
            updateSizeButton();
          }
        } else {
          clearInterval(interval);
          document.removeEventListener('pointerdown', closeDropdowns);
          // Remove portaled menus from body
          if (fontMenu.parentNode) fontMenu.remove();
          if (sizeMenu.parentNode) sizeMenu.remove();
        }
      }, 200);
    };

    // Periodically check for the rich text toolbar and inject dropdowns
    const checkForToolbar = () => {
      // Try multiple selectors to find the toolbar
      const toolbar = document.querySelector('[aria-label="Text formatting"]') ||
                     document.querySelector('.tlui-toolbar.tlui-menu') ||
                     document.querySelector('.tlui-row.tlui-toolbar.tlui-menu') ||
                     document.querySelector('.tlui-contextual-toolbar .tlui-toolbar') ||
                     document.querySelector('.tlui-rich-text-toolbar');

      if (toolbar && !toolbar.querySelector('.custom-dropdown-container')) {
        console.log('[Whiteboard] Found toolbar via polling:', toolbar);
        injectDropdowns(toolbar as HTMLElement);
      }
    };

    // Check every 300ms for the toolbar
    const pollInterval = setInterval(checkForToolbar, 300);

    // Also check immediately
    checkForToolbar();

    return () => {
      clearInterval(pollInterval);
      // Clean up any orphaned portaled menus
      document.querySelectorAll('.whiteboard-font-menu, .whiteboard-size-menu').forEach(el => el.remove());
    };
  }, [editor]);

  // Helper to get viewport center in page coordinates
  const getPageCenter = useCallback(() => {
    if (!editor) return { x: 0, y: 0 };
    const screenCenter = editor.getViewportScreenCenter();
    return editor.screenToPage(screenCenter);
  }, [editor]);

  // Insert content as tldraw shapes
  const handleInsertContent = useCallback(async (result: InsertResult) => {
    if (!editor) return;

    try {
      const center = getPageCenter();
      let offsetX = 0;
      let offsetY = 0;

    // Handle note-file mode
    if (result.mode === 'note-file' && result.selectedFiles) {
      for (const file of result.selectedFiles) {
        const isFolder = file.type === 'folder';
        const isNote = file.name.endsWith('.md');

        const textContent = isFolder
          ? `📁 ${file.name}\n\nFolder: ${file.path}`
          : isNote
          ? `📄 ${file.name.replace('.md', '')}\n\n[[${file.path.replace('.md', '')}]]`
          : `📄 ${file.name}\n\nPath: ${file.path}`;

        editor.createShape({
          type: 'text',
          x: center.x - 100 + offsetX,
          y: center.y - 50 + offsetY,
          props: {
            richText: toRichText(textContent),
          },
        });

        // Offset for next item
        offsetY += 120;
        if (offsetY > 400) {
          offsetY = 0;
          offsetX += 220;
        }
      }
    }

    // Handle task mode
    if (result.mode === 'task' && result.selectedTasks) {
      for (const task of result.selectedTasks) {
        const statusEmoji = task.completed ? '✓' : '☐';
        const dueDate = task.endDate ? `\nDue: ${task.endDate}` : '';
        const assignees = task.assignees.length > 0 ? `\nAssignees: ${task.assignees.length}` : '';

        const textContent = `${statusEmoji} ${task.text}${dueDate}${assignees}`;

        editor.createShape({
          type: 'text',
          x: center.x - 100 + offsetX,
          y: center.y - 50 + offsetY,
          props: {
            richText: toRichText(textContent),
          },
        });

        // Offset for next item
        offsetY += 140;
        if (offsetY > 400) {
          offsetY = 0;
          offsetX += 220;
        }
      }
    }

    // Handle meeting mode
    if (result.mode === 'meeting' && result.selectedMeetings) {
      for (const meeting of result.selectedMeetings) {
        const time = meeting.meetingDetails
          ? `\n${meeting.meetingDetails.startTime} - ${meeting.meetingDetails.endTime}`
          : '';
        const date = meeting.startDate || meeting.endDate || '';

        const textContent = `📅 ${meeting.text}${time}\n${date}`;

        editor.createShape({
          type: 'text',
          x: center.x - 100 + offsetX,
          y: center.y - 50 + offsetY,
          props: {
            richText: toRichText(textContent),
          },
        });

        // Offset for next item
        offsetY += 140;
        if (offsetY > 400) {
          offsetY = 0;
          offsetX += 220;
        }
      }
    }

    // Handle recording mode
    if (result.mode === 'recording' && result.selectedRecordings) {
      for (const recording of result.selectedRecordings) {
        const typeEmoji = recording.type === 'video' ? '🎥' : '🎙️';
        const typeLabel = recording.type === 'video' ? 'Video Call' : 'Voice Call';

        // Format duration safely
        const durationText = recording.duration
          ? ` • ${Math.floor(recording.duration / 60)}:${(recording.duration % 60).toString().padStart(2, '0')}`
          : '';

        // Format date safely
        const dateObj = recording.startedAt instanceof Date ? recording.startedAt : new Date(recording.startedAt);
        const dateText = dateObj.toLocaleDateString();

        // Create formatted text that looks like a card with border
        const textContent = `┏━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ${typeEmoji} ${recording.channelName || 'Recording'}
┃ ${typeLabel}
┃ ${dateText}${durationText}
┃
┃   ▶️  Double-click to play
┗━━━━━━━━━━━━━━━━━━━━━━━┛`;

        editor.createShape({
          type: 'text',
          x: center.x - 120 + offsetX,
          y: center.y - 60 + offsetY,
          props: {
            richText: toRichText(textContent),
          },
          meta: {
            recordingUrl: recording.fileUrl,
            isRecording: true,
            recordingType: recording.type,
          },
        });

        // Offset for next item
        offsetY += 140;
        if (offsetY > 400) {
          offsetY = 0;
          offsetX += 220;
        }
      }
    }

      setShowInsertModal(false);
    } catch (error) {
      console.error('[WHITEBOARD] Failed to insert content:', error);
      alert('Failed to insert content. Please try again.');
    }
  }, [editor, getPageCenter]);

  // Handlers to show insert modal with different modes
  const handleShowInsertNoteFile = useCallback(() => {
    setInsertMode('note-file');
    setShowInsertModal(true);
  }, []);

  const handleShowInsertTask = useCallback(() => {
    setInsertMode('task');
    setShowInsertModal(true);
  }, []);

  const handleShowInsertMeeting = useCallback(() => {
    setInsertMode('meeting');
    setShowInsertModal(true);
  }, []);

  const handleShowInsertRecording = useCallback(() => {
    setInsertMode('recording');
    setShowInsertModal(true);
  }, []);

  // Save whiteboard on page refresh/unload and tab switch
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Flush any pending debounced saves immediately
      flushPendingSaves();
    };

    const handleVisibilityChange = () => {
      // Save when user switches tabs or minimizes window
      if (document.visibilityState === 'hidden') {
        flushPendingSaves();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Also flush on component unmount
      flushPendingSaves();
    };
  }, []);

  // Fix tldraw's dark overlay when "More" menu opens
  // tldraw creates a tlui-menu-click-capture element with dark background
  // We need to use JS to override it since CSS !important doesn't always work
  useEffect(() => {
    const removeMenuOverlayBackground = () => {
      const overlays = document.querySelectorAll('.tlui-menu-click-capture');
      overlays.forEach((overlay) => {
        if (overlay instanceof HTMLElement) {
          overlay.style.setProperty('background', 'transparent', 'important');
          overlay.style.setProperty('background-color', 'transparent', 'important');
        }
      });
    };

    // Use MutationObserver to detect when tldraw adds the overlay element
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length > 0) {
          removeMenuOverlayBackground();
        }
      });
    });

    // Observe the entire document for added nodes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Also run immediately in case element already exists
    removeMenuOverlayBackground();

    return () => {
      observer.disconnect();
    };
  }, []);

  // Handle Tauri native drag-drop events (dispatched from TeamMainUI)
  useEffect(() => {
    // MIME types for common file extensions
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      bmp: 'image/bmp',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain',
      md: 'text/markdown',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      zip: 'application/zip',
      rar: 'application/x-rar-compressed',
    };

    // Handle drag indicator events
    const handleExternalDrag = (e: Event) => {
      const customEvent = e as CustomEvent<{ isDragging: boolean; position?: { x: number; y: number } }>;
      setIsDraggingExternal(customEvent.detail.isDragging);
    };

    // Handle drop events
    const handleExternalDrop = async (e: Event) => {
      const customEvent = e as CustomEvent<{ paths: string[]; position: { x: number; y: number } }>;
      const { paths, position } = customEvent.detail;

      if (!editor || paths.length === 0) return;

      // Debounce: Ignore drops within 500ms of the last drop
      const now = Date.now();
      if (now - lastDropTimestamp.current < 500) {
        console.log('[WHITEBOARD] Ignoring duplicate drop (within 500ms)');
        return;
      }
      lastDropTimestamp.current = now;

      // Set flag to prevent React handler from also processing
      isProcessingTauriDrop.current = true;

      try {
        const point = editor.screenToPage({ x: position.x, y: position.y });
        let offsetX = 0;
        let offsetY = 0;

        for (const filePath of paths) {
          const fileName = filePath.split(/[/\\]/).pop() || 'file';
          const ext = fileName.split('.').pop()?.toLowerCase() || '';
          const mimeType = mimeTypes[ext] || 'application/octet-stream';
          const isImage = mimeType.startsWith('image/');

          if (isImage && selectedWhiteboardId) {
            // Read image file, upload to Storage, and embed it
            try {
              const bytes = await invoke<number[]>('read_binary_file', { filePath });
              const uint8Array = new Uint8Array(bytes);
              const blob = new Blob([uint8Array], { type: mimeType });

              // Upload to Firebase Storage
              const storageUrl = await uploadWhiteboardImage(teamId, selectedWhiteboardId, blob, fileName);

              // Create data URL for dimension reading
              const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });

              // Load image to get dimensions
              const img = document.createElement('img');
              await new Promise<void>((resolve) => {
                img.onload = () => {
                  const assetId = `asset:${crypto.randomUUID()}` as TLAssetId;

                  // Calculate dimensions - scale down if too large
                  let width = img.width;
                  let height = img.height;
                  const maxSize = 600;
                  if (width > maxSize || height > maxSize) {
                    const scale = maxSize / Math.max(width, height);
                    width = width * scale;
                    height = height * scale;
                  }

                  // Create the asset with Storage URL
                  editor.createAssets([{
                    id: assetId,
                    type: 'image',
                    typeName: 'asset',
                    props: {
                      name: fileName,
                      src: storageUrl, // Use Storage URL instead of data URL
                      w: img.width,
                      h: img.height,
                      mimeType: mimeType,
                      isAnimated: mimeType === 'image/gif',
                    },
                    meta: {},
                  }]);

                  // Then create the image shape
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

                  // Offset for next file
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
            // For non-image files, create a reference note
            let emoji = '📄';
            let color: 'yellow' | 'light-blue' | 'light-violet' | 'light-red' | 'light-green' = 'yellow';

            if (['pdf'].includes(ext)) {
              emoji = '📕';
              color = 'light-red';
            } else if (['doc', 'docx', 'txt', 'rtf', 'md'].includes(ext)) {
              emoji = '📝';
              color = 'light-blue';
            } else if (['xls', 'xlsx', 'csv'].includes(ext)) {
              emoji = '📊';
              color = 'light-green';
            } else if (['ppt', 'pptx'].includes(ext)) {
              emoji = '📽️';
              color = 'light-violet';
            } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
              emoji = '📦';
              color = 'yellow';
            } else if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) {
              emoji = '🎵';
              color = 'light-violet';
            } else if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) {
              emoji = '🎬';
              color = 'light-red';
            }

            editor.createShape({
              type: 'geo',
              x: point.x + offsetX,
              y: point.y + offsetY,
              props: {
                geo: 'rectangle',
                w: 200,
                h: 100,
                text: `${emoji} ${fileName}\n\nPath: ${filePath}`,
                color: color,
                size: 'm',
              },
            });

            // Offset for next file
            offsetX += 220;
            if (offsetX > 800) {
              offsetX = 0;
              offsetY += 150;
            }
          }
        }
      } catch (err) {
        console.error('[WHITEBOARD] Failed to process dropped files:', err);
      } finally {
        // Reset flag after a short delay to allow React handler to see it
        setTimeout(() => {
          isProcessingTauriDrop.current = false;
        }, 100);
      }
    };

    window.addEventListener('whiteboard-external-drag', handleExternalDrag);
    window.addEventListener('whiteboard-external-drop', handleExternalDrop);

    return () => {
      window.removeEventListener('whiteboard-external-drag', handleExternalDrag);
      window.removeEventListener('whiteboard-external-drop', handleExternalDrop);
    };
  }, [editor]);

  // Handle remote updates - defined early so it can be used in sync initialization
  const handleRemoteUpdate = useCallback((whiteboard: Whiteboard) => {
    if (editorRef.current && whiteboard.data) {
      try {
        loadSnapshot(editorRef.current.store, whiteboard.data);
      } catch (error) {
        console.error('Failed to apply remote update:', error);
      }
    }
  }, []);

  // Handle presence updates - defined early so it can be used in sync initialization
  const handlePresenceUpdate = useCallback((newPresence: WhiteboardPresence[]) => {
    setPresence(newPresence);
  }, []);

  // Load whiteboard when selectedWhiteboardId changes
  useEffect(() => {
    if (!selectedWhiteboardId) {
      setActiveWhiteboard(null);
      return;
    }

    setLoading(true);

    const loadWhiteboard = async () => {
      const wb = await getWhiteboard(teamId, selectedWhiteboardId);
      if (wb) {
        setActiveWhiteboard(wb);
      }
      setLoading(false);
    };

    loadWhiteboard();

    return () => {
      cleanupSync(selectedWhiteboardId);
    };
  }, [selectedWhiteboardId, teamId]);

  // Initialize sync when BOTH editor AND selectedWhiteboardId are ready
  // This fixes the race condition where editor wasn't ready during whiteboard load
  useEffect(() => {
    if (!editor || !selectedWhiteboardId) {
      return;
    }

    console.log('[Whiteboard] Initializing sync for:', selectedWhiteboardId);

    const cleanup = initializeSync(
      teamId,
      selectedWhiteboardId,
      userId,
      userName,
      editor,
      handleRemoteUpdate,
      handlePresenceUpdate
    );

    return () => {
      console.log('[Whiteboard] Cleaning up sync for:', selectedWhiteboardId);
      cleanup();
    };
  }, [editor, selectedWhiteboardId, teamId, userId, userName, handleRemoteUpdate, handlePresenceUpdate]);

  // Add title attributes to grid buttons for tooltips
  useEffect(() => {
    const addTitlesToButtons = () => {
      // Select all buttons in the action menu grid that have aria-label but no title
      const buttons = document.querySelectorAll('.tlui-buttons__grid button[aria-label], [class*="buttons__grid"] button[aria-label]');
      buttons.forEach((button) => {
        const ariaLabel = button.getAttribute('aria-label');
        if (ariaLabel && !button.getAttribute('title')) {
          button.setAttribute('title', ariaLabel);
        }
      });
    };

    // Run initially and set up observer for dynamically added buttons
    addTitlesToButtons();

    const observer = new MutationObserver(() => {
      addTitlesToButtons();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  // Handle editor mount
  const handleMount = useCallback((newEditor: Editor) => {
    setEditor(newEditor);
    editorRef.current = newEditor;

    // Load Google Fonts
    loadGoogleFonts();

    // Load saved theme preference from localStorage, default to 'dark'
    const savedTheme = localStorage.getItem('whiteboard-theme') as 'dark' | 'light' | null;
    const initialTheme = savedTheme || 'dark';
    newEditor.user.updateUserPreferences({ colorScheme: initialTheme });

    // Set initial theme attribute on html element (:root) for portal styling
    document.documentElement.setAttribute('data-whiteboard-theme', initialTheme);

    // Listen for theme changes via store and persist to localStorage
    let lastTheme = initialTheme;
    const unsubscribeTheme = newEditor.store.listen(() => {
      const currentTheme = newEditor.user.getUserPreferences().colorScheme;
      if (currentTheme && currentTheme !== lastTheme && (currentTheme === 'dark' || currentTheme === 'light')) {
        lastTheme = currentTheme;
        localStorage.setItem('whiteboard-theme', currentTheme);
        // Update html element (:root) attribute for portal styling
        document.documentElement.setAttribute('data-whiteboard-theme', currentTheme);
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

    // Listen for changes to save (including crops, transforms, etc.)
    const handleChange = () => {
      if (selectedWhiteboardId) {
        const snapshot = getSnapshot(newEditor.store);
        queueSave(selectedWhiteboardId, snapshot);
      }
    };

    // Subscribe to ALL store changes to capture crops and other transformations
    const unsubscribe = newEditor.store.listen(handleChange, {
      source: 'all', // Changed from 'user' to capture all changes including crops
      scope: 'all', // Changed from 'document' to capture all scopes
    });

    // Track cursor position
    const handlePointerMove = (e: PointerEvent) => {
      if (selectedWhiteboardId && containerRef.current) {
        const point = newEditor.screenToPage({ x: e.clientX, y: e.clientY });
        // Convert Vec to plain object for Firebase serialization
        updateCursor(selectedWhiteboardId, { x: point.x, y: point.y });
      }
    };

    const handlePointerLeave = () => {
      if (selectedWhiteboardId) {
        updateCursor(selectedWhiteboardId, null);
      }
    };

    // Handle double-clicks on recording shapes to open videos
    const handleDoubleClick = (e: MouseEvent) => {
      const point = newEditor.screenToPage({ x: e.clientX, y: e.clientY });
      const shape = newEditor.getShapeAtPoint(point);

      if (shape && shape.meta?.isRecording && shape.meta?.recordingUrl) {
        // Prevent text editing
        e.preventDefault();
        e.stopPropagation();
        // Open recording in new tab
        window.open(shape.meta.recordingUrl as string, '_blank');
      }
    };

    containerRef.current?.addEventListener('pointermove', handlePointerMove);
    containerRef.current?.addEventListener('pointerleave', handlePointerLeave);
    containerRef.current?.addEventListener('dblclick', handleDoubleClick);

    return () => {
      unsubscribe();
      unsubscribeTheme();
      containerRef.current?.removeEventListener('pointermove', handlePointerMove);
      containerRef.current?.removeEventListener('pointerleave', handlePointerLeave);
      containerRef.current?.removeEventListener('dblclick', handleDoubleClick);
    };
  }, [selectedWhiteboardId, activeWhiteboard]);

  // Apply custom fonts to text shapes
  useEffect(() => {
    if (!editor) return;

    const applyCustomFonts = () => {
      const shapes = editor.getCurrentPageShapes();
      shapes.forEach((shape) => {
        if ((shape.type === 'text' || shape.type === 'note' || shape.type === 'geo') && shape.meta?.customFont) {
          const customFont = shape.meta.customFont as string;
          const fontValue = `"${customFont}", sans-serif`;

          // Find the rendered text element for this shape
          const shapeElement = document.querySelector(`[data-shape-id="${shape.id}"]`);
          if (shapeElement) {
            // Apply to all text-related elements with !important
            const textElements = shapeElement.querySelectorAll('text, .tl-text-content, .tl-text, .tl-text-shape__wrapper, span, div');
            textElements.forEach((el) => {
              (el as HTMLElement).style.setProperty('font-family', fontValue, 'important');
            });
            // Also apply to editing textarea when double-clicked to edit
            const textInput = shapeElement.querySelector('.tl-text-input');
            if (textInput) {
              (textInput as HTMLElement).style.setProperty('font-family', fontValue, 'important');
            }
          }
          // Also try to find by shape type in SVG
          const svgText = document.querySelector(`g[data-shape-type="${shape.type}"][data-shape-id="${shape.id}"] text`);
          if (svgText) {
            (svgText as SVGElement).style.setProperty('font-family', fontValue, 'important');
          }
        }
      });

      // Also apply font to currently editing shape's textarea
      const editingId = editor.getEditingShapeId();
      if (editingId) {
        const editingShape = editor.getShape(editingId);
        if (editingShape?.meta?.customFont) {
          const customFont = editingShape.meta.customFont as string;
          const fontValue = `"${customFont}", sans-serif`;
          const textInputs = document.querySelectorAll('.tl-text-input');
          textInputs.forEach((input) => {
            (input as HTMLElement).style.setProperty('font-family', fontValue, 'important');
          });
        }
      }
    };

    // Apply fonts initially and on store changes
    const timeoutId = setTimeout(applyCustomFonts, 100);
    const unsubscribeFonts = editor.store.listen(applyCustomFonts, {
      source: 'all',
      scope: 'document',
    });

    // Use MutationObserver to catch when TLDraw re-renders elements
    const canvasElement = document.querySelector('.tl-canvas');
    let observer: MutationObserver | null = null;
    if (canvasElement) {
      observer = new MutationObserver(() => {
        // Debounce the font application
        requestAnimationFrame(applyCustomFonts);
      });
      observer.observe(canvasElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
    }

    return () => {
      clearTimeout(timeoutId);
      unsubscribeFonts();
      if (observer) observer.disconnect();
    };
  }, [editor]);

  // Manage quick action button disabled states based on editor state
  useEffect(() => {
    if (!editor) return;

    const updateButtonStates = () => {
      const canUndo = editor.getCanUndo();
      const canRedo = editor.getCanRedo();
      const hasSelection = editor.getSelectedShapeIds().length > 0;

      // Find buttons in the secondary toolbar using aria-label (more reliable than data-testid)
      // Look in the entire document since tldraw renders these buttons
      const tlContainer = document.querySelector('.tl-container');
      if (!tlContainer) return;

      // Helper function to update button state
      const updateButton = (selector: string, isEnabled: boolean) => {
        const buttons = tlContainer.querySelectorAll(selector);
        buttons.forEach((btn) => {
          const button = btn as HTMLButtonElement;
          if (isEnabled) {
            button.removeAttribute('disabled');
            button.setAttribute('aria-disabled', 'false');
            button.classList.remove('tlui-button--disabled');
          } else {
            button.setAttribute('disabled', 'true');
            button.setAttribute('aria-disabled', 'true');
            button.classList.add('tlui-button--disabled');
          }
        });
      };

      // Update Undo button - disabled when nothing to undo
      updateButton('button[aria-label^="Undo"]', canUndo);
      updateButton('button[data-testid*="undo"]', canUndo);

      // Update Redo button - disabled when nothing to redo
      updateButton('button[aria-label^="Redo"]', canRedo);
      updateButton('button[data-testid*="redo"]', canRedo);

      // Update Delete button - disabled when nothing selected
      updateButton('button[aria-label^="Delete"]', hasSelection);
      updateButton('button[data-testid*="delete"]', hasSelection);

      // Update Duplicate button - disabled when nothing selected
      updateButton('button[aria-label^="Duplicate"]', hasSelection);
      updateButton('button[data-testid*="duplicate"]', hasSelection);
    };

    // Initial update with a small delay to ensure DOM is ready
    const initialTimeout = setTimeout(updateButtonStates, 100);

    // Listen for all store changes (includes history and selection changes)
    const unsubscribe = editor.store.listen(updateButtonStates, {
      source: 'all',
      scope: 'all',
    });

    // Also listen for pointer events to catch selection changes
    const handlePointerUp = () => {
      // Small delay to ensure selection state is updated
      setTimeout(updateButtonStates, 50);
    };
    document.addEventListener('pointerup', handlePointerUp);

    // MutationObserver to handle when tldraw renders/re-renders buttons
    const observer = new MutationObserver(() => {
      updateButtonStates();
    });

    const tlContainerEl = document.querySelector('.tl-container');
    if (tlContainerEl) {
      observer.observe(tlContainerEl, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label', 'data-testid'],
      });
    }

    return () => {
      clearTimeout(initialTimeout);
      unsubscribe();
      document.removeEventListener('pointerup', handlePointerUp);
      observer.disconnect();
    };
  }, [editor]);

  // Export with options - supports PNG, JPG, PDF with quality and background settings
  const handleExport = async (options: ExportOptions) => {
    if (!editor) return;

    try {
      // Get quality scale factor
      const qualityScale = options.quality === 'high' ? 2 : options.quality === 'medium' ? 1.5 : 1;
      const jpgQuality = options.quality === 'high' ? 0.95 : options.quality === 'medium' ? 0.8 : 0.6;

      // Use tldraw's built-in export functionality via getSvgString
      const svg = await editor.getSvgString([...editor.getCurrentPageShapeIds()], {
        scale: qualityScale,
        background: options.includeBackground,
      });
      if (!svg) {
        console.error('Failed to generate SVG');
        return;
      }

      // Convert SVG to image using canvas
      const img = document.createElement('img');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width || 1920;
        canvas.height = img.height || 1080;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Fill background if included
          if (options.includeBackground) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, 0, 0);

          const fileName = activeWhiteboard?.name || 'whiteboard';

          if (options.format === 'pdf') {
            // For PDF, we'll create a data URL and trigger print dialog
            // or export as image that can be converted to PDF
            canvas.toBlob((blob) => {
              if (blob) {
                const url = URL.createObjectURL(blob);
                // Open in new window for print to PDF
                const printWindow = window.open('', '_blank');
                if (printWindow) {
                  printWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <title>${fileName}</title>
                        <style>
                          body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f0f0f0; }
                          img { max-width: 100%; max-height: 100vh; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
                          @media print { body { background: white; } img { box-shadow: none; } }
                        </style>
                      </head>
                      <body>
                        <img src="${url}" alt="${fileName}" />
                        <script>
                          window.onload = function() {
                            setTimeout(function() { window.print(); }, 500);
                          };
                        </script>
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
            // PNG format (default)
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

  // Check if the drag event contains external files (from Explorer)
  const hasExternalFiles = (e: React.DragEvent): boolean => {
    if (e.dataTransfer.types.includes('Files')) {
      // Check if it's not an internal app drag
      const hasAppData = e.dataTransfer.types.includes('application/conceptualize-file');
      return !hasAppData;
    }
    return false;
  };

  // Handle drag enter - show overlay for external files
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;

    if (hasExternalFiles(e) && selectedWhiteboardId) {
      setIsDraggingExternal(true);
    }
  };

  // Handle drag leave - hide overlay when leaving
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;

    // Only hide when all drag events have left
    if (dragCounterRef.current === 0) {
      setIsDraggingExternal(false);
    }
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  // Handle drop from file tree or external files
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingExternal(false);

    if (!editor) return;

    // Skip if Tauri is already handling this drop
    if (isProcessingTauriDrop.current) {
      console.log('[WHITEBOARD] Skipping React drop handler - Tauri is processing');
      return;
    }

    // First check for internal app file drag
    const fileData = e.dataTransfer.getData('application/conceptualize-file');
    if (fileData) {
      try {
        const file: FileTreeDragData = JSON.parse(fileData);
        const point = editor.screenToPage({ x: e.clientX, y: e.clientY });

        // Create a text shape for the dropped file
        editor.createShape({
          type: 'text',
          x: point.x,
          y: point.y,
          props: {
            richText: toRichText(`📄 ${file.name}\n\nPath: ${file.path}`),
          },
        });
      } catch (error) {
        console.error('Failed to handle app file drop:', error);
      }
      return;
    }

    // Handle external file drop (from Explorer)
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const point = editor.screenToPage({ x: e.clientX, y: e.clientY });
    let offsetX = 0;
    let offsetY = 0;

    for (const file of files) {
      const isImage = file.type.startsWith('image/');

      if (isImage && selectedWhiteboardId) {
        // For images, upload to Storage and embed using URL
        try {
          // Upload to Firebase Storage
          const storageUrl = await uploadWhiteboardImage(teamId, selectedWhiteboardId, file, file.name);

          // Create data URL for dimension reading
          const dataUrl = await readFileAsDataUrl(file);
          const img = document.createElement('img');

          await new Promise<void>((resolve) => {
            img.onload = () => {
              const assetId = `asset:${crypto.randomUUID()}` as TLAssetId;

              // Calculate dimensions - scale down if too large
              let width = img.width;
              let height = img.height;
              const maxSize = 600;
              if (width > maxSize || height > maxSize) {
                const scale = maxSize / Math.max(width, height);
                width = width * scale;
                height = height * scale;
              }

              // Create the asset with Storage URL
              editor.createAssets([{
                id: assetId,
                type: 'image',
                typeName: 'asset',
                props: {
                  name: file.name,
                  src: storageUrl, // Use Storage URL instead of data URL
                  w: img.width,
                  h: img.height,
                  mimeType: file.type || 'image/png',
                  isAnimated: file.type === 'image/gif',
                },
                meta: {},
              }]);

              // Then create the image shape referencing the asset
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

              // Offset for next file
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
        // For non-image files, create a reference note
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        let emoji = '📄';
        let color: 'yellow' | 'light-blue' | 'light-violet' | 'light-red' | 'light-green' = 'yellow';

        // Assign emoji and color based on file type
        if (['pdf'].includes(ext)) {
          emoji = '📕';
          color = 'light-red';
        } else if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) {
          emoji = '📝';
          color = 'light-blue';
        } else if (['xls', 'xlsx', 'csv'].includes(ext)) {
          emoji = '📊';
          color = 'light-green';
        } else if (['ppt', 'pptx'].includes(ext)) {
          emoji = '📽️';
          color = 'light-violet';
        } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
          emoji = '📦';
          color = 'yellow';
        } else if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) {
          emoji = '🎵';
          color = 'light-violet';
        } else if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) {
          emoji = '🎬';
          color = 'light-red';
        }

        // Format file size
        const sizeKB = Math.round(file.size / 1024);
        const sizeDisplay = sizeKB > 1024
          ? `${(sizeKB / 1024).toFixed(1)} MB`
          : `${sizeKB} KB`;

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

        // Offset for next file
        offsetX += 220;
        if (offsetX > 800) {
          offsetX = 0;
          offsetY += 150;
        }
      }
    }
  };

  // Helper to read file as data URL
  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="whiteboard-panel">
      {/* Presence indicators - floating overlay */}
      {presence.length > 0 && (
        <div className="whiteboard-presence-overlay">
          <Users size={14} />
          <span>{presence.length} other{presence.length > 1 ? 's' : ''} viewing</span>
          <div className="presence-avatars">
            {presence.slice(0, 5).map((p) => (
              <div
                key={p.userId}
                className="presence-avatar"
                style={{ backgroundColor: p.userColor }}
                title={p.userName}
              >
                {p.userName.charAt(0).toUpperCase()}
              </div>
            ))}
            {presence.length > 5 && (
              <div className="presence-avatar presence-more">
                +{presence.length - 5}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom Floating Toolbar (top center) */}
      {activeWhiteboard && selectedWhiteboardId && (
        <CustomToolbar
          onExport={handleExport}
          onExtractToNote={onExtractToNote ? () => setShowExtractModal(true) : undefined}
          onInsertNoteFile={handleShowInsertNoteFile}
          onInsertTask={handleShowInsertTask}
          onInsertMeeting={handleShowInsertMeeting}
          onInsertRecording={handleShowInsertRecording}
          onInsertMention={onInsertMention}
          editor={editor}
          teamId={teamId}
          whiteboardId={selectedWhiteboardId}
        />
      )}

      {/* Full-screen canvas area */}
      <div
        ref={containerRef}
        className="whiteboard-canvas fullscreen"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drop overlay for external files */}
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
              overrides={customUiOverrides}
              components={customComponents}
              inferDarkMode
            />
          </Tooltip.Provider>
        ) : (
          <div className="whiteboard-empty-state">
            <Palette size={48} strokeWidth={1.5} className="empty-icon" />
            <p>Select a whiteboard from the sidebar to start drawing</p>
          </div>
        )}

        {/* Remote cursors overlay */}
        {presence.map((p) =>
          p.cursor ? (
            <div
              key={p.userId}
              className="remote-cursor"
              style={{
                left: p.cursor.x,
                top: p.cursor.y,
                '--cursor-color': p.userColor,
              } as React.CSSProperties}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill={p.userColor}>
                <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.48 0 .72-.58.38-.92L6.35 2.85a.5.5 0 0 0-.85.36Z" />
              </svg>
              <span className="cursor-label" style={{ backgroundColor: p.userColor }}>
                {p.userName}
              </span>
            </div>
          ) : null
        )}
      </div>

      {/* Extract to note modal */}
      {showExtractModal && activeWhiteboard && onExtractToNote && (
        <ExtractToNoteModal
          whiteboard={activeWhiteboard}
          fileTree={fileTree}
          onClose={() => setShowExtractModal(false)}
          onExtract={onExtractToNote}
        />
      )}

      {/* Insert from app modal */}
      {showInsertModal && (
        <InsertFromAppModal
          isOpen={showInsertModal}
          mode={insertMode}
          fileTree={fileTree as FileTreeItem[]}
          tasks={tasks}
          recordings={recordings}
          onClose={() => setShowInsertModal(false)}
          onInsert={handleInsertContent}
        />
      )}
    </div>
  );
};

export default WhiteboardPanel;
