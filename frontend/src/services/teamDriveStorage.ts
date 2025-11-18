/**
 * Team Drive Storage Service
 * Provides team file storage using Google Drive API
 * This replaces cloudStorageBackend.ts for team file operations
 */

import {
  listFolderFiles,
  listAllFilesRecursive,
  uploadNote,
  downloadNote,
  updateNote,
  deleteNote,
  createSubfolder,
  moveFile,
  DriveFile
} from './googleDriveService';

interface FileTreeNode {
  path: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
  id?: string;
  modifiedTime?: string;
}

export class TeamDriveStorage {
  private driveFolderId: string;
  private fileCache: Map<string, { id: string; content: string }> = new Map();

  constructor(driveFolderId: string) {
    this.driveFolderId = driveFolderId;
  }

  /**
   * Get file tree structure from Drive folder
   */
  async getFileTree(): Promise<FileTreeNode[]> {
    try {
      // Get all files recursively
      const allFiles = await listAllFilesRecursive(this.driveFolderId);

      // Build a map of file ID to file for quick lookup
      const fileMap = new Map<string, DriveFile>();
      allFiles.forEach(file => fileMap.set(file.id, file));

      // Build a map of parent ID to children
      const childrenMap = new Map<string, DriveFile[]>();
      allFiles.forEach(file => {
        const parentId = file.parents?.[0] || this.driveFolderId;
        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, []);
        }
        childrenMap.get(parentId)!.push(file);
      });

      // Recursively build tree starting from root
      const buildTree = (parentId: string): FileTreeNode[] => {
        const children = childrenMap.get(parentId) || [];
        return children.map(file => {
          const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
          const node: FileTreeNode = {
            id: file.id,
            name: file.name,
            path: file.name, // In flat structure, path is just the name
            type: isFolder ? 'folder' : 'file',
            modifiedTime: file.modifiedTime,
          };

          if (isFolder) {
            node.children = buildTree(file.id);
          }

          return node;
        });
      };

      const tree = buildTree(this.driveFolderId);
      return tree;
    } catch (error) {
      console.error('Failed to get file tree:', error);
      throw error;
    }
  }

  /**
   * List all files in the team folder (recursively)
   */
  async listFiles(): Promise<any[]> {
    try {
      const files = await listAllFilesRecursive(this.driveFolderId);

      // Build a map of file ID to file for quick lookup
      const fileMap = new Map<string, DriveFile>();
      files.forEach(file => fileMap.set(file.id, file));

      // Recursively build the full path for a file by traversing parents
      const buildFullPath = (file: DriveFile): string => {
        const parentId = file.parents?.[0];

        // If no parent or parent is the root team folder, just return the name
        if (!parentId || parentId === this.driveFolderId) {
          return file.name;
        }

        // Otherwise, recursively get parent path
        const parent = fileMap.get(parentId);
        if (parent) {
          const parentPath = buildFullPath(parent);
          const fullPath = `${parentPath}\\${file.name}`;
          return fullPath;
        }

        // Parent not found - log this as it indicates a problem
        console.warn(`⚠️ Parent folder not found for "${file.name}" (parentId: ${parentId})`);
        return file.name;
      };

      return files.map(file => ({
        id: file.id,
        name: file.name,
        fullPath: buildFullPath(file),
        size: parseInt(file.size || '0'),
        contentType: file.mimeType,
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink
      }));
    } catch (error) {
      console.error('Failed to list files:', error);
      throw error;
    }
  }

  /**
   * Get file content by name
   */
  async getFile(fileName: string): Promise<string> {
    try {
      // Check cache first for newly created files
      const normalizedFileName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
      const cached = this.fileCache.get(normalizedFileName);
      if (cached) {
        return cached.content;
      }

      // Search recursively for the file by name across all folders
      const allFiles = await listAllFilesRecursive(this.driveFolderId);
      const file = allFiles.find(f => f.name === fileName || f.name === normalizedFileName);

      if (!file) {
        throw new Error(`File "${fileName}" not found`);
      }

      // Download the file content
      const content = await downloadNote(file.id);
      return content;
    } catch (error) {
      console.error(`Failed to get file "${fileName}":`, error);
      throw error;
    }
  }

  /**
   * Save a file to the team folder
   */
  async saveFile(fileName: string, content: string, parentFolderId?: string, isNewFile: boolean = false): Promise<string> {
    try {
      console.log('[TeamDriveStorage] saveFile called:', { fileName, parentFolderId, targetFolder: parentFolderId || this.driveFolderId, isNewFile, contentLength: content.length });

      // Use provided parent folder ID or fall back to team root folder
      const targetFolderId = parentFolderId || this.driveFolderId;
      const normalizedFileName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;

      console.log('[TeamDriveStorage] Normalized filename:', normalizedFileName, '- Checking for existing file in folder:', targetFolderId);

      // Check if file already exists
      const files = await listFolderFiles(targetFolderId);
      console.log('[TeamDriveStorage] Files in target folder:', files.map(f => f.name));

      const existingFile = files.find(f => f.name === fileName || f.name === normalizedFileName);
      console.log('[TeamDriveStorage] Existing file found:', existingFile ? existingFile.name : 'none');

      if (existingFile) {
        if (isNewFile) {
          console.log('[TeamDriveStorage] ERROR: Trying to create new file but it already exists');
          // Prevent creating duplicate files
          throw new Error(`A file named "${fileName}" already exists in this folder`);
        } else {
          console.log('[TeamDriveStorage] Updating existing file:', existingFile.id);
          // Update existing file (this is for auto-save)
          await updateNote(existingFile.id, content);

          // Update cache
          this.fileCache.set(normalizedFileName, { id: existingFile.id, content });
          console.log('[TeamDriveStorage] File updated successfully');
          return existingFile.id;
        }
      } else {
        console.log('[TeamDriveStorage] No existing file found, creating new file');
        // Create new file
        const newFile = await uploadNote(targetFolderId, fileName, content);
        console.log('[TeamDriveStorage] New file created:', newFile.id);

        // Cache the newly created file to avoid race condition when immediately loading it
        this.fileCache.set(normalizedFileName, { id: newFile.id, content });

        // Clear cache after 5 seconds (by then Google Drive should have indexed it)
        setTimeout(() => {
          this.fileCache.delete(normalizedFileName);
        }, 5000);

        return newFile.id;
      }
    } catch (error) {
      console.error(`❌ Failed to save file "${fileName}":`, error);
      throw error;
    }
  }

  /**
   * Delete a file from the team folder
   */
  async deleteFile(fileName: string): Promise<void> {
    try {
      // Search recursively for the file by name
      const allFiles = await listAllFilesRecursive(this.driveFolderId);
      const file = allFiles.find(f => f.name === fileName || f.name === `${fileName}.md`);

      if (!file) {
        throw new Error(`File "${fileName}" not found`);
      }

      // Delete the file
      await deleteNote(file.id);
    } catch (error) {
      console.error(`Failed to delete file "${fileName}":`, error);
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
   * Rename a file (with optional file ID for direct rename)
   */
  async renameFile(oldName: string, newName: string, fileId?: string): Promise<void> {
    try {
      console.log('[TeamDriveStorage] renameFile called:', { oldName, newName, fileId });

      // If we have a file ID, use direct rename (much faster and no duplicates)
      if (fileId) {
        console.log('[TeamDriveStorage] Using direct rename with fileId:', fileId);
        const { renameFile: renameFileDrive } = await import('./googleDriveService');
        await renameFileDrive(fileId, newName);
        console.log('[TeamDriveStorage] Rename completed successfully');
        return;
      }

      // Fallback: Find file by name and rename
      const allFiles = await listAllFilesRecursive(this.driveFolderId);
      const file = allFiles.find(f => f.name === oldName || f.name === `${oldName}.md`);

      if (!file) {
        throw new Error(`File "${oldName}" not found`);
      }

      const { renameFile: renameFileDrive } = await import('./googleDriveService');
      await renameFileDrive(file.id, newName);
    } catch (error) {
      console.error(`Failed to rename file from "${oldName}" to "${newName}":`, error);
      throw error;
    }
  }

  /**
   * Create a folder (subfolder in the team folder)
   */
  async createFolder(folderName: string, parentFolderId?: string): Promise<void> {
    try {
      // Use provided parent folder ID or fall back to team root folder
      const targetFolderId = parentFolderId || this.driveFolderId;

      // Create subfolder in the specified parent folder
      await createSubfolder(targetFolderId, folderName);
    } catch (error) {
      console.error(`Failed to create folder "${folderName}":`, error);
      throw error;
    }
  }

  /**
   * Move a file or folder to a different location
   */
  async moveItem(sourceName: string, destinationFolderName: string): Promise<void> {
    try {
      // Search recursively for all files and folders
      const allFiles = await listAllFilesRecursive(this.driveFolderId);

      // Find source file/folder
      const sourceFile = allFiles.find(f => f.name === sourceName);
      if (!sourceFile) {
        throw new Error(`Source "${sourceName}" not found`);
      }

      // Find destination folder (if empty, move to root team folder)
      let destinationFolderId = this.driveFolderId;
      if (destinationFolderName) {
        const destFolder = allFiles.find(
          f => f.name === destinationFolderName &&
          f.mimeType === 'application/vnd.google-apps.folder'
        );
        if (!destFolder) {
          throw new Error(`Destination folder "${destinationFolderName}" not found`);
        }
        destinationFolderId = destFolder.id;
      }

      // Move the file/folder
      await moveFile(sourceFile.id, destinationFolderId, this.driveFolderId);
    } catch (error) {
      console.error(`Failed to move "${sourceName}":`, error);
      throw error;
    }
  }
}

/**
 * Factory function to create TeamDriveStorage instance
 */
export function getTeamDriveStorage(driveFolderId: string): TeamDriveStorage {
  return new TeamDriveStorage(driveFolderId);
}
