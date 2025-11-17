/**
 * Team Drive Storage Service
 * Provides team file storage using Google Drive API
 * This replaces cloudStorageBackend.ts for team file operations
 */

import {
  listFolderFiles,
  uploadNote,
  downloadNote,
  updateNote,
  deleteNote,
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

  constructor(driveFolderId: string) {
    this.driveFolderId = driveFolderId;
  }

  /**
   * Get file tree structure from Drive folder
   */
  async getFileTree(): Promise<FileTreeNode[]> {
    try {
      const files = await listFolderFiles(this.driveFolderId);

      // Convert flat file list to tree structure
      const tree: FileTreeNode[] = [];

      for (const file of files) {
        const isFolder = file.mimeType === 'application/vnd.google-apps.folder';

        tree.push({
          id: file.id,
          name: file.name,
          path: file.name,
          type: isFolder ? 'folder' : 'file',
          modifiedTime: file.modifiedTime,
          children: isFolder ? [] : undefined
        });
      }

      return tree;
    } catch (error) {
      console.error('Failed to get file tree:', error);
      throw error;
    }
  }

  /**
   * List all files in the team folder
   */
  async listFiles(): Promise<any[]> {
    try {
      const files = await listFolderFiles(this.driveFolderId);

      return files.map(file => ({
        id: file.id,
        name: file.name,
        fullPath: file.name,
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
      // First, find the file by name in the folder
      const files = await listFolderFiles(this.driveFolderId);
      const file = files.find(f => f.name === fileName || f.name === `${fileName}.md`);

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
  async saveFile(fileName: string, content: string): Promise<void> {
    try {
      // Check if file already exists
      const files = await listFolderFiles(this.driveFolderId);
      const existingFile = files.find(f => f.name === fileName || f.name === `${fileName}.md`);

      if (existingFile) {
        // Update existing file
        await updateNote(existingFile.id, content);
        console.log(`✅ Updated file "${fileName}"`);
      } else {
        // Create new file
        await uploadNote(this.driveFolderId, fileName, content);
        console.log(`✅ Created file "${fileName}"`);
      }
    } catch (error) {
      console.error(`Failed to save file "${fileName}":`, error);
      throw error;
    }
  }

  /**
   * Delete a file from the team folder
   */
  async deleteFile(fileName: string): Promise<void> {
    try {
      // Find the file by name
      const files = await listFolderFiles(this.driveFolderId);
      const file = files.find(f => f.name === fileName || f.name === `${fileName}.md`);

      if (!file) {
        throw new Error(`File "${fileName}" not found`);
      }

      // Delete the file
      await deleteNote(file.id);
      console.log(`✅ Deleted file "${fileName}"`);
    } catch (error) {
      console.error(`Failed to delete file "${fileName}":`, error);
      throw error;
    }
  }

  /**
   * Search files by name
   */
  async searchFiles(searchTerm: string): Promise<any[]> {
    try {
      const allFiles = await this.listFiles();
      return allFiles.filter(file =>
        file.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    } catch (error) {
      console.error('Failed to search files:', error);
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(fileName: string): Promise<any> {
    try {
      const files = await this.listFiles();
      return files.find(file => file.name === fileName);
    } catch (error) {
      console.error('Failed to get file metadata:', error);
      throw error;
    }
  }

  /**
   * Rename a file
   */
  async renameFile(oldName: string, newName: string): Promise<void> {
    try {
      // Get file content
      const content = await this.getFile(oldName);

      // Create new file with new name
      await this.saveFile(newName, content);

      // Delete old file
      await this.deleteFile(oldName);

      console.log(`✅ Renamed file from "${oldName}" to "${newName}"`);
    } catch (error) {
      console.error(`Failed to rename file from "${oldName}" to "${newName}":`, error);
      throw error;
    }
  }

  /**
   * Create a folder (subfolder in the team folder)
   * Note: For now, this is a placeholder since we're using flat structure
   */
  async createFolder(folderName: string, parentPath?: string): Promise<void> {
    console.warn('Folder creation not yet implemented for Drive storage');
    // TODO: Implement subfolder creation if needed
  }
}

/**
 * Factory function to create TeamDriveStorage instance
 */
export function getTeamDriveStorage(driveFolderId: string): TeamDriveStorage {
  return new TeamDriveStorage(driveFolderId);
}
