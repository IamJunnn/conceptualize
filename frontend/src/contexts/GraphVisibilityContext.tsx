import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface GraphVisibilityContextType {
  hiddenPaths: Set<string>;
  hideItem: (path: string, isFolder: boolean, allPaths: string[]) => void;
  showItem: (path: string, isFolder: boolean, allPaths: string[]) => void;
  showAll: () => void;
  isHidden: (path: string) => boolean;
  getHiddenCount: () => number;
}

const GraphVisibilityContext = createContext<GraphVisibilityContextType | undefined>(undefined);

const STORAGE_KEY = 'graph-hidden-items';

export const GraphVisibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hiddenPaths, setHiddenPaths] = useState<Set<string>>(() => {
    // Load from localStorage on init
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        return new Set(parsed);
      }
    } catch (error) {
      console.error('Error loading hidden paths:', error);
    }
    return new Set();
  });

  // Save to localStorage whenever hiddenPaths changes
  useEffect(() => {
    try {
      const array = Array.from(hiddenPaths);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(array));
    } catch (error) {
      console.error('Error saving hidden paths:', error);
    }
  }, [hiddenPaths]);

  // Get all child paths for a folder
  const getChildPaths = useCallback((folderPath: string, allPaths: string[]): string[] => {
    const normalizedFolder = folderPath.replace(/\\/g, '/').toLowerCase();
    return allPaths.filter(path => {
      const normalized = path.replace(/\\/g, '/').toLowerCase();
      return normalized.startsWith(normalizedFolder + '/');
    });
  }, []);

  // Get all parent paths for a file/folder
  const getParentPaths = useCallback((itemPath: string): string[] => {
    const parents: string[] = [];
    const parts = itemPath.replace(/\\/g, '/').split('/');

    // Build parent paths from bottom to top
    for (let i = parts.length - 1; i > 0; i--) {
      const parentPath = parts.slice(0, i).join('/');
      if (parentPath) {
        parents.push(parentPath);
      }
    }

    return parents;
  }, []);

  const hideItem = useCallback((path: string, isFolder: boolean, allPaths: string[]) => {
    setHiddenPaths(prev => {
      const newHidden = new Set(prev);
      newHidden.add(path);

      // If it's a folder, hide all children
      if (isFolder) {
        const children = getChildPaths(path, allPaths);
        children.forEach(child => newHidden.add(child));
      }

      return newHidden;
    });
  }, [getChildPaths]);

  const showItem = useCallback((path: string, isFolder: boolean, allPaths: string[]) => {
    setHiddenPaths(prev => {
      const newHidden = new Set(prev);
      newHidden.delete(path);

      // If it's a folder, show all children
      if (isFolder) {
        const children = getChildPaths(path, allPaths);
        children.forEach(child => newHidden.delete(child));
      }

      // Show all parent folders
      const parents = getParentPaths(path);
      parents.forEach(parent => newHidden.delete(parent));

      return newHidden;
    });
  }, [getChildPaths, getParentPaths]);

  const showAll = useCallback(() => {
    setHiddenPaths(new Set());
  }, []);

  const isHidden = useCallback((path: string): boolean => {
    return hiddenPaths.has(path);
  }, [hiddenPaths]);

  const getHiddenCount = useCallback((): number => {
    return hiddenPaths.size;
  }, [hiddenPaths]);

  const value: GraphVisibilityContextType = {
    hiddenPaths,
    hideItem,
    showItem,
    showAll,
    isHidden,
    getHiddenCount
  };

  return (
    <GraphVisibilityContext.Provider value={value}>
      {children}
    </GraphVisibilityContext.Provider>
  );
};

export const useGraphVisibility = (): GraphVisibilityContextType => {
  const context = useContext(GraphVisibilityContext);
  if (!context) {
    throw new Error('useGraphVisibility must be used within GraphVisibilityProvider');
  }
  return context;
};
