// Storage Backend Abstraction
// Allows MainUI to work with both local filesystem and Google Drive

export interface FileNode {
  path: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

export interface StorageBackend {
  // File operations
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  renameFile(oldPath: string, newPath: string): Promise<void>;
  createFile(path: string, content: string): Promise<void>;

  // Folder operations
  createFolder(path: string): Promise<void>;
  deleteFolder(path: string): Promise<void>;
  renameFolder(oldPath: string, newPath: string): Promise<void>;

  // Tree operations
  getFileTree(): Promise<FileNode[]>;
  refreshFileTree(): Promise<FileNode[]>;

  // Path utilities
  joinPath(...parts: string[]): string;
  getFileName(path: string): string;
  getParentPath(path: string): string;

  // Special operations
  revealInExplorer?(path: string): Promise<void>;
}

// Helper to determine if a path is a markdown file
export function isMarkdownFile(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}
