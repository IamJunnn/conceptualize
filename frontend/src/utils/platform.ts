/**
 * Platform detection utilities for cross-platform compatibility
 */

// Detect if running on macOS
export const isMac = (): boolean => {
  // Check Tauri platform first
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    // Tauri v2 exposes platform info
    const platform = (window as any).__TAURI_INTERNALS__?.metadata?.currentWindow?.platform;
    if (platform) {
      return platform === 'darwin';
    }
  }

  // Fallback to navigator checks
  if (typeof navigator !== 'undefined') {
    // Modern approach
    if ('userAgentData' in navigator) {
      const platform = (navigator as any).userAgentData?.platform;
      if (platform) {
        return platform.toLowerCase().includes('mac');
      }
    }

    // Legacy approach
    const platform = navigator.platform?.toLowerCase() || '';
    const userAgent = navigator.userAgent?.toLowerCase() || '';

    return platform.includes('mac') || userAgent.includes('macintosh');
  }

  return false;
};

// Detect if using a trackpad (heuristic - not 100% reliable)
export const isLikelyTrackpad = (): boolean => {
  // On Mac, most users use trackpad
  // This is a heuristic - there's no reliable way to detect trackpad vs mouse
  return isMac();
};

// Cache the result for performance
let cachedIsMac: boolean | null = null;

export const getIsMac = (): boolean => {
  if (cachedIsMac === null) {
    cachedIsMac = isMac();
  }
  return cachedIsMac;
};

// Event handling configuration based on platform
export const getPlatformEventConfig = () => {
  const mac = getIsMac();

  return {
    // On Mac trackpads, require more distance before starting drag
    dragDistanceThreshold: mac ? 15 : 8,
    // On Mac, require more time to distinguish click from drag
    dragTimeThreshold: mac ? 200 : 100,
    // On Mac, use slightly longer debounce for double-click detection
    doubleClickDelay: mac ? 300 : 250,
  };
};
