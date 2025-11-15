// App Mode Service - Manages local vs team mode preference
import { invoke } from '@tauri-apps/api/core';

export type AppMode = 'local' | 'team' | null;

const APP_MODE_KEY = 'app_mode';

/**
 * Get the current app mode from storage
 */
export const getAppMode = async (): Promise<AppMode> => {
  try {
    const mode = await invoke<string | null>('get_config_value', { key: APP_MODE_KEY });
    return (mode as AppMode) || null;
  } catch (error) {
    console.error('Error getting app mode:', error);
    return null;
  }
};

/**
 * Set the app mode in storage
 */
export const setAppMode = async (mode: AppMode): Promise<void> => {
  try {
    await invoke('set_config_value', {
      key: APP_MODE_KEY,
      value: mode
    });
  } catch (error) {
    console.error('Error setting app mode:', error);
    throw error;
  }
};

/**
 * Clear the app mode (reset to selection screen)
 */
export const clearAppMode = async (): Promise<void> => {
  try {
    await invoke('delete_config_value', { key: APP_MODE_KEY });
  } catch (error) {
    console.error('Error clearing app mode:', error);
    throw error;
  }
};

/**
 * Check if app is in team mode
 */
export const isTeamMode = async (): Promise<boolean> => {
  const mode = await getAppMode();
  return mode === 'team';
};

/**
 * Check if app is in local mode
 */
export const isLocalMode = async (): Promise<boolean> => {
  const mode = await getAppMode();
  return mode === 'local';
};
