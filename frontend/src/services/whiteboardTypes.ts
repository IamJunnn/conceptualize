// Whiteboard Types for Conceptualize Team Whiteboards

import { TLEditorSnapshot } from 'tldraw';

// Main whiteboard document
export interface Whiteboard {
  id: string;
  teamId: string;
  name: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  thumbnail?: string; // Base64 preview image
  data?: TLEditorSnapshot; // tldraw document data
}

// Whiteboard metadata (without full data, for listing)
export interface WhiteboardMeta {
  id: string;
  teamId: string;
  name: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  thumbnail?: string;
}

// User presence on whiteboard (for real-time cursors)
export interface WhiteboardPresence {
  userId: string;
  userName: string;
  userColor: string; // Hex color for cursor
  cursor: {
    x: number;
    y: number;
  } | null;
  lastActive: Date;
}

// Embedded note shape data
export interface NoteEmbedData {
  noteId: string; // Google Drive file ID or path
  notePath: string;
  noteName: string;
  preview?: string; // First few lines of content
}

// Embedded file shape data
export interface FileEmbedData {
  fileId: string; // Google Drive file ID or path
  filePath: string;
  fileName: string;
  fileType: 'image' | 'pdf' | 'document' | 'spreadsheet' | 'presentation' | 'other';
  thumbnailUrl?: string;
}

// Extract to note options
export interface ExtractOptions {
  whiteboardId: string;
  selectedOnly: boolean; // Extract only selected items or entire whiteboard
  targetPath: string; // Folder path to save the note
  fileName: string; // Output file name
  convertLinksToWikiLinks: boolean; // Convert connections to [[wiki-links]]
  includeEmbeddedContent: boolean; // Include content from embedded notes
  includeImages: boolean; // Include images as attachments
}

// Extracted content structure
export interface ExtractedContent {
  title: string;
  sections: ExtractedSection[];
  connections: ExtractedConnection[];
  images: ExtractedImage[];
}

export interface ExtractedSection {
  id: string;
  type: 'text' | 'note' | 'file';
  title?: string;
  content: string;
  position: { x: number; y: number };
}

export interface ExtractedConnection {
  fromId: string;
  toId: string;
  label?: string;
}

export interface ExtractedImage {
  id: string;
  dataUrl: string;
  fileName: string;
}

// Whiteboard creation input
export interface CreateWhiteboardInput {
  name: string;
  teamId: string;
  createdBy: string;
  createdByName: string;
}

// Whiteboard update input
export interface UpdateWhiteboardInput {
  name?: string;
  data?: TLEditorSnapshot;
  thumbnail?: string;
}

// Drag and drop data from file tree
export interface FileTreeDragData {
  path: string;
  name: string;
  type: 'file' | 'folder';
  id?: string; // Google Drive file ID
  mimeType?: string;
}

// Custom shape types for tldraw
export type CustomShapeType = 'note-embed' | 'file-embed';

// Whiteboard toolbar options
export interface ToolbarConfig {
  showShapes: boolean;
  showText: boolean;
  showArrows: boolean;
  showFreehand: boolean;
  showColors: boolean;
  showFonts: boolean;
  availableFonts: string[];
}

// Default fonts available in whiteboard
export const WHITEBOARD_FONTS = [
  { name: 'Sans Serif', value: 'sans-serif' },
  { name: 'Serif', value: 'serif' },
  { name: 'Monospace', value: 'monospace' },
  { name: 'Comic Sans', value: '"Comic Sans MS", cursive' },
  { name: 'Georgia', value: 'Georgia, serif' },
  { name: 'Verdana', value: 'Verdana, sans-serif' },
  { name: 'Courier', value: '"Courier New", monospace' },
  { name: 'Impact', value: 'Impact, sans-serif' },
];

// Whiteboard color palette
export const WHITEBOARD_COLORS = [
  { name: 'Black', value: '#1e1e1e' },
  { name: 'White', value: '#ffffff' },
  { name: 'Gray', value: '#9ca3af' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
];

// User cursor colors for presence
export const PRESENCE_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#8b5cf6', // Violet
  '#f43f5e', // Rose
];

// Get a consistent color for a user based on their ID
export function getUserPresenceColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}
