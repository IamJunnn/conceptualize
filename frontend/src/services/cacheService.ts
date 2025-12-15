/**
 * Cache Service - IndexedDB-based persistent caching
 * Provides "stale-while-revalidate" pattern for instant loading
 */

const DB_NAME = 'conceptualize-cache';
const DB_VERSION = 1;

// Store names
const STORES = {
  FILE_CONTENT: 'file-content',
  FILE_LIST: 'file-list',
  GRAPH_DATA: 'graph-data',
  METADATA: 'metadata',
  DOWNLOAD_URL: 'download-url',
};

// Cache durations - optimized for reduced egress
const CACHE_DURATIONS = {
  FILE_CONTENT: 15 * 60 * 1000,   // 15 minutes for file content
  FILE_LIST: 30 * 60 * 1000,      // 30 minutes for file lists
  GRAPH_DATA: 15 * 60 * 1000,     // 15 minutes for graph data
  METADATA: 30 * 60 * 1000,       // 30 minutes for file metadata
  DOWNLOAD_URL: 45 * 60 * 1000,   // 45 minutes for download URLs (Firebase URLs valid ~1hr)
};

interface CacheEntry<T> {
  key: string;
  data: T;
  timestamp: number;
  teamId: string;
}

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize IndexedDB
 */
async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[CacheService] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create stores with indexes
      Object.values(STORES).forEach(storeName => {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'key' });
          store.createIndex('teamId', 'teamId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      });
    };
  });

  return dbInitPromise;
}

/**
 * Get data from cache
 */
async function getFromCache<T>(
  storeName: string,
  key: string,
  maxAge?: number
): Promise<{ data: T; isStale: boolean } | null> {
  try {
    const db = await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entry = request.result as CacheEntry<T> | undefined;

        if (!entry) {
          resolve(null);
          return;
        }

        const age = Date.now() - entry.timestamp;
        const isStale = maxAge ? age > maxAge : false;

        resolve({ data: entry.data, isStale });
      };
    });
  } catch (error) {
    console.warn('[CacheService] Get cache error:', error);
    return null;
  }
}

/**
 * Store data in cache
 */
async function setInCache<T>(
  storeName: string,
  key: string,
  data: T,
  teamId: string
): Promise<void> {
  try {
    const db = await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      const entry: CacheEntry<T> = {
        key,
        data,
        timestamp: Date.now(),
        teamId,
      };

      const request = store.put(entry);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.warn('[CacheService] Set cache error:', error);
  }
}

/**
 * Delete specific key from cache
 */
async function deleteFromCache(storeName: string, key: string): Promise<void> {
  try {
    const db = await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.warn('[CacheService] Delete cache error:', error);
  }
}

/**
 * Clear all cache for a team
 */
async function clearTeamCache(teamId: string): Promise<void> {
  try {
    const db = await initDB();

    for (const storeName of Object.values(STORES)) {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const index = store.index('teamId');
        const request = index.openCursor(IDBKeyRange.only(teamId));

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            cursor.continue();
          } else {
            resolve();
          }
        };
      });
    }
  } catch (error) {
    console.warn('[CacheService] Clear team cache error:', error);
  }
}

/**
 * Clear all caches
 */
async function clearAllCaches(): Promise<void> {
  try {
    const db = await initDB();

    for (const storeName of Object.values(STORES)) {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    }
  } catch (error) {
    console.warn('[CacheService] Clear all caches error:', error);
  }
}

// ============================================================================
// PUBLIC API - File Content Cache
// ============================================================================

export async function getCachedFileContent(
  teamId: string,
  filePath: string
): Promise<{ content: string; isStale: boolean } | null> {
  const key = `${teamId}:${filePath}`;
  const result = await getFromCache<string>(STORES.FILE_CONTENT, key, CACHE_DURATIONS.FILE_CONTENT);
  if (!result) return null;
  return { content: result.data, isStale: result.isStale };
}

export async function setCachedFileContent(
  teamId: string,
  filePath: string,
  content: string
): Promise<void> {
  const key = `${teamId}:${filePath}`;
  await setInCache(STORES.FILE_CONTENT, key, content, teamId);
}

export async function invalidateFileContent(teamId: string, filePath: string): Promise<void> {
  const key = `${teamId}:${filePath}`;
  await deleteFromCache(STORES.FILE_CONTENT, key);
}

// ============================================================================
// PUBLIC API - File List Cache
// ============================================================================

export interface CachedFileList {
  files: Array<{
    id: string;
    name: string;
    fullPath: string;
    isFolder: boolean;
    size?: number;
    modifiedTime?: string;
  }>;
}

export async function getCachedFileList(
  teamId: string,
  path: string = ''
): Promise<{ data: CachedFileList; isStale: boolean } | null> {
  const key = `${teamId}:list:${path}`;
  return getFromCache<CachedFileList>(STORES.FILE_LIST, key, CACHE_DURATIONS.FILE_LIST);
}

export async function setCachedFileList(
  teamId: string,
  path: string,
  files: CachedFileList
): Promise<void> {
  const key = `${teamId}:list:${path}`;
  await setInCache(STORES.FILE_LIST, key, files, teamId);
}

export async function invalidateFileList(teamId: string): Promise<void> {
  // Invalidate all file lists for this team
  try {
    const db = await initDB();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORES.FILE_LIST, 'readwrite');
      const store = transaction.objectStore(STORES.FILE_LIST);
      const index = store.index('teamId');
      const request = index.openCursor(IDBKeyRange.only(teamId));

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  } catch (error) {
    console.warn('[CacheService] Invalidate file list error:', error);
  }
}

// ============================================================================
// PUBLIC API - Graph Data Cache
// ============================================================================

export interface CachedGraphData {
  nodes: Array<{
    id: string;
    type: string;
    connections: number;
  }>;
  links: Array<{
    source: string;
    target: string;
  }>;
}

export async function getCachedGraphData(
  teamId: string
): Promise<{ data: CachedGraphData; isStale: boolean } | null> {
  const key = `${teamId}:graph`;
  return getFromCache<CachedGraphData>(STORES.GRAPH_DATA, key, CACHE_DURATIONS.GRAPH_DATA);
}

export async function setCachedGraphData(
  teamId: string,
  graphData: CachedGraphData
): Promise<void> {
  const key = `${teamId}:graph`;
  await setInCache(STORES.GRAPH_DATA, key, graphData, teamId);
}

export async function invalidateGraphData(teamId: string): Promise<void> {
  const key = `${teamId}:graph`;
  await deleteFromCache(STORES.GRAPH_DATA, key);
}

// ============================================================================
// PUBLIC API - Metadata Cache (reduces getMetadata API calls)
// ============================================================================

export interface CachedMetadata {
  size: number;
  contentType?: string;
  updated: string;
  customMetadata?: Record<string, string>;
}

export async function getCachedMetadata(
  teamId: string,
  fullPath: string
): Promise<{ data: CachedMetadata; isStale: boolean } | null> {
  const key = `${teamId}:metadata:${fullPath}`;
  return getFromCache<CachedMetadata>(STORES.METADATA, key, CACHE_DURATIONS.METADATA);
}

export async function setCachedMetadata(
  teamId: string,
  fullPath: string,
  metadata: CachedMetadata
): Promise<void> {
  const key = `${teamId}:metadata:${fullPath}`;
  await setInCache(STORES.METADATA, key, metadata, teamId);
}

export async function invalidateMetadata(teamId: string, fullPath?: string): Promise<void> {
  if (fullPath) {
    const key = `${teamId}:metadata:${fullPath}`;
    await deleteFromCache(STORES.METADATA, key);
  } else {
    // Invalidate all metadata for team
    try {
      const db = await initDB();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORES.METADATA, 'readwrite');
        const store = transaction.objectStore(STORES.METADATA);
        const index = store.index('teamId');
        const request = index.openCursor(IDBKeyRange.only(teamId));

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            cursor.continue();
          } else {
            resolve();
          }
        };
      });
    } catch (error) {
      console.warn('[CacheService] Invalidate metadata error:', error);
    }
  }
}

// ============================================================================
// PUBLIC API - Download URL Cache (reduces getDownloadURL API calls)
// ============================================================================

export async function getCachedDownloadUrl(
  teamId: string,
  fullPath: string
): Promise<{ url: string; isStale: boolean } | null> {
  const key = `${teamId}:url:${fullPath}`;
  const result = await getFromCache<string>(STORES.DOWNLOAD_URL, key, CACHE_DURATIONS.DOWNLOAD_URL);
  if (!result) return null;
  return { url: result.data, isStale: result.isStale };
}

export async function setCachedDownloadUrl(
  teamId: string,
  fullPath: string,
  url: string
): Promise<void> {
  const key = `${teamId}:url:${fullPath}`;
  await setInCache(STORES.DOWNLOAD_URL, key, url, teamId);
}

export async function invalidateDownloadUrl(teamId: string, fullPath?: string): Promise<void> {
  if (fullPath) {
    const key = `${teamId}:url:${fullPath}`;
    await deleteFromCache(STORES.DOWNLOAD_URL, key);
  } else {
    // Invalidate all URLs for team
    try {
      const db = await initDB();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORES.DOWNLOAD_URL, 'readwrite');
        const store = transaction.objectStore(STORES.DOWNLOAD_URL);
        const index = store.index('teamId');
        const request = index.openCursor(IDBKeyRange.only(teamId));

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            cursor.continue();
          } else {
            resolve();
          }
        };
      });
    } catch (error) {
      console.warn('[CacheService] Invalidate download URL error:', error);
    }
  }
}

// ============================================================================
// PUBLIC API - Team Cache Management
// ============================================================================

export { clearTeamCache, clearAllCaches };

/**
 * Warm up cache for a team - preload essential data
 */
export async function warmUpTeamCache(_teamId: string): Promise<void> {
  // This function is called when switching teams
  // The actual data loading will populate the cache
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  fileContentCount: number;
  fileListCount: number;
  graphDataCount: number;
}> {
  try {
    const db = await initDB();

    const counts = await Promise.all(
      Object.values(STORES).map(storeName => {
        return new Promise<number>((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readonly');
          const store = transaction.objectStore(storeName);
          const request = store.count();

          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
      })
    );

    return {
      fileContentCount: counts[0],
      fileListCount: counts[1],
      graphDataCount: counts[2],
    };
  } catch (error) {
    console.warn('[CacheService] Get stats error:', error);
    return { fileContentCount: 0, fileListCount: 0, graphDataCount: 0 };
  }
}
