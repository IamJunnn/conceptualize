/**
 * Local Whiteboard Service
 * Handles local filesystem operations for whiteboards (no Firebase/team sync)
 */

import { invoke } from '@tauri-apps/api/core';
import { TLEditorSnapshot } from 'tldraw';

// Whiteboard metadata
export interface LocalWhiteboard {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  thumbnail?: string;
}

// Full whiteboard with data
export interface LocalWhiteboardWithData extends LocalWhiteboard {
  data?: TLEditorSnapshot;
}

// Metadata file structure
interface WhiteboardsMetadata {
  whiteboards: LocalWhiteboard[];
  lastUpdated: string;
}

const WHITEBOARDS_FOLDER = '.whiteboards';
const METADATA_FILE = 'whiteboards.json';
const ASSETS_FOLDER = 'assets';

// Get the whiteboards directory path
function getWhiteboardsPath(rootPath: string): string {
  const separator = rootPath.includes('\\') ? '\\' : '/';
  return `${rootPath}${separator}${WHITEBOARDS_FOLDER}`;
}

// Get metadata file path
function getMetadataPath(rootPath: string): string {
  const separator = rootPath.includes('\\') ? '\\' : '/';
  return `${getWhiteboardsPath(rootPath)}${separator}${METADATA_FILE}`;
}

// Get whiteboard file path
function getWhiteboardFilePath(rootPath: string, whiteboardId: string): string {
  const separator = rootPath.includes('\\') ? '\\' : '/';
  return `${getWhiteboardsPath(rootPath)}${separator}${whiteboardId}.tldr`;
}

// Get assets folder path
function getAssetsPath(rootPath: string): string {
  const separator = rootPath.includes('\\') ? '\\' : '/';
  return `${getWhiteboardsPath(rootPath)}${separator}${ASSETS_FOLDER}`;
}

// Ensure whiteboards directory exists
async function ensureWhiteboardsDirectory(rootPath: string): Promise<void> {
  try {
    const whiteboardsPath = getWhiteboardsPath(rootPath);
    const assetsPath = getAssetsPath(rootPath);

    // Create directories if they don't exist
    await invoke('create_directory', { path: whiteboardsPath });
    await invoke('create_directory', { path: assetsPath });
  } catch (error) {
    console.error('Failed to create whiteboards directory:', error);
  }
}

// Load metadata file
async function loadMetadata(rootPath: string): Promise<WhiteboardsMetadata> {
  try {
    const metadataPath = getMetadataPath(rootPath);
    const content = await invoke<string>('read_file', { filePath: metadataPath });
    return JSON.parse(content);
  } catch {
    // Return empty metadata if file doesn't exist
    return { whiteboards: [], lastUpdated: new Date().toISOString() };
  }
}

// Save metadata file
async function saveMetadata(rootPath: string, metadata: WhiteboardsMetadata): Promise<void> {
  try {
    await ensureWhiteboardsDirectory(rootPath);
    const metadataPath = getMetadataPath(rootPath);
    await invoke('write_file', {
      filePath: metadataPath,
      content: JSON.stringify(metadata, null, 2),
    });
  } catch (error) {
    console.error('Failed to save metadata:', error);
    throw error;
  }
}

// Generate a unique ID
function generateId(): string {
  return `wb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all whiteboards (metadata only)
 */
export async function getLocalWhiteboards(rootPath: string): Promise<LocalWhiteboard[]> {
  const metadata = await loadMetadata(rootPath);
  return metadata.whiteboards.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Get a single whiteboard with its data
 */
export async function getLocalWhiteboard(
  rootPath: string,
  whiteboardId: string
): Promise<LocalWhiteboardWithData | null> {
  try {
    const metadata = await loadMetadata(rootPath);
    const whiteboardMeta = metadata.whiteboards.find((w) => w.id === whiteboardId);

    if (!whiteboardMeta) {
      return null;
    }

    // Load the whiteboard data
    const filePath = getWhiteboardFilePath(rootPath, whiteboardId);
    try {
      const content = await invoke<string>('read_file', { filePath });
      const data = JSON.parse(content) as TLEditorSnapshot;
      return { ...whiteboardMeta, data };
    } catch {
      // Return metadata without data if file doesn't exist
      return { ...whiteboardMeta };
    }
  } catch (error) {
    console.error('Failed to get whiteboard:', error);
    return null;
  }
}

/**
 * Create a new whiteboard
 */
export async function createLocalWhiteboard(
  rootPath: string,
  name: string
): Promise<LocalWhiteboard> {
  await ensureWhiteboardsDirectory(rootPath);

  const id = generateId();
  const now = new Date().toISOString();

  const whiteboard: LocalWhiteboard = {
    id,
    name,
    createdAt: now,
    updatedAt: now,
  };

  // Update metadata
  const metadata = await loadMetadata(rootPath);
  metadata.whiteboards.push(whiteboard);
  metadata.lastUpdated = now;
  await saveMetadata(rootPath, metadata);

  return whiteboard;
}

/**
 * Create an untitled whiteboard
 */
export async function createUntitledLocalWhiteboard(rootPath: string): Promise<LocalWhiteboard> {
  const metadata = await loadMetadata(rootPath);

  // Find the next available "Untitled Whiteboard X" number
  const untitledPattern = /^Untitled Whiteboard(?: (\d+))?$/;
  let maxNumber = 0;

  metadata.whiteboards.forEach((wb) => {
    const match = wb.name.match(untitledPattern);
    if (match) {
      const num = match[1] ? parseInt(match[1], 10) : 1;
      maxNumber = Math.max(maxNumber, num);
    }
  });

  const newName = maxNumber === 0 ? 'Untitled Whiteboard' : `Untitled Whiteboard ${maxNumber + 1}`;
  return createLocalWhiteboard(rootPath, newName);
}

/**
 * Update whiteboard data
 */
export async function updateLocalWhiteboard(
  rootPath: string,
  whiteboardId: string,
  data: TLEditorSnapshot,
  thumbnail?: string
): Promise<void> {
  try {
    await ensureWhiteboardsDirectory(rootPath);

    // Save the whiteboard data
    const filePath = getWhiteboardFilePath(rootPath, whiteboardId);
    await invoke('write_file', {
      filePath,
      content: JSON.stringify(data),
    });

    // Update metadata
    const metadata = await loadMetadata(rootPath);
    const now = new Date().toISOString();

    const whiteboardIndex = metadata.whiteboards.findIndex((w) => w.id === whiteboardId);
    if (whiteboardIndex !== -1) {
      metadata.whiteboards[whiteboardIndex].updatedAt = now;
      if (thumbnail) {
        metadata.whiteboards[whiteboardIndex].thumbnail = thumbnail;
      }
      metadata.lastUpdated = now;
      await saveMetadata(rootPath, metadata);
    }
  } catch (error) {
    console.error('Failed to update whiteboard:', error);
    throw error;
  }
}

/**
 * Rename a whiteboard
 */
export async function renameLocalWhiteboard(
  rootPath: string,
  whiteboardId: string,
  newName: string
): Promise<void> {
  const metadata = await loadMetadata(rootPath);
  const now = new Date().toISOString();

  const whiteboardIndex = metadata.whiteboards.findIndex((w) => w.id === whiteboardId);
  if (whiteboardIndex !== -1) {
    metadata.whiteboards[whiteboardIndex].name = newName;
    metadata.whiteboards[whiteboardIndex].updatedAt = now;
    metadata.lastUpdated = now;
    await saveMetadata(rootPath, metadata);
  }
}

/**
 * Delete a whiteboard
 */
export async function deleteLocalWhiteboard(
  rootPath: string,
  whiteboardId: string
): Promise<void> {
  try {
    // Delete the whiteboard file
    const filePath = getWhiteboardFilePath(rootPath, whiteboardId);
    try {
      await invoke('delete_file', { filePath });
    } catch {
      // File might not exist, ignore
    }

    // Update metadata
    const metadata = await loadMetadata(rootPath);
    metadata.whiteboards = metadata.whiteboards.filter((w) => w.id !== whiteboardId);
    metadata.lastUpdated = new Date().toISOString();
    await saveMetadata(rootPath, metadata);
  } catch (error) {
    console.error('Failed to delete whiteboard:', error);
    throw error;
  }
}

/**
 * Save an image to the local assets folder
 * Returns the local file path
 */
export async function saveLocalWhiteboardImage(
  rootPath: string,
  imageBlob: Blob,
  fileName: string
): Promise<string> {
  try {
    await ensureWhiteboardsDirectory(rootPath);

    const assetsPath = getAssetsPath(rootPath);
    const separator = rootPath.includes('\\') ? '\\' : '/';

    // Generate unique filename
    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}_${fileName}`;
    const filePath = `${assetsPath}${separator}${uniqueFileName}`;

    // Convert blob to base64 and save
    const arrayBuffer = await imageBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    await invoke('write_binary_file', {
      filePath,
      content: Array.from(uint8Array),
    });

    return filePath;
  } catch (error) {
    console.error('Failed to save whiteboard image:', error);
    throw error;
  }
}

/**
 * Debounced save functionality
 */
let saveTimeout: NodeJS.Timeout | null = null;
let pendingSave: { rootPath: string; whiteboardId: string; data: TLEditorSnapshot } | null = null;

export function queueLocalSave(
  rootPath: string,
  whiteboardId: string,
  data: TLEditorSnapshot
): void {
  pendingSave = { rootPath, whiteboardId, data };

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(async () => {
    if (pendingSave) {
      try {
        await updateLocalWhiteboard(
          pendingSave.rootPath,
          pendingSave.whiteboardId,
          pendingSave.data
        );
        console.log('[LocalWhiteboard] Auto-saved');
      } catch (error) {
        console.error('[LocalWhiteboard] Auto-save failed:', error);
      }
      pendingSave = null;
    }
  }, 1000); // Save after 1 second of no changes
}

/**
 * Flush any pending saves immediately
 */
export async function flushLocalPendingSaves(): Promise<void> {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }

  if (pendingSave) {
    try {
      await updateLocalWhiteboard(
        pendingSave.rootPath,
        pendingSave.whiteboardId,
        pendingSave.data
      );
      console.log('[LocalWhiteboard] Flushed pending save');
    } catch (error) {
      console.error('[LocalWhiteboard] Flush save failed:', error);
    }
    pendingSave = null;
  }
}
