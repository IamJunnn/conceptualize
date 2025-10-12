// graphUtils.ts - Utilities for building knowledge graph from markdown files

export type NodeType = 'root' | 'folder' | 'file';
export type FileType = 'markdown' | 'other'; // markdown (.md) or other file types

export interface GraphNode {
  id: string;          // File path or folder path
  name: string;        // Display name (file name without extension or folder name)
  path: string;        // Full file path or folder path
  type: NodeType;      // Node type: root, folder, or file
  fileType?: FileType; // For files: markdown or other (undefined for folders)
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export type EdgeType = 'structural' | 'conceptual';

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;       // Link strength (can be used for styling)
  type: EdgeType;      // Edge type: structural (hierarchy) or conceptual (wiki-links)
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/**
 * Extracts wiki-style links [[Link Text]] from markdown content
 * Handles both normal and escaped wiki-links (with backslashes)
 */
export function extractWikiLinks(content: string): string[] {
  // Match both [[link]] and \[\[link\]\] (escaped versions)
  const wikiLinkRegex = /\\?\[\\?\[([^\]\\]+(?:\\[^\]\\]+)*)\\?\]\\?\]/g;
  const links: string[] = [];
  let match;

  while ((match = wikiLinkRegex.exec(content)) !== null) {
    // Remove any escape characters from the captured link text
    const linkText = match[1].replace(/\\_/g, '_').replace(/\\/g, '').trim();
    links.push(linkText);
  }

  return links;
}

/**
 * Converts file path to node name (removes extension)
 */
export function pathToNodeName(filePath: string): string {
  const parts = filePath.split(/[\/\\]/);
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.md$/, '');
}

/**
 * Normalizes path separators to use backslashes consistently
 */
export function normalizePath(path: string): string {
  return path.replace(/\//g, '\\');
}

/**
 * Extracts folder path from file path
 */
export function getParentFolder(filePath: string): string | null {
  const normalized = normalizePath(filePath);
  const parts = normalized.split('\\');
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join('\\');
}

/**
 * Gets the folder name from a folder path
 */
export function getFolderName(folderPath: string): string {
  const normalized = normalizePath(folderPath);
  const parts = normalized.split('\\');
  return parts[parts.length - 1] || folderPath;
}

/**
 * Finds the common root folder from multiple file paths
 */
export function findCommonRoot(filePaths: string[]): string {
  if (filePaths.length === 0) return '';

  // Normalize all paths first
  const normalizedPaths = filePaths.map(p => normalizePath(p));
  const pathArrays = normalizedPaths.map(path => path.split('\\'));
  const firstPath = pathArrays[0];

  // Find common prefix
  let commonLength = 0;
  for (let i = 0; i < firstPath.length - 1; i++) { // -1 to exclude filename
    if (pathArrays.every(parts => parts[i] === firstPath[i])) {
      commonLength = i + 1;
    } else {
      break;
    }
  }

  return firstPath.slice(0, commonLength).join('\\');
}

/**
 * Extracts all unique folder paths from file paths, relative to the common root
 */
export function extractFolderStructure(filePaths: string[]): {
  rootPath: string;
  folders: Set<string>;
} {
  const folders = new Set<string>();

  // Find the common root (user-selected folder)
  const commonRoot = findCommonRoot(filePaths);
  const rootPath = commonRoot;

  filePaths.forEach(filePath => {
    const normalized = normalizePath(filePath);
    const parts = normalized.split('\\');
    const rootParts = commonRoot.split('\\');

    // Build folder hierarchy starting from the common root
    for (let i = rootParts.length + 1; i < parts.length; i++) {
      const folderPath = parts.slice(0, i).join('\\');
      folders.add(folderPath);
    }
  });

  return { rootPath, folders };
}

/**
 * Builds graph data structure from file tree and their contents
 * This will be called from the Rust backend via Tauri commands
 * Now includes folder nodes and both structural and conceptual edges
 */
export function buildGraphFromFiles(
  files: Array<{ path: string; content: string }>,
  allFolders?: string[]
): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const nodeMap = new Map<string, GraphNode>();
  const fileNodeMap = new Map<string, GraphNode>(); // For wiki-link resolution

  // Extract folder structure
  const filePaths = files.map(f => f.path);

  // Use provided folders if available, otherwise extract from file paths
  let rootPath: string;
  let folders: Set<string>;

  if (allFolders && allFolders.length > 0) {
    // Use all folders provided by backend (includes empty folders)
    // Normalize all folder paths
    const normalizedFolders = allFolders.map(f => normalizePath(f));
    rootPath = findCommonRoot([...filePaths, ...normalizedFolders]);
    folders = new Set(normalizedFolders);
  } else {
    // Fallback to extracting from file paths only
    const result = extractFolderStructure(filePaths);
    rootPath = result.rootPath;
    folders = result.folders;
  }

  // Create root folder node
  if (rootPath) {
    const rootNode: GraphNode = {
      id: rootPath,
      name: getFolderName(rootPath),
      path: rootPath,
      type: 'root'
    };
    nodes.push(rootNode);
    nodeMap.set(rootPath, rootNode);
  }

  // Create folder nodes for all subfolders
  folders.forEach(folderPath => {
    if (folderPath === rootPath) return; // Skip root, already added

    const folderNode: GraphNode = {
      id: folderPath,
      name: getFolderName(folderPath),
      path: folderPath,
      type: 'folder'
    };
    nodes.push(folderNode);
    nodeMap.set(folderPath, folderNode);
  });

  // Create structural edges for folder hierarchy
  folders.forEach(folderPath => {
    const parentPath = getParentFolder(folderPath);
    if (parentPath && nodeMap.has(parentPath)) {
      links.push({
        source: parentPath,
        target: folderPath,
        value: 1,
        type: 'structural'
      });
    }
  });

  // Create file nodes
  files.forEach(file => {
    const nodeName = pathToNodeName(file.path);
    const isMarkdown = file.path.toLowerCase().endsWith('.md');
    const fileNode: GraphNode = {
      id: file.path,
      name: nodeName,
      path: file.path,
      type: 'file',
      fileType: isMarkdown ? 'markdown' : 'other'
    };
    nodes.push(fileNode);
    nodeMap.set(file.path, fileNode);

    // Only add markdown files to fileNodeMap for wiki-link resolution
    if (isMarkdown) {
      fileNodeMap.set(nodeName.toLowerCase(), fileNode);
    }

    // Create structural edge from file to its parent folder
    const parentFolder = getParentFolder(file.path);
    if (parentFolder && nodeMap.has(parentFolder)) {
      links.push({
        source: parentFolder,
        target: file.path,
        value: 1,
        type: 'structural'
      });
    }
  });

  // Create conceptual edges (wiki-links) between files
  files.forEach(file => {
    const sourceNode = nodeMap.get(file.path);
    if (!sourceNode) return;

    const wikiLinks = extractWikiLinks(file.content);

    console.log(`📝 File: ${pathToNodeName(file.path)}`);
    console.log(`   Wiki-links found: ${wikiLinks.join(', ') || '(none)'}`);

    wikiLinks.forEach(linkText => {
      const targetNode = fileNodeMap.get(linkText.toLowerCase());
      console.log(`   Looking for: "${linkText}" (normalized: "${linkText.toLowerCase()}")`);
      console.log(`   Found target: ${targetNode ? targetNode.name : 'NOT FOUND'}`);

      if (targetNode && targetNode.id !== sourceNode.id) {
        console.log(`   ✅ Creating link: ${sourceNode.name} -> ${targetNode.name}`);
        links.push({
          source: sourceNode.id,
          target: targetNode.id,
          value: 1,
          type: 'conceptual'
        });
      } else if (!targetNode) {
        console.log(`   ❌ No target node found for wiki-link: "${linkText}"`);
        console.log(`   Available nodes: ${Array.from(fileNodeMap.keys()).join(', ')}`);
      }
    });
  });

  return { nodes, links };
}

/**
 * Calculates node color based on node type and file type
 */
export function getNodeColor(nodeType: NodeType, fileType?: FileType): string {
  // Folders (root and subfolders) are always purple
  if (nodeType === 'root' || nodeType === 'folder') {
    return '#c4b5fd'; // pastel purple
  }

  // Files: blue for markdown, gray for others
  if (fileType === 'markdown') {
    return '#3b82f6'; // blue
  }
  return '#6b7280'; // gray for other file types
}

/**
 * Calculates node size based on node type and connections
 */
export function getNodeSize(nodeType: NodeType, connectionCount: number): number {
  // Root folder is larger
  if (nodeType === 'root') {
    return 24;
  }

  // Subfolders and files have normal sizing
  const baseSize = 8;
  const maxSize = 20;
  return Math.min(baseSize + connectionCount * 2, maxSize);
}
