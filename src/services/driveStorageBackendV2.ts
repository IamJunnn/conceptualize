// Google Drive Storage Backend V2
// Uses Cloud Functions API with Service Account for team collaboration
// This version removes the need for individual user OAuth tokens

import { StorageBackend, FileNode } from './storageBackend';
import { auth } from './firebase';

// Cloud Functions base URL
const FUNCTIONS_BASE_URL = import.meta.env.VITE_FUNCTIONS_URL ||
  'https://us-central1-conceptualize-c9a41.cloudfunctions.net';

export class DriveStorageBackendV2 implements StorageBackend {
  private fileCache: Map<string, { id: string; name: string; content?: string }> = new Map();
  private folderCache: Map<string, string> = new Map(); // path -> folderId

  constructor(
    private teamId: string,
    private teamFolderId: string,
    private teamName: string
  ) {
    // Root folder
    this.folderCache.set('/', teamFolderId);
  }

  /**
   * Get Firebase Auth token for authenticated API calls
   */
  private async getAuthToken(): Promise<string> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Not authenticated. Please sign in.');
    }

    try {
      const token = await user.getIdToken();
      return token;
    } catch (error) {
      console.error('Failed to get auth token:', error);
      throw new Error('Authentication failed. Please sign in again.');
    }
  }

  /**
   * Make authenticated API call to Cloud Functions
   */
  private async apiCall(endpoint: string, options: RequestInit = {}): Promise<any> {
    const token = await this.getAuthToken();

    const response = await fetch(`${FUNCTIONS_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `API call failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Build a virtual path from folder structure
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
      console.log('📦 Using cached content for:', path);
      return cached.content;
    }

    // Fetch from API
    console.log('🌐 Fetching file from API:', path);
    const response = await this.apiCall(`/getTeamFile/${this.teamId}/files/${fileId}`);
    const content = response.content;

    // Update cache
    if (cached) {
      cached.content = content;
    }

    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const fileId = this.getFileId(path);
    const fileName = this.getFileName(path);

    console.log('💾 Saving file:', path, fileId ? '(update)' : '(create)');

    const response = await this.apiCall(`/saveTeamFile/${this.teamId}/files`, {
      method: 'POST',
      body: JSON.stringify({
        fileName,
        content,
        fileId,
      }),
    });

    // Update cache
    if (fileId) {
      const cached = this.fileCache.get(path);
      if (cached) {
        cached.content = content;
      }
    } else {
      // New file created, add to cache
      this.fileCache.set(path, {
        id: response.fileId,
        name: fileName,
        content,
      });
    }

    console.log('✅ File saved successfully:', response.message);
  }

  async deleteFile(path: string): Promise<void> {
    const fileId = this.getFileId(path);
    if (!fileId) {
      throw new Error(`File not found: ${path}`);
    }

    console.log('🗑️ Deleting file:', path);

    await this.apiCall(`/deleteTeamFile/${this.teamId}/files/${fileId}`, {
      method: 'DELETE',
    });

    this.fileCache.delete(path);
    console.log('✅ File deleted successfully');
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    // Read content, delete old file, create new file
    const content = await this.readFile(oldPath);
    await this.deleteFile(oldPath);
    await this.createFile(newPath, content);
  }

  async createFile(path: string, content: string): Promise<void> {
    await this.writeFile(path, content);
  }

  async createFolder(path: string): Promise<void> {
    const folderName = this.getFileName(path);
    const parentPath = this.getParentPath(path);
    const parentFolderId = this.getFolderId(parentPath) || this.teamFolderId;

    console.log('📁 Creating folder:', path);

    const response = await this.apiCall(`/createTeamFolder/${this.teamId}/folders`, {
      method: 'POST',
      body: JSON.stringify({
        folderName,
        parentId: parentFolderId,
      }),
    });

    this.folderCache.set(path, response.folderId);
    console.log('✅ Folder created successfully:', response.message);
  }

  async deleteFolder(path: string): Promise<void> {
    const folderId = this.getFolderId(path);
    if (!folderId) {
      throw new Error(`Folder not found: ${path}`);
    }

    console.log('🗑️ Deleting folder:', path);

    await this.apiCall(`/deleteTeamFile/${this.teamId}/files/${folderId}`, {
      method: 'DELETE',
    });

    this.folderCache.delete(path);
    console.log('✅ Folder deleted successfully');
  }

  async renameFolder(oldPath: string, newPath: string): Promise<void> {
    // For now, we'll implement this similar to renameFile
    // A better implementation would be a dedicated API endpoint
    throw new Error('Folder renaming not yet implemented');
  }

  async getFileTree(): Promise<FileNode[]> {
    console.log('🌳 Fetching file tree from API...');

    const response = await this.apiCall(`/getTeamFileTree/${this.teamId}/files/tree`, {
      method: 'POST',
    });

    // Clear and rebuild caches
    this.fileCache.clear();
    this.folderCache.clear();
    this.folderCache.set('/', this.teamFolderId);

    // Process tree and populate caches
    const processNode = (node: any, parentPath: string = ''): FileNode => {
      const path = node.path.startsWith('/') ? node.path : `/${node.path}`;

      if (node.type === 'folder') {
        this.folderCache.set(path, node.id);

        return {
          path,
          name: node.name,
          type: 'folder',
          children: node.children?.map((child: any) => processNode(child, path)) || [],
        };
      } else {
        this.fileCache.set(path, {
          id: node.id,
          name: node.name,
        });

        return {
          path,
          name: node.name,
          type: 'file',
        };
      }
    };

    const tree = response.tree.map((node: any) => processNode(node, '/'));

    console.log('✅ File tree loaded successfully');
    console.log('📊 Cached files:', this.fileCache.size);
    console.log('📊 Cached folders:', this.folderCache.size);

    return tree;
  }

  async refreshFileTree(): Promise<FileNode[]> {
    return await this.getFileTree();
  }

  joinPath(...parts: string[]): string {
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

  // Open file/folder in Google Drive
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

  getTeamId(): string {
    return this.teamId;
  }
}
