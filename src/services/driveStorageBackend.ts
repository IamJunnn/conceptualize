// Google Drive Storage Backend
// Uses Google Drive API to store and manage files for team collaboration

import { StorageBackend, FileNode } from './storageBackend';
import * as DriveAPI from './googleDriveService';
import { getAccessToken, refreshAccessToken, isTokenExpired } from './tokenStorage';

export class DriveStorageBackend implements StorageBackend {
  private fileCache: Map<string, { id: string; name: string; content?: string }> = new Map();
  private folderCache: Map<string, string> = new Map(); // path -> folderId

  constructor(private teamFolderId: string, private teamName: string) {
    // Root folder
    this.folderCache.set('/', teamFolderId);
  }

  /**
   * Build a virtual path from folder structure
   * Since Drive doesn't have a traditional folder hierarchy with paths,
   * we need to construct virtual paths
   */
  private buildPath(parentPath: string, name: string): string {
    if (parentPath === '/') {
      return `/${name}`;
    }
    return `${parentPath}/${name}`;
  }

  /**
   * Get file ID from cache by path
   */
  private getFileId(path: string): string | undefined {
    return this.fileCache.get(path)?.id;
  }

  /**
   * Get folder ID from cache by path
   */
  private getFolderId(path: string): string | undefined {
    return this.folderCache.get(path);
  }

  async readFile(path: string): Promise<string> {
    const fileId = this.getFileId(path);
    if (!fileId) {
      throw new Error(`File not found: ${path}`);
    }

    // Check cache first
    const cached = this.fileCache.get(path);
    if (cached?.content) {
      return cached.content;
    }

    // Download from Drive
    const content = await DriveAPI.downloadNote(fileId);

    // Update cache
    if (cached) {
      cached.content = content;
    }

    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const fileId = this.getFileId(path);

    if (fileId) {
      // Update existing file
      await DriveAPI.updateNote(fileId, content);

      // Update cache
      const cached = this.fileCache.get(path);
      if (cached) {
        cached.content = content;
      }
    } else {
      // Create new file
      await this.createFile(path, content);
    }
  }

  async deleteFile(path: string): Promise<void> {
    const fileId = this.getFileId(path);
    if (!fileId) {
      throw new Error(`File not found: ${path}`);
    }

    await DriveAPI.deleteNote(fileId);
    this.fileCache.delete(path);
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    // Drive doesn't have direct rename for path-based system
    // We need to update the file metadata
    const fileId = this.getFileId(oldPath);
    if (!fileId) {
      throw new Error(`File not found: ${oldPath}`);
    }

    const newName = this.getFileName(newPath);
    const token = await this.getAccessToken();

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: newName,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to rename file: ${error}`);
    }

    // Update cache
    const cached = this.fileCache.get(oldPath);
    if (cached) {
      this.fileCache.delete(oldPath);
      this.fileCache.set(newPath, { ...cached, name: newName });
    }
  }

  async createFile(path: string, content: string): Promise<void> {
    const fileName = this.getFileName(path);
    const parentPath = this.getParentPath(path);
    const parentFolderId = this.getFolderId(parentPath) || this.teamFolderId;

    const file = await DriveAPI.uploadNote(parentFolderId, fileName, content);

    // Add to cache
    this.fileCache.set(path, {
      id: file.id,
      name: file.name,
      content: content,
    });
  }

  async createFolder(path: string): Promise<void> {
    const folderName = this.getFileName(path);
    const parentPath = this.getParentPath(path);
    const parentFolderId = this.getFolderId(parentPath) || this.teamFolderId;

    const token = await this.getAccessToken();

    const response = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create folder: ${error}`);
    }

    const folder = await response.json();
    this.folderCache.set(path, folder.id);
  }

  async deleteFolder(path: string): Promise<void> {
    const folderId = this.getFolderId(path);
    if (!folderId) {
      throw new Error(`Folder not found: ${path}`);
    }

    const token = await this.getAccessToken();

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete folder: ${error}`);
    }

    this.folderCache.delete(path);
  }

  async renameFolder(oldPath: string, newPath: string): Promise<void> {
    const folderId = this.getFolderId(oldPath);
    if (!folderId) {
      throw new Error(`Folder not found: ${oldPath}`);
    }

    const newName = this.getFileName(newPath);
    const token = await this.getAccessToken();

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: newName,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to rename folder: ${error}`);
    }

    // Update cache
    this.folderCache.delete(oldPath);
    this.folderCache.set(newPath, folderId);
  }

  async getFileTree(): Promise<FileNode[]> {
    // Recursively build file tree from Drive
    return await this.buildFileTree(this.teamFolderId, '/');
  }

  private async buildFileTree(folderId: string, currentPath: string): Promise<FileNode[]> {
    const token = await this.getAccessToken();

    // Get all items in this folder
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType)&orderBy=name`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list files: ${error}`);
    }

    const data = await response.json();
    const items = data.files || [];

    const nodes: FileNode[] = [];

    for (const item of items) {
      const itemPath = this.buildPath(currentPath, item.name);
      const isFolder = item.mimeType === 'application/vnd.google-apps.folder';

      if (isFolder) {
        // Cache folder ID
        this.folderCache.set(itemPath, item.id);

        // Recursively get children
        const children = await this.buildFileTree(item.id, itemPath);

        nodes.push({
          path: itemPath,
          name: item.name,
          type: 'folder',
          children: children,
        });
      } else {
        // Cache file ID
        this.fileCache.set(itemPath, {
          id: item.id,
          name: item.name,
        });

        nodes.push({
          path: itemPath,
          name: item.name,
          type: 'file',
        });
      }
    }

    return nodes;
  }

  async refreshFileTree(): Promise<FileNode[]> {
    // Clear caches and rebuild
    this.fileCache.clear();
    this.folderCache.clear();
    this.folderCache.set('/', this.teamFolderId);
    return await this.getFileTree();
  }

  joinPath(...parts: string[]): string {
    // Always use forward slashes for virtual paths
    const filtered = parts.filter(p => p && p !== '/');
    return '/' + filtered.join('/');
  }

  getFileName(path: string): string {
    const parts = path.split('/').filter(p => p);
    return parts[parts.length - 1] || '';
  }

  getParentPath(path: string): string {
    const parts = path.split('/').filter(p => p);
    parts.pop();
    return parts.length === 0 ? '/' : '/' + parts.join('/');
  }

  private async getAccessToken(): Promise<string> {
    // Check if token is expired and refresh if needed
    if (isTokenExpired()) {
      console.log('🔄 Token expired, refreshing...');
      try {
        return await refreshAccessToken();
      } catch (error) {
        console.error('❌ Failed to refresh token:', error);
        throw new Error('Authentication expired. Please sign in again.');
      }
    }

    const token = getAccessToken();
    if (!token) {
      throw new Error('Not authenticated with Google Drive. Please sign in again.');
    }
    return token;
  }

  // Drive doesn't support "reveal in explorer", but we can open in browser
  async revealInExplorer(path: string): Promise<void> {
    const fileId = this.getFileId(path);
    const folderId = this.getFolderId(path);

    const id = fileId || folderId;
    if (id) {
      window.open(`https://drive.google.com/file/d/${id}/view`, '_blank');
    }
  }

  getTeamFolderId(): string {
    return this.teamFolderId;
  }

  getTeamName(): string {
    return this.teamName;
  }
}
