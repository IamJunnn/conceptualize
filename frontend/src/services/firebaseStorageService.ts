/**
 * Firebase Cloud Storage Service for Team Files
 * Replaces Google Drive for team file storage to avoid permission issues
 */

import { storage } from './firebase';
import { getErrorMessage, getErrorCode } from '../utils/errorUtils';
import {
  ref,
  uploadString,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  listAll,
  getMetadata,
} from 'firebase/storage';

export interface StorageFile {
  id: string;           // Full path as ID
  name: string;         // File name
  fullPath: string;     // Full storage path
  isFolder: boolean;
  size?: number;
  contentType?: string;
  modifiedTime?: string;
  downloadUrl?: string;
  lastEditedBy?: string; // Email of user who last edited the file
}

// ============ CACHING LAYER ============
// Two-tier cache: Memory (fast) + IndexedDB (persistent)
import {
  getCachedFileList as getIndexedDBFileList,
  setCachedFileList as setIndexedDBFileList,
  invalidateFileList as invalidateIndexedDBFileList,
  getCachedFileContent as getIndexedDBFileContent,
  setCachedFileContent as setIndexedDBFileContent,
  invalidateFileContent as invalidateIndexedDBFileContent,
  getCachedMetadata,
  setCachedMetadata,
  invalidateMetadata,
  getCachedDownloadUrl,
  setCachedDownloadUrl,
  invalidateDownloadUrl,
  type CachedMetadata,
} from './cacheService';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const FILE_LIST_CACHE_DURATION = 60000; // 1 minute for memory cache (IndexedDB has its own duration)
const memoryCache = new Map<string, CacheEntry<StorageFile[]>>();

// Development mode flag for verbose logging
const isDev = import.meta.env.DEV;

// Memory cache for fast access (cleared on refresh)
function getMemoryCachedFileList(cacheKey: string): StorageFile[] | null {
  const entry = memoryCache.get(cacheKey);
  if (entry && Date.now() - entry.timestamp < FILE_LIST_CACHE_DURATION) {
    if (isDev) console.log(`[FirebaseStorage] Memory cache hit for: ${cacheKey}`);
    return entry.data;
  }
  if (entry) {
    memoryCache.delete(cacheKey); // Clean up expired entry
  }
  return null;
}

function setMemoryCachedFileList(cacheKey: string, data: StorageFile[]): void {
  memoryCache.set(cacheKey, { data, timestamp: Date.now() });
}

// Two-tier cache getter: Memory first, then IndexedDB
async function getCachedFileList(cacheKey: string, teamId: string): Promise<StorageFile[] | null> {
  // Try memory cache first (fastest)
  const memoryResult = getMemoryCachedFileList(cacheKey);
  if (memoryResult) {
    return memoryResult;
  }

  // Try IndexedDB cache (persistent across refreshes)
  try {
    const indexedDBResult = await getIndexedDBFileList(teamId, cacheKey);
    if (indexedDBResult) {
      // Populate memory cache from IndexedDB
      setMemoryCachedFileList(cacheKey, indexedDBResult.data.files as StorageFile[]);
      if (isDev) console.log(`[FirebaseStorage] IndexedDB cache hit for: ${cacheKey} (stale: ${indexedDBResult.isStale})`);
      return indexedDBResult.data.files as StorageFile[];
    }
  } catch (e) {
    console.warn('[FirebaseStorage] IndexedDB cache error:', e);
  }

  return null;
}

// Two-tier cache setter
async function setCachedFileList(cacheKey: string, data: StorageFile[], teamId: string): Promise<void> {
  // Update memory cache
  setMemoryCachedFileList(cacheKey, data);

  // Update IndexedDB cache (async, don't wait)
  setIndexedDBFileList(teamId, cacheKey, { files: data }).catch(e => {
    console.warn('[FirebaseStorage] IndexedDB cache set error:', e);
  });
}

// Invalidate cache for a team (call after create/delete/rename operations)
export function invalidateTeamCache(teamId: string): void {
  // Clear memory cache
  const keysToDelete: string[] = [];
  for (const key of memoryCache.keys()) {
    if (key.startsWith(`team:${teamId}`)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => memoryCache.delete(key));

  // Clear IndexedDB caches (async, don't wait)
  invalidateIndexedDBFileList(teamId).catch(e => {
    console.warn('[FirebaseStorage] IndexedDB file list cache invalidate error:', e);
  });
  invalidateMetadata(teamId).catch(e => {
    console.warn('[FirebaseStorage] Metadata cache invalidate error:', e);
  });
  invalidateDownloadUrl(teamId).catch(e => {
    console.warn('[FirebaseStorage] Download URL cache invalidate error:', e);
  });

  if (isDev) console.log(`[FirebaseStorage] All caches invalidated for team: ${teamId}`);
}

// File content cache helpers
export async function getCachedContent(teamId: string, filePath: string): Promise<string | null> {
  try {
    const result = await getIndexedDBFileContent(teamId, filePath);
    if (result) {
      if (isDev) console.log(`[FirebaseStorage] Content cache hit for: ${filePath} (stale: ${result.isStale})`);
      return result.content;
    }
  } catch (e) {
    console.warn('[FirebaseStorage] Content cache get error:', e);
  }
  return null;
}

export async function setCachedContent(teamId: string, filePath: string, content: string): Promise<void> {
  try {
    await setIndexedDBFileContent(teamId, filePath, content);
  } catch (e) {
    console.warn('[FirebaseStorage] Content cache set error:', e);
  }
}

export function invalidateContentCache(teamId: string, filePath: string): void {
  invalidateIndexedDBFileContent(teamId, filePath).catch(e => {
    console.warn('[FirebaseStorage] Content cache invalidate error:', e);
  });
}
// ============ END CACHING LAYER ============

/**
 * Get the storage path for a team's files
 */
function getTeamPath(teamId: string, path: string = ''): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return cleanPath ? `teams/${teamId}/${cleanPath}` : `teams/${teamId}`;
}

/**
 * Upload a file to team storage
 */
export async function uploadFile(
  teamId: string,
  filePath: string,
  content: string,
  contentType: string = 'text/markdown',
  editorEmail?: string
): Promise<StorageFile> {
  const fullPath = getTeamPath(teamId, filePath);
  const fileRef = ref(storage, fullPath);

  if (isDev) console.log(`[FirebaseStorage] Uploading file: ${fullPath}`);

  // Build custom metadata
  const customMetadata: Record<string, string> = {
    updatedAt: new Date().toISOString(),
  };
  if (editorEmail) {
    customMetadata.lastEditedBy = editorEmail;
  }

  // Upload as string (for text files like markdown)
  await uploadString(fileRef, content, 'raw', {
    contentType,
    customMetadata,
  });

  // Get download URL
  const downloadUrl = await getDownloadURL(fileRef);

  if (isDev) console.log(`[FirebaseStorage] File uploaded: ${fullPath}`);

  // Invalidate file list cache since file list changed
  invalidateTeamCache(teamId);

  // Update content cache with new content (instant access on next load)
  setCachedContent(teamId, filePath, content);

  return {
    id: fullPath,
    name: filePath.split('/').pop() || filePath,
    fullPath,
    isFolder: false,
    contentType,
    downloadUrl,
    modifiedTime: new Date().toISOString(),
  };
}

/**
 * Upload a binary file (images, PDFs, etc.) to team storage
 */
export async function uploadBinaryFile(
  teamId: string,
  filePath: string,
  data: Uint8Array | Blob,
  contentType: string
): Promise<StorageFile> {
  const fullPath = getTeamPath(teamId, filePath);
  const fileRef = ref(storage, fullPath);

  if (isDev) console.log(`[FirebaseStorage] Uploading binary file: ${fullPath}`);

  // Upload as bytes (for binary files like images, PDFs)
  await uploadBytes(fileRef, data, {
    contentType,
    customMetadata: {
      updatedAt: new Date().toISOString(),
    },
  });

  // Get download URL
  const downloadUrl = await getDownloadURL(fileRef);

  if (isDev) console.log(`[FirebaseStorage] Binary file uploaded: ${fullPath}`);

  // Invalidate cache since file list changed
  invalidateTeamCache(teamId);

  return {
    id: fullPath,
    name: filePath.split('/').pop() || filePath,
    fullPath,
    isFolder: false,
    contentType,
    downloadUrl,
    modifiedTime: new Date().toISOString(),
  };
}

/**
 * Download a file from team storage
 * Uses getDownloadURL to get a signed URL with token, which bypasses CORS issues
 * Implements two-tier caching for instant loading
 */
export async function downloadFile(teamId: string, filePath: string): Promise<string> {
  const fullPath = getTeamPath(teamId, filePath);
  const fileRef = ref(storage, fullPath);

  // Check content cache first (IndexedDB)
  const cachedContent = await getCachedContent(teamId, filePath);
  if (cachedContent !== null) {
    if (isDev) console.log(`[FirebaseStorage] Content cache hit for: ${filePath}`);
    return cachedContent;
  }

  if (isDev) console.log(`[FirebaseStorage] Downloading file: ${fullPath}`);

  try {
    // Get download URL with access token - this bypasses CORS
    const downloadUrl = await getDownloadURL(fileRef);

    if (isDev) console.log(`[FirebaseStorage] Got download URL for: ${fullPath}`);

    // Fetch the content using the signed URL
    const response = await fetch(downloadUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const content = await response.text();

    if (isDev) console.log(`[FirebaseStorage] Downloaded ${content.length} bytes from ${fullPath}`);

    // Cache the content for future use (async, don't wait)
    setCachedContent(teamId, filePath, content);

    return content;
  } catch (error) {
    console.error(`[FirebaseStorage] Download error for ${fullPath}:`, getErrorCode(error), getErrorMessage(error));

    if (getErrorCode(error) === 'storage/object-not-found') {
      throw new Error(`File not found: ${filePath}`);
    }
    if (getErrorCode(error) === 'storage/unauthorized' || getErrorCode(error) === 'storage/unauthenticated') {
      throw new Error(`Permission denied: You don't have access to this file. Please ensure you're signed in and have team access.`);
    }
    throw error;
  }
}

/**
 * Download a file as a Blob from team storage
 * Used for binary files like images
 */
export async function downloadFileAsBlob(teamId: string, filePath: string): Promise<Blob> {
  const fullPath = getTeamPath(teamId, filePath);
  const fileRef = ref(storage, fullPath);

  if (isDev) console.log(`[FirebaseStorage] Downloading file as blob: ${fullPath}`);

  try {
    // Get download URL with access token - this bypasses CORS
    const downloadUrl = await getDownloadURL(fileRef);

    if (isDev) console.log(`[FirebaseStorage] Got download URL for blob: ${fullPath}`);

    // Fetch the content using the signed URL
    const response = await fetch(downloadUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();

    if (isDev) console.log(`[FirebaseStorage] Downloaded blob ${blob.size} bytes from ${fullPath}`);

    return blob;
  } catch (error) {
    console.error(`[FirebaseStorage] Download blob error for ${fullPath}:`, getErrorCode(error), getErrorMessage(error));

    if (getErrorCode(error) === 'storage/object-not-found') {
      throw new Error(`File not found: ${filePath}`);
    }
    if (getErrorCode(error) === 'storage/unauthorized' || getErrorCode(error) === 'storage/unauthenticated') {
      throw new Error(`Permission denied: You don't have access to this file. Please ensure you're signed in and have team access.`);
    }
    throw error;
  }
}

/**
 * Delete a file from team storage
 */
export async function deleteFile(teamId: string, filePath: string): Promise<void> {
  const fullPath = getTeamPath(teamId, filePath);
  const fileRef = ref(storage, fullPath);

  if (isDev) console.log(`[FirebaseStorage] Deleting file: ${fullPath}`);

  try {
    await deleteObject(fileRef);
    if (isDev) console.log(`[FirebaseStorage] File deleted: ${fullPath}`);

    // Invalidate caches
    invalidateTeamCache(teamId);
    invalidateContentCache(teamId, filePath);
  } catch (error) {
    if (getErrorCode(error) === 'storage/object-not-found') {
      console.warn(`[FirebaseStorage] File not found (already deleted?): ${fullPath}`);
      return;
    }
    throw error;
  }
}

/**
 * Delete a folder and all its contents recursively
 */
export async function deleteFolder(teamId: string, folderPath: string): Promise<void> {
  const fullPath = getTeamPath(teamId, folderPath);
  const folderRef = ref(storage, fullPath);

  if (isDev) console.log(`[FirebaseStorage] Deleting folder: ${fullPath}`);

  try {
    const result = await listAll(folderRef);

    // Delete all files in this folder
    const deletePromises = result.items.map(item => deleteObject(item));

    // Recursively delete subfolders
    const subfolderPromises = result.prefixes.map(async (prefix) => {
      const subPath = prefix.fullPath.replace(`teams/${teamId}/`, '');
      await deleteFolder(teamId, subPath);
    });

    await Promise.all([...deletePromises, ...subfolderPromises]);

    if (isDev) console.log(`[FirebaseStorage] Folder deleted: ${fullPath}`);

    // Invalidate cache since file list changed
    invalidateTeamCache(teamId);
  } catch (error) {
    console.error(`[FirebaseStorage] Failed to delete folder: ${fullPath}`, error);
    throw error;
  }
}

/**
 * List all files and folders in a team's storage path
 * Optimized with parallel metadata fetching
 */
export async function listFiles(
  teamId: string,
  folderPath: string = ''
): Promise<StorageFile[]> {
  const fullPath = getTeamPath(teamId, folderPath);
  const cacheKey = `team:${teamId}:folder:${folderPath}`;

  // Check cache first (two-tier: memory + IndexedDB)
  const cached = await getCachedFileList(cacheKey, teamId);
  if (cached) {
    return cached;
  }

  const folderRef = ref(storage, fullPath);

  if (isDev) console.log(`[FirebaseStorage] Listing files in: ${fullPath}`);

  try {
    const result = await listAll(folderRef);
    const files: StorageFile[] = [];

    // Add folders (prefixes) - no async needed
    for (const prefix of result.prefixes) {
      files.push({
        id: prefix.fullPath,
        name: prefix.name,
        fullPath: prefix.fullPath,
        isFolder: true,
      });
    }

    // Fetch file metadata in parallel - with caching to reduce API calls
    const filePromises = result.items.map(async (item) => {
      try {
        // Check caches first (30-45 min TTL)
        const [cachedMeta, cachedUrl] = await Promise.all([
          getCachedMetadata(teamId, item.fullPath),
          getCachedDownloadUrl(teamId, item.fullPath),
        ]);

        let metadata: CachedMetadata;
        let downloadUrl: string;

        // Use cached data if available and not stale
        if (cachedMeta && !cachedMeta.isStale && cachedUrl && !cachedUrl.isStale) {
          metadata = cachedMeta.data;
          downloadUrl = cachedUrl.url;
          if (isDev) console.log(`[FirebaseStorage] Cache hit for: ${item.name}`);
        } else {
          // Fetch fresh data from Firebase
          const [freshMeta, freshUrl] = await Promise.all([
            getMetadata(item),
            getDownloadURL(item),
          ]);

          metadata = {
            size: freshMeta.size,
            contentType: freshMeta.contentType,
            updated: freshMeta.updated,
            customMetadata: freshMeta.customMetadata,
          };
          downloadUrl = freshUrl;

          // Cache for next time (async, don't wait)
          setCachedMetadata(teamId, item.fullPath, metadata).catch(() => {});
          setCachedDownloadUrl(teamId, item.fullPath, downloadUrl).catch(() => {});
        }

        return {
          id: item.fullPath,
          name: item.name,
          fullPath: item.fullPath,
          isFolder: false,
          size: metadata.size,
          contentType: metadata.contentType,
          modifiedTime: metadata.updated,
          downloadUrl,
          lastEditedBy: metadata.customMetadata?.lastEditedBy,
        } as StorageFile;
      } catch (error) {
        console.warn(`[FirebaseStorage] Failed to get metadata for ${item.fullPath}:`, error);
        return {
          id: item.fullPath,
          name: item.name,
          fullPath: item.fullPath,
          isFolder: false,
        } as StorageFile;
      }
    });

    const fileResults = await Promise.all(filePromises);
    files.push(...fileResults);

    console.log(`[FirebaseStorage] Found ${files.length} items in ${fullPath}`);

    // Cache the results (two-tier: memory + IndexedDB)
    await setCachedFileList(cacheKey, files, teamId);

    return files;
  } catch (error) {
    console.error(`[FirebaseStorage] Failed to list files: ${fullPath}`, getErrorCode(error), getErrorMessage(error));
    if (getErrorCode(error) === 'storage/object-not-found') {
      return [];
    }
    if (getErrorCode(error) === 'storage/unauthorized' || getErrorCode(error) === 'storage/unauthenticated') {
      throw new Error(`Permission denied: You don't have access to this team's files. Please ensure you're signed in and have team access.`);
    }
    throw error;
  }
}

/**
 * List files with Stale-While-Revalidate pattern
 * Returns cached data immediately (even if stale) while refreshing in background
 * This provides instant UI while ensuring data freshness
 */
export async function listFilesWithSWR(
  teamId: string,
  folderPath: string = '',
  onUpdate?: (files: StorageFile[]) => void
): Promise<StorageFile[]> {
  const cacheKey = `team:${teamId}:folder:${folderPath}`;

  // Try to get cached data first
  const cached = await getCachedFileList(cacheKey, teamId);

  if (cached) {
    // Return cached data immediately
    if (isDev) console.log(`[FirebaseStorage] SWR: Returning cached data for ${folderPath}`);

    // Refresh in background (don't await)
    listFilesForce(teamId, folderPath).then(freshFiles => {
      // Check if data changed
      const hasChanged = JSON.stringify(cached) !== JSON.stringify(freshFiles);
      if (hasChanged && onUpdate) {
        if (isDev) console.log(`[FirebaseStorage] SWR: Background refresh found changes for ${folderPath}`);
        onUpdate(freshFiles);
      }
    }).catch(err => {
      console.warn('[FirebaseStorage] SWR background refresh failed:', err);
    });

    return cached;
  }

  // No cache, fetch fresh
  return listFilesForce(teamId, folderPath);
}

/**
 * Force fetch files from Firebase (bypasses cache)
 * Used internally for SWR background refresh
 */
async function listFilesForce(
  teamId: string,
  folderPath: string = ''
): Promise<StorageFile[]> {
  const fullPath = getTeamPath(teamId, folderPath);
  const cacheKey = `team:${teamId}:folder:${folderPath}`;
  const folderRef = ref(storage, fullPath);

  if (isDev) console.log(`[FirebaseStorage] Force fetching files in: ${fullPath}`);

  try {
    const result = await listAll(folderRef);
    const files: StorageFile[] = [];

    // Add folders
    for (const prefix of result.prefixes) {
      files.push({
        id: prefix.fullPath,
        name: prefix.name,
        fullPath: prefix.fullPath,
        isFolder: true,
      });
    }

    // Fetch file metadata
    const filePromises = result.items.map(async (item) => {
      try {
        const [freshMeta, freshUrl] = await Promise.all([
          getMetadata(item),
          getDownloadURL(item),
        ]);

        const metadata: CachedMetadata = {
          size: freshMeta.size,
          contentType: freshMeta.contentType,
          updated: freshMeta.updated,
          customMetadata: freshMeta.customMetadata,
        };

        // Cache metadata and URL for future use
        setCachedMetadata(teamId, item.fullPath, metadata).catch(() => {});
        setCachedDownloadUrl(teamId, item.fullPath, freshUrl).catch(() => {});

        return {
          id: item.fullPath,
          name: item.name,
          fullPath: item.fullPath,
          isFolder: false,
          size: metadata.size,
          contentType: metadata.contentType,
          modifiedTime: metadata.updated,
          downloadUrl: freshUrl,
          lastEditedBy: metadata.customMetadata?.lastEditedBy,
        } as StorageFile;
      } catch (error) {
        console.warn(`[FirebaseStorage] Failed to get metadata for ${item.fullPath}:`, error);
        return {
          id: item.fullPath,
          name: item.name,
          fullPath: item.fullPath,
          isFolder: false,
        } as StorageFile;
      }
    });

    const fileResults = await Promise.all(filePromises);
    files.push(...fileResults);

    // Update cache
    await setCachedFileList(cacheKey, files, teamId);

    return files;
  } catch (error) {
    console.error(`[FirebaseStorage] Failed to force list files: ${fullPath}`, error);
    throw error;
  }
}

/**
 * List all files recursively in a team's storage
 * Uses caching to avoid repeated API calls
 */
export async function listAllFilesRecursive(
  teamId: string,
  folderPath: string = ''
): Promise<StorageFile[]> {
  const cacheKey = `team:${teamId}:recursive:${folderPath}`;

  // Check cache first (two-tier: memory + IndexedDB)
  const cached = await getCachedFileList(cacheKey, teamId);
  if (cached) {
    return cached;
  }

  const allFiles: StorageFile[] = [];

  async function listRecursive(currentPath: string) {
    const files = await listFiles(teamId, currentPath);

    for (const file of files) {
      allFiles.push(file);

      if (file.isFolder) {
        const relativePath = file.fullPath.replace(`teams/${teamId}/`, '');
        await listRecursive(relativePath);
      }
    }
  }

  await listRecursive(folderPath);

  // Cache the recursive results (two-tier: memory + IndexedDB)
  await setCachedFileList(cacheKey, allFiles, teamId);

  return allFiles;
}

/**
 * Create a folder marker (Firebase Storage doesn't have real folders)
 * We create a .folder marker file to represent empty folders
 */
export async function createFolder(teamId: string, folderPath: string): Promise<void> {
  // Firebase Storage doesn't have real folders - they're created implicitly when files are uploaded
  // To create an "empty" folder, we upload a placeholder file
  const markerPath = `${folderPath}/.folder`;
  const fullPath = getTeamPath(teamId, markerPath);
  const markerRef = ref(storage, fullPath);

  console.log(`[FirebaseStorage] Creating folder marker: ${fullPath}`);

  await uploadString(markerRef, '', 'raw', {
    contentType: 'application/x-folder-marker',
    customMetadata: {
      isFolder: 'true',
      createdAt: new Date().toISOString(),
    },
  });

  console.log(`[FirebaseStorage] Folder created: ${folderPath}`);

  // Invalidate cache since file list changed
  invalidateTeamCache(teamId);
}

/**
 * Move/rename a file
 */
export async function moveFile(
  teamId: string,
  oldPath: string,
  newPath: string
): Promise<void> {
  console.log(`[FirebaseStorage] Moving file: ${oldPath} -> ${newPath}`);

  // Firebase Storage doesn't support move, so we copy and delete
  const content = await downloadFile(teamId, oldPath);
  await uploadFile(teamId, newPath, content);
  await deleteFile(teamId, oldPath);

  console.log(`[FirebaseStorage] File moved: ${oldPath} -> ${newPath}`);

  // Cache already invalidated by uploadFile and deleteFile
}

/**
 * Rename a file (wrapper around moveFile for same-directory rename)
 */
export async function renameFile(
  teamId: string,
  oldPath: string,
  newName: string
): Promise<void> {
  const pathParts = oldPath.split('/');
  pathParts.pop(); // Remove old filename
  const newPath = pathParts.length > 0 ? `${pathParts.join('/')}/${newName}` : newName;

  await moveFile(teamId, oldPath, newPath);
}

/**
 * Check if a file exists
 */
export async function fileExists(teamId: string, filePath: string): Promise<boolean> {
  const fullPath = getTeamPath(teamId, filePath);
  const fileRef = ref(storage, fullPath);

  try {
    await getMetadata(fileRef);
    return true;
  } catch (error) {
    if (getErrorCode(error) === 'storage/object-not-found') {
      return false;
    }
    throw error;
  }
}

/**
 * Get file metadata
 */
export async function getFileMetadata(teamId: string, filePath: string): Promise<StorageFile | null> {
  const fullPath = getTeamPath(teamId, filePath);
  const fileRef = ref(storage, fullPath);

  try {
    const metadata = await getMetadata(fileRef);
    const downloadUrl = await getDownloadURL(fileRef);

    return {
      id: fullPath,
      name: filePath.split('/').pop() || filePath,
      fullPath,
      isFolder: false,
      size: metadata.size,
      contentType: metadata.contentType,
      modifiedTime: metadata.updated,
      downloadUrl,
      lastEditedBy: metadata.customMetadata?.lastEditedBy,
    };
  } catch (error) {
    if (getErrorCode(error) === 'storage/object-not-found') {
      return null;
    }
    throw error;
  }
}

// ============ CHAT ATTACHMENTS ============

export interface ChatAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: Date;
  uploadedBy: string;
}

// ============ IMAGE COMPRESSION ============
// Reduces egress costs by compressing images before upload

interface ImageCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  convertToWebP?: boolean;
}

const DEFAULT_COMPRESSION_OPTIONS: ImageCompressionOptions = {
  maxWidth: 1920,       // Max width for chat images
  maxHeight: 1920,      // Max height for chat images
  quality: 0.85,        // 85% quality (good balance)
  convertToWebP: true,  // WebP is ~30% smaller than JPEG
};

/**
 * Compress an image file before upload
 * Reduces file size by 60-80% typically
 */
export async function compressImage(
  file: File,
  options: ImageCompressionOptions = {}
): Promise<{ blob: Blob; wasCompressed: boolean; originalSize: number; compressedSize: number }> {
  const opts = { ...DEFAULT_COMPRESSION_OPTIONS, ...options };
  const originalSize = file.size;

  // Skip non-image files
  if (!file.type.startsWith('image/')) {
    return {
      blob: file,
      wasCompressed: false,
      originalSize,
      compressedSize: originalSize
    };
  }

  // Skip GIFs (animation would be lost) and SVGs (already optimized)
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return {
      blob: file,
      wasCompressed: false,
      originalSize,
      compressedSize: originalSize
    };
  }

  // Skip small images (under 100KB) - not worth compressing
  if (file.size < 100 * 1024) {
    return {
      blob: file,
      wasCompressed: false,
      originalSize,
      compressedSize: originalSize
    };
  }

  try {
    // Create image bitmap for efficient processing
    const bitmap = await createImageBitmap(file);

    // Calculate new dimensions while maintaining aspect ratio
    let { width, height } = bitmap;
    const maxW = opts.maxWidth || 1920;
    const maxH = opts.maxHeight || 1920;

    if (width > maxW || height > maxH) {
      const scale = Math.min(maxW / width, maxH / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    // Create canvas and draw resized image
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Use high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    // Convert to blob
    const outputType = opts.convertToWebP ? 'image/webp' : file.type;
    const quality = opts.quality || 0.85;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to create blob'));
        },
        outputType,
        quality
      );
    });

    // If compressed is larger than original, use original
    if (blob.size >= originalSize) {
      return {
        blob: file,
        wasCompressed: false,
        originalSize,
        compressedSize: originalSize
      };
    }

    const savings = Math.round((1 - blob.size / originalSize) * 100);
    console.log(`[ImageCompression] Compressed ${file.name}: ${formatSize(originalSize)} → ${formatSize(blob.size)} (${savings}% savings)`);

    return {
      blob,
      wasCompressed: true,
      originalSize,
      compressedSize: blob.size
    };
  } catch (error) {
    console.warn('[ImageCompression] Failed to compress image:', error);
    return {
      blob: file,
      wasCompressed: false,
      originalSize,
      compressedSize: originalSize
    };
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Upload a chat attachment (binary file like images)
 * Stores in: teams/{teamId}/chat-attachments/{channelId}/{timestamp}_{filename}
 * Automatically compresses images to reduce storage/egress costs
 */
export async function uploadChatAttachment(
  teamId: string,
  channelId: string,
  file: File,
  uploaderEmail: string
): Promise<ChatAttachment> {
  // Compress image if applicable (reduces size by 60-80%)
  const { blob, wasCompressed, originalSize, compressedSize } = await compressImage(file);

  // Generate unique filename with timestamp to avoid collisions
  const timestamp = Date.now();
  // If converted to WebP, update extension
  const extension = wasCompressed && blob.type === 'image/webp'
    ? file.name.replace(/\.[^.]+$/, '.webp')
    : file.name;
  const safeName = extension.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `teams/${teamId}/chat-attachments/${channelId}/${timestamp}_${safeName}`;
  const fileRef = ref(storage, filePath);

  console.log(`[FirebaseStorage] Uploading chat attachment: ${filePath}${wasCompressed ? ` (compressed: ${formatSize(originalSize)} → ${formatSize(compressedSize)})` : ''}`);

  // Upload binary file
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  await uploadBytes(fileRef, uint8Array, {
    contentType: blob.type,
    customMetadata: {
      uploadedBy: uploaderEmail,
      originalName: file.name,
      wasCompressed: wasCompressed.toString(),
      originalSize: originalSize.toString(),
    },
  });

  // Get download URL
  const downloadUrl = await getDownloadURL(fileRef);

  console.log(`[FirebaseStorage] Chat attachment uploaded: ${filePath}`);

  return {
    id: filePath,
    name: file.name,
    size: compressedSize,
    type: blob.type,
    url: downloadUrl,
    uploadedAt: new Date(),
    uploadedBy: uploaderEmail,
  };
}
