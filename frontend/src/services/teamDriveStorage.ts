/**
 * Team Storage Service
 * Provides team file storage using Firebase Cloud Storage
 * This replaces Google Drive for team file operations to avoid permission issues
 */

import {
  uploadFile,
  downloadFile,
  deleteFile,
  deleteFolder,
  listFiles,
  listAllFilesRecursive,
  createFolder as createStorageFolder,
  moveFile as moveStorageFile,
  renameFile as renameStorageFile,
  fileExists,
  invalidateTeamCache,
  StorageFile,
} from './firebaseStorageService';

interface FileTreeNode {
  path: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
  id?: string;
  modifiedTime?: string;
}

// Content cache duration - 30 seconds
const CONTENT_CACHE_DURATION = 30000;

export class TeamDriveStorage {
  private teamId: string;
  private fileCache: Map<string, { id: string; content: string; timestamp: number }> = new Map();
  // Cache for file path lookups to avoid repeated listAllFilesRecursive calls
  private filePathCache: Map<string, string> = new Map();

  // Expose teamId as rootFolderId for compatibility with existing code
  get rootFolderId(): string {
    return this.teamId;
  }

  constructor(teamId: string) {
    this.teamId = teamId;
  }

  /**
   * Get file tree structure from Firebase Storage
   */
  async getFileTree(): Promise<FileTreeNode[]> {
    try {
      console.log('[TeamStorage] Getting file tree for team:', this.teamId);

      // Get all files recursively
      const allFiles = await listAllFilesRecursive(this.teamId);

      // Filter out .folder markers from the list
      const visibleFiles = allFiles.filter(f => f.name !== '.folder');

      // Build tree structure from flat list
      const tree = this.buildTreeFromFiles(visibleFiles);

      console.log('[TeamStorage] File tree built with', tree.length, 'root items');
      return tree;
    } catch (error) {
      console.error('[TeamStorage] Failed to get file tree:', error);
      throw error;
    }
  }

  /**
   * Build a tree structure from flat file list
   */
  private buildTreeFromFiles(files: StorageFile[]): FileTreeNode[] {
    const root: FileTreeNode[] = [];
    const folderMap = new Map<string, FileTreeNode>();

    // First pass: create all folder nodes
    for (const file of files) {
      if (file.isFolder) {
        const relativePath = file.fullPath.replace(`teams/${this.teamId}/`, '');
        const node: FileTreeNode = {
          id: file.id,
          name: file.name,
          path: relativePath,
          type: 'folder',
          children: [],
          modifiedTime: file.modifiedTime,
        };
        folderMap.set(relativePath, node);
      }
    }

    // Second pass: create file nodes and build hierarchy
    for (const file of files) {
      const relativePath = file.fullPath.replace(`teams/${this.teamId}/`, '');
      const pathParts = relativePath.split('/');
      const fileName = pathParts.pop()!;
      const parentPath = pathParts.join('/');

      if (file.isFolder) {
        const node = folderMap.get(relativePath)!;
        if (parentPath && folderMap.has(parentPath)) {
          folderMap.get(parentPath)!.children!.push(node);
        } else if (!parentPath) {
          root.push(node);
        }
      } else {
        const node: FileTreeNode = {
          id: file.id,
          name: fileName,
          path: relativePath,
          type: 'file',
          modifiedTime: file.modifiedTime,
        };

        if (parentPath && folderMap.has(parentPath)) {
          folderMap.get(parentPath)!.children!.push(node);
        } else if (!parentPath) {
          root.push(node);
        }
      }
    }

    return root;
  }

  /**
   * List all files in the team folder (recursively)
   */
  async listFiles(): Promise<any[]> {
    try {
      console.log('[TeamStorage] Listing files for team:', this.teamId);

      const files = await listAllFilesRecursive(this.teamId);

      // Filter out .folder markers and map to expected format
      return files
        .filter(f => f.name !== '.folder')
        .map(file => {
          const relativePath = file.fullPath.replace(`teams/${this.teamId}/`, '');
          return {
            id: file.id,
            name: file.name,
            fullPath: relativePath.replace(/\//g, '\\'), // Use backslash for consistency with existing code
            size: file.size || 0,
            contentType: file.isFolder ? 'application/vnd.google-apps.folder' : file.contentType,
            modifiedTime: file.modifiedTime,
          };
        });
    } catch (error) {
      console.error('[TeamStorage] Failed to list files:', error);
      throw error;
    }
  }

  /**
   * Get file content by name or path
   * Accepts either a filename (e.g., "note.md") or a relative path (e.g., "folder/note.md")
   * Optimized: Uses path cache and direct download when possible
   */
  async getFile(fileNameOrPath: string): Promise<string> {
    try {
      console.log('[TeamStorage] Getting file:', fileNameOrPath);

      // Normalize backslashes to forward slashes (Windows paths)
      const normalizedInput = fileNameOrPath.replace(/\\/g, '/');

      // Check if this looks like a path (contains /) or just a filename
      const isPath = normalizedInput.includes('/');
      const normalizedPath = normalizedInput.endsWith('.md') ? normalizedInput : `${normalizedInput}.md`;

      // Check content cache first
      const cached = this.fileCache.get(normalizedPath);
      if (cached && Date.now() - cached.timestamp < CONTENT_CACHE_DURATION) {
        console.log('[TeamStorage] Returning cached content for:', normalizedPath);
        return cached.content;
      }

      let relativePath: string;

      if (isPath) {
        // If a full path was provided, try direct download first
        // This handles newly created files that aren't in the file list cache yet
        relativePath = normalizedPath;
        console.log('[TeamStorage] Using provided path:', relativePath);

        try {
          const content = await downloadFile(this.teamId, relativePath);

          // Cache the content
          this.fileCache.set(normalizedPath, {
            id: relativePath,
            content,
            timestamp: Date.now(),
          });

          return content;
        } catch (downloadError: any) {
          // If direct download fails with not found, fall through to search
          if (downloadError.message?.includes('not found') || downloadError.code === 'storage/object-not-found') {
            console.log('[TeamStorage] Direct download failed, searching file list...');
          } else {
            throw downloadError;
          }
        }
      }

      // For filename-only lookups, or if direct path download failed
      // Check if we have a cached path for this filename
      relativePath = this.filePathCache.get(normalizedPath) || '';

      if (!relativePath) {
        // Need to find the file path - use cached listAllFilesRecursive
        const allFiles = await listAllFilesRecursive(this.teamId);
        const file = allFiles.find(f =>
          f.name === fileNameOrPath ||
          f.name === normalizedPath ||
          f.fullPath.endsWith(`/${fileNameOrPath}`) ||
          f.fullPath.endsWith(`/${normalizedPath}`)
        );

        if (!file) {
          throw new Error(`File "${fileNameOrPath}" not found`);
        }

        relativePath = file.fullPath.replace(`teams/${this.teamId}/`, '');
        // Cache the path for future lookups
        this.filePathCache.set(normalizedPath, relativePath);
      }

      // Download the file content
      const content = await downloadFile(this.teamId, relativePath);

      // Cache the content
      this.fileCache.set(normalizedPath, {
        id: relativePath,
        content,
        timestamp: Date.now(),
      });

      return content;
    } catch (error) {
      console.error(`[TeamStorage] Failed to get file "${fileNameOrPath}":`, error);
      throw error;
    }
  }

  /**
   * Clear all caches (call when team changes or on major operations)
   */
  clearCaches(): void {
    this.fileCache.clear();
    this.filePathCache.clear();
    console.log('[TeamStorage] Caches cleared');
  }

  /**
   * Pre-cache file content for optimistic UI updates
   * Call this before opening a newly created file to avoid race conditions
   */
  preCacheContent(filePath: string, content: string): void {
    const normalizedPath = filePath.endsWith('.md') ? filePath : `${filePath}.md`;
    const fileName = normalizedPath.split('/').pop() || normalizedPath;

    console.log('[TeamStorage] Pre-caching content for:', normalizedPath);

    // Cache with both full path and filename
    this.fileCache.set(normalizedPath, {
      id: normalizedPath,
      content,
      timestamp: Date.now(),
    });
    this.fileCache.set(fileName, {
      id: normalizedPath,
      content,
      timestamp: Date.now(),
    });
    this.filePathCache.set(fileName, normalizedPath);
  }

  /**
   * Save a file to the team folder
   */
  async saveFile(fileName: string, content: string, parentFolderPath?: string, isNewFile: boolean = false): Promise<string> {
    try {
      console.log('[TeamStorage] saveFile called:', { fileName, parentFolderPath, isNewFile, contentLength: content.length });

      const normalizedFileName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;

      // Strip the teams/{teamId}/ prefix if present (since uploadFile adds it)
      let cleanParentPath = parentFolderPath;
      const teamPrefix = `teams/${this.teamId}/`;
      if (cleanParentPath && cleanParentPath.startsWith(teamPrefix)) {
        cleanParentPath = cleanParentPath.slice(teamPrefix.length);
      }

      // Build the full path (relative to team folder)
      const filePath = cleanParentPath
        ? `${cleanParentPath}/${normalizedFileName}`
        : normalizedFileName;

      console.log('[TeamStorage] Full file path:', filePath);

      // Check if file already exists
      if (isNewFile) {
        const exists = await fileExists(this.teamId, filePath);
        if (exists) {
          console.log('[TeamStorage] ERROR: Trying to create new file but it already exists');
          throw new Error(`A file named "${fileName}" already exists in this folder`);
        }
      }

      // Upload/update the file
      const result = await uploadFile(this.teamId, filePath, content);
      console.log('[TeamStorage] File saved:', result.id);

      // Cache the file content and path
      // Cache with both filename and full path for quick lookups
      this.fileCache.set(normalizedFileName, {
        id: result.id,
        content,
        timestamp: Date.now(),
      });
      this.fileCache.set(filePath, {
        id: result.id,
        content,
        timestamp: Date.now(),
      });
      this.filePathCache.set(normalizedFileName, filePath);

      return result.id;
    } catch (error) {
      console.error(`[TeamStorage] Failed to save file "${fileName}":`, error);
      throw error;
    }
  }

  /**
   * Delete a file from the team folder
   */
  async deleteFile(fileName: string): Promise<void> {
    try {
      console.log('[TeamStorage] Deleting file:', fileName);

      // Find the file to get its full path
      const allFiles = await listAllFilesRecursive(this.teamId);
      const file = allFiles.find(f =>
        f.name === fileName ||
        f.name === `${fileName}.md` ||
        f.fullPath.endsWith(`/${fileName}`) ||
        f.fullPath.endsWith(`/${fileName}.md`)
      );

      if (!file) {
        throw new Error(`File "${fileName}" not found`);
      }

      const relativePath = file.fullPath.replace(`teams/${this.teamId}/`, '');

      if (file.isFolder) {
        await deleteFolder(this.teamId, relativePath);
      } else {
        await deleteFile(this.teamId, relativePath);
      }

      console.log('[TeamStorage] File deleted:', fileName);
    } catch (error) {
      console.error(`[TeamStorage] Failed to delete file "${fileName}":`, error);
      throw error;
    }
  }

  /**
   * Search files by name
   */
  async searchFiles(searchTerm: string): Promise<any[]> {
    const allFiles = await this.listFiles();
    return allFiles.filter(file =>
      file.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(fileName: string): Promise<any> {
    const files = await this.listFiles();
    return files.find(file => file.name === fileName);
  }

  /**
   * Rename a file
   */
  async renameFile(oldName: string, newName: string, fileId?: string): Promise<void> {
    try {
      console.log('[TeamStorage] renameFile called:', { oldName, newName });

      // Find the file to get its path
      const allFiles = await listAllFilesRecursive(this.teamId);
      const file = allFiles.find(f =>
        f.name === oldName ||
        f.name === `${oldName}.md` ||
        (fileId && f.id === fileId)
      );

      if (!file) {
        throw new Error(`File "${oldName}" not found`);
      }

      const relativePath = file.fullPath.replace(`teams/${this.teamId}/`, '');
      await renameStorageFile(this.teamId, relativePath, newName);

      console.log('[TeamStorage] Rename completed:', oldName, '->', newName);
    } catch (error) {
      console.error(`[TeamStorage] Failed to rename file from "${oldName}" to "${newName}":`, error);
      throw error;
    }
  }

  /**
   * Create a folder
   */
  async createFolder(folderName: string, parentFolderPath?: string): Promise<void> {
    try {
      console.log('[TeamStorage] Creating folder:', folderName, 'in', parentFolderPath || 'root');

      // Strip the teams/{teamId}/ prefix if present (since createStorageFolder adds it)
      let cleanParentPath = parentFolderPath;
      const teamPrefix = `teams/${this.teamId}/`;
      if (cleanParentPath && cleanParentPath.startsWith(teamPrefix)) {
        cleanParentPath = cleanParentPath.slice(teamPrefix.length);
      }

      const folderPath = cleanParentPath
        ? `${cleanParentPath}/${folderName}`
        : folderName;

      await createStorageFolder(this.teamId, folderPath);

      console.log('[TeamStorage] Folder created:', folderPath);
    } catch (error) {
      console.error(`[TeamStorage] Failed to create folder "${folderName}":`, error);
      throw error;
    }
  }

  /**
   * Move a file or folder to a different location
   * @param sourcePathOrName - Can be a filename (e.g., "note.md") or a relative path (e.g., "folder/note.md")
   * @param destinationFolderPath - The destination folder path (e.g., "coaches" or "" for root)
   */
  async moveItem(sourcePathOrName: string, destinationFolderPath: string): Promise<void> {
    try {
      console.log('[TeamStorage] Moving item:', sourcePathOrName, 'to', destinationFolderPath || 'root');

      // Invalidate cache to ensure we have fresh data
      invalidateTeamCache(this.teamId);

      // Find the source file/folder
      const allFiles = await listAllFilesRecursive(this.teamId);

      // Try to find by exact path match first, then by name
      // sourcePathOrName could be "trials.md" (root file) or "folder/trials.md" (nested file)
      let sourceFile = allFiles.find(f => {
        const relativePath = f.fullPath.replace(`teams/${this.teamId}/`, '');
        return relativePath === sourcePathOrName || relativePath === `${sourcePathOrName}.md`;
      });

      // If not found by path, try by name (for backwards compatibility)
      if (!sourceFile) {
        sourceFile = allFiles.find(f =>
          f.name === sourcePathOrName ||
          f.name === `${sourcePathOrName}.md`
        );
      }

      if (!sourceFile) {
        console.error('[TeamStorage] Available files:', allFiles.map(f => f.fullPath));
        throw new Error(`Source "${sourcePathOrName}" not found`);
      }

      const sourceRelativePath = sourceFile.fullPath.replace(`teams/${this.teamId}/`, '');
      const fileName = sourceFile.name;

      // Strip the teams/{teamId}/ prefix from destination if present
      let cleanDestination = destinationFolderPath;
      const teamPrefix = `teams/${this.teamId}/`;
      if (cleanDestination && cleanDestination.startsWith(teamPrefix)) {
        cleanDestination = cleanDestination.slice(teamPrefix.length);
      }

      // Build destination path using the actual filename
      const newPath = cleanDestination
        ? `${cleanDestination}/${fileName}`
        : fileName;

      console.log('[TeamStorage] Source path:', sourceRelativePath, '-> New path:', newPath);

      await moveStorageFile(this.teamId, sourceRelativePath, newPath);

      // Clear local caches after move
      this.clearCaches();

      console.log('[TeamStorage] Item moved:', sourcePathOrName, 'to', newPath);
    } catch (error) {
      console.error(`[TeamStorage] Failed to move "${sourcePathOrName}":`, error);
      throw error;
    }
  }
}

/**
 * Factory function to create TeamDriveStorage instance
 * Now takes teamId instead of driveFolderId
 */
export function getTeamDriveStorage(teamId: string): TeamDriveStorage {
  return new TeamDriveStorage(teamId);
}
