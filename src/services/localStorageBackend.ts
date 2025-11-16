// Local Filesystem Storage Backend
// Uses Tauri commands to interact with local files

import { invoke } from '@tauri-apps/api/core';
import { StorageBackend, FileNode } from './storageBackend';

export class LocalStorageBackend implements StorageBackend {
  constructor(private rootPath: string) {}

  async readFile(path: string): Promise<string> {
    return await invoke<string>('read_file', { path });
  }

  async writeFile(path: string, content: string): Promise<void> {
    await invoke('write_file', { path, content });
  }

  async deleteFile(path: string): Promise<void> {
    await invoke('delete_file', { path });
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    await invoke('rename_file', { oldPath, newPath });
  }

  async createFile(path: string, content: string): Promise<void> {
    await invoke('create_file', { path, content });
  }

  async createFolder(path: string): Promise<void> {
    await invoke('create_folder', { path });
  }

  async deleteFolder(path: string): Promise<void> {
    await invoke('delete_folder', { path });
  }

  async renameFolder(oldPath: string, newPath: string): Promise<void> {
    await invoke('rename_folder', { oldPath, newPath });
  }

  async getFileTree(): Promise<FileNode[]> {
    const tree = await invoke<any[]>('get_file_tree', { rootPath: this.rootPath });
    return tree;
  }

  async refreshFileTree(): Promise<FileNode[]> {
    return this.getFileTree();
  }

  joinPath(...parts: string[]): string {
    // Use platform-specific path separator
    const separator = this.rootPath.includes('\\') ? '\\' : '/';
    return parts.join(separator);
  }

  getFileName(path: string): string {
    const separator = path.includes('\\') ? '\\' : '/';
    const parts = path.split(separator);
    return parts[parts.length - 1];
  }

  getParentPath(path: string): string {
    const separator = path.includes('\\') ? '\\' : '/';
    const parts = path.split(separator);
    parts.pop();
    return parts.join(separator);
  }

  async revealInExplorer(path: string): Promise<void> {
    await invoke('reveal_in_explorer', { path });
  }

  getRootPath(): string {
    return this.rootPath;
  }
}
