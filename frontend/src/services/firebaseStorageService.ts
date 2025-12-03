/**
 * Firebase Cloud Storage Service for Team Files
 * Replaces Google Drive for team file storage to avoid permission issues
 */

import { storage } from './firebase';
import {
  ref,
  uploadString,
  getDownloadURL,
  deleteObject,
  listAll,
  getMetadata,
  updateMetadata,
  ListResult,
  StorageReference,
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
}

// ============ CACHING LAYER ============
// Cache for file lists to avoid repeated API calls
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const FILE_LIST_CACHE_DURATION = 30000; // 30 seconds
const fileListCache = new Map<string, CacheEntry<StorageFile[]>>();

function getCachedFileList(cacheKey: string): StorageFile[] | null {
  const entry = fileListCache.get(cacheKey);
  if (entry && Date.now() - entry.timestamp < FILE_LIST_CACHE_DURATION) {
    console.log(`[FirebaseStorage] Cache hit for: ${cacheKey}`);
    return entry.data;
  }
  if (entry) {
    fileListCache.delete(cacheKey); // Clean up expired entry
  }
  return null;
}

function setCachedFileList(cacheKey: string, data: StorageFile[]): void {
  fileListCache.set(cacheKey, { data, timestamp: Date.now() });
}

// Invalidate cache for a team (call after create/delete/rename operations)
export function invalidateTeamCache(teamId: string): void {
  const keysToDelete: string[] = [];
  for (const key of fileListCache.keys()) {
    if (key.startsWith(`team:${teamId}`)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => fileListCache.delete(key));
  console.log(`[FirebaseStorage] Cache invalidated for team: ${teamId}`);
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
  contentType: string = 'text/markdown'
): Promise<StorageFile> {
  const fullPath = getTeamPath(teamId, filePath);
  const fileRef = ref(storage, fullPath);

  console.log(`[FirebaseStorage] Uploading file: ${fullPath}`);

  // Upload as string (for text files like markdown)
  await uploadString(fileRef, content, 'raw', {
    contentType,
    customMetadata: {
      updatedAt: new Date().toISOString(),
    },
  });

  // Get download URL
  const downloadUrl = await getDownloadURL(fileRef);

  console.log(`[FirebaseStorage] File uploaded: ${fullPath}`);

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
 */
export async function downloadFile(teamId: string, filePath: string): Promise<string> {
  const fullPath = getTeamPath(teamId, filePath);
  const fileRef = ref(storage, fullPath);

  console.log(`[FirebaseStorage] Downloading file: ${fullPath}`);

  try {
    // Get download URL with access token - this bypasses CORS
    const downloadUrl = await getDownloadURL(fileRef);

    console.log(`[FirebaseStorage] Got download URL for: ${fullPath}`);

    // Fetch the content using the signed URL
    const response = await fetch(downloadUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const content = await response.text();

    console.log(`[FirebaseStorage] Downloaded ${content.length} bytes from ${fullPath}`);

    return content;
  } catch (error: any) {
    console.error(`[FirebaseStorage] Download error for ${fullPath}:`, error.code, error.message);

    if (error.code === 'storage/object-not-found') {
      throw new Error(`File not found: ${filePath}`);
    }
    if (error.code === 'storage/unauthorized' || error.code === 'storage/unauthenticated') {
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

  console.log(`[FirebaseStorage] Deleting file: ${fullPath}`);

  try {
    await deleteObject(fileRef);
    console.log(`[FirebaseStorage] File deleted: ${fullPath}`);

    // Invalidate cache since file list changed
    invalidateTeamCache(teamId);
  } catch (error: any) {
    if (error.code === 'storage/object-not-found') {
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

  console.log(`[FirebaseStorage] Deleting folder: ${fullPath}`);

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

    console.log(`[FirebaseStorage] Folder deleted: ${fullPath}`);

    // Invalidate cache since file list changed
    invalidateTeamCache(teamId);
  } catch (error: any) {
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

  // Check cache first
  const cached = getCachedFileList(cacheKey);
  if (cached) {
    return cached;
  }

  const folderRef = ref(storage, fullPath);

  console.log(`[FirebaseStorage] Listing files in: ${fullPath}`);

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

    // Fetch file metadata in parallel for better performance
    const filePromises = result.items.map(async (item) => {
      try {
        // Fetch metadata and URL in parallel
        const [metadata, downloadUrl] = await Promise.all([
          getMetadata(item),
          getDownloadURL(item),
        ]);

        return {
          id: item.fullPath,
          name: item.name,
          fullPath: item.fullPath,
          isFolder: false,
          size: metadata.size,
          contentType: metadata.contentType,
          modifiedTime: metadata.updated,
          downloadUrl,
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

    // Cache the results
    setCachedFileList(cacheKey, files);

    return files;
  } catch (error: any) {
    console.error(`[FirebaseStorage] Failed to list files: ${fullPath}`, error.code, error.message);
    if (error.code === 'storage/object-not-found') {
      return [];
    }
    if (error.code === 'storage/unauthorized' || error.code === 'storage/unauthenticated') {
      throw new Error(`Permission denied: You don't have access to this team's files. Please ensure you're signed in and have team access.`);
    }
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

  // Check cache first
  const cached = getCachedFileList(cacheKey);
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

  // Cache the recursive results
  setCachedFileList(cacheKey, allFiles);

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
  } catch (error: any) {
    if (error.code === 'storage/object-not-found') {
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
    };
  } catch (error: any) {
    if (error.code === 'storage/object-not-found') {
      return null;
    }
    throw error;
  }
}
