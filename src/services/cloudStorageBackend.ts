/**
 * Cloud Storage Backend Service
 *
 * This service provides an abstraction layer for Firebase Cloud Storage,
 * handling all team file operations without requiring Google Drive OAuth.
 */

import { auth } from './firebase';

// Get the functions URL from environment or use production default
const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL ||
  'https://us-central1-conceptualize-c9a41.cloudfunctions.net';

/**
 * Get the current user's ID token for authentication
 */
async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user.getIdToken();
}

/**
 * Make an authenticated request to Firebase Functions
 */
async function makeAuthenticatedRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken();

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(`${FUNCTIONS_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || 'Request failed');
  }

  return response;
}

export class CloudStorageBackend {
  private teamId: string;

  constructor(teamId: string) {
    this.teamId = teamId;
  }

  /**
   * List all files in the team's storage
   */
  async listFiles(): Promise<any[]> {
    const response = await makeAuthenticatedRequest(
      `/listTeamFiles/teams/${this.teamId}/files`,
      { method: 'GET' }
    );
    const data = await response.json();
    return data.files || [];
  }

  /**
   * Get the content of a specific file
   */
  async getFile(fileName: string): Promise<string> {
    const response = await makeAuthenticatedRequest(
      `/getTeamFile/teams/${this.teamId}/files/${encodeURIComponent(fileName)}`,
      { method: 'GET' }
    );
    const data = await response.json();
    return data.content || '';
  }

  /**
   * Save a file to the team's storage
   */
  async saveFile(fileName: string, content: string): Promise<void> {
    await makeAuthenticatedRequest(
      `/saveTeamFile/teams/${this.teamId}/files`,
      {
        method: 'POST',
        body: JSON.stringify({
          fileName,
          content,
        }),
      }
    );
  }

  /**
   * Delete a file from the team's storage
   */
  async deleteFile(fileName: string): Promise<void> {
    await makeAuthenticatedRequest(
      `/deleteTeamFile/teams/${this.teamId}/files/${encodeURIComponent(fileName)}`,
      { method: 'DELETE' }
    );
  }

  /**
   * Create a folder in the team's storage
   */
  async createFolder(folderName: string, parentPath?: string): Promise<void> {
    await makeAuthenticatedRequest(
      `/createTeamFolder/teams/${this.teamId}/folders`,
      {
        method: 'POST',
        body: JSON.stringify({
          folderName,
          parentPath,
        }),
      }
    );
  }

  /**
   * Get the complete file tree structure
   */
  async getFileTree(): Promise<any> {
    const response = await makeAuthenticatedRequest(
      `/getTeamFileTree/teams/${this.teamId}/files/tree`,
      { method: 'POST' }
    );
    const data = await response.json();
    return data.tree || [];
  }

  /**
   * Search for files by name
   */
  async searchFiles(searchTerm: string): Promise<any[]> {
    const files = await this.listFiles();
    return files.filter(file =>
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
  async renameFile(oldName: string, newName: string): Promise<void> {
    // Get the file content first
    const content = await this.getFile(oldName);

    // Create new file with new name
    await this.saveFile(newName, content);

    // Delete old file
    await this.deleteFile(oldName);
  }

  /**
   * Copy a file
   */
  async copyFile(sourceName: string, targetName: string): Promise<void> {
    const content = await this.getFile(sourceName);
    await this.saveFile(targetName, content);
  }

  /**
   * Move a file to a different folder
   */
  async moveFile(fileName: string, targetFolder: string): Promise<void> {
    const content = await this.getFile(fileName);
    const targetPath = targetFolder ? `${targetFolder}/${fileName}` : fileName;

    await this.saveFile(targetPath, content);
    await this.deleteFile(fileName);
  }

  /**
   * Batch operations for efficiency
   */
  async batchSaveFiles(files: { name: string; content: string }[]): Promise<void> {
    await Promise.all(
      files.map(file => this.saveFile(file.name, file.content))
    );
  }

  async batchDeleteFiles(fileNames: string[]): Promise<void> {
    await Promise.all(
      fileNames.map(fileName => this.deleteFile(fileName))
    );
  }
}

/**
 * Create team storage when a new team is created
 */
export async function createTeamStorage(teamId: string, teamName: string): Promise<void> {
  const response = await makeAuthenticatedRequest(
    '/createTeamStorage',
    {
      method: 'POST',
      body: JSON.stringify({
        teamId,
        teamName,
      }),
    }
  );

  const data = await response.json();
  console.log('✅ Team storage created:', data);
}

/**
 * Export a singleton instance for convenience
 */
export function getCloudStorageBackend(teamId: string): CloudStorageBackend {
  return new CloudStorageBackend(teamId);
}