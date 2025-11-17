/**
 * Complete reset utility for testing team workflow from scratch
 * Run this in the browser console to reset everything
 */

import { clearAllAuthData } from './clearData';
import { clearAppMode } from '../services/appModeService';
import { invoke } from '@tauri-apps/api/core';

/**
 * Complete reset - clears everything and restarts the app flow
 */
export async function resetForTesting(): Promise<void> {
  console.log('🔄 COMPLETE RESET FOR TESTING');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    // Step 1: Clear all authentication data
    console.log('1️⃣ Clearing authentication data...');
    await clearAllAuthData();
    console.log('   ✅ Auth data cleared');

    // Step 2: Clear app mode (force mode selection screen)
    console.log('2️⃣ Clearing app mode...');
    await clearAppMode();
    console.log('   ✅ App mode cleared');

    // Step 3: Clear root folder setting (if in local mode)
    console.log('3️⃣ Clearing root folder setting...');
    try {
      await invoke('delete_config_value', { key: 'root_folder' });
      console.log('   ✅ Root folder cleared');
    } catch (error) {
      console.log('   ⚠️ Root folder not set or already cleared');
    }

    // Step 4: Clear all localStorage
    console.log('4️⃣ Clearing all localStorage...');
    localStorage.clear();
    sessionStorage.clear();
    console.log('   ✅ All storage cleared');

    console.log('');
    console.log('✅ RESET COMPLETE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📋 Next steps:');
    console.log('   1. Reload the app (F5)');
    console.log('   2. Select "Team Mode"');
    console.log('   3. Sign in with Google');
    console.log('   4. Create a new team');
    console.log('   5. Test creating notes');
    console.log('');
    console.log('🔄 Reloading in 3 seconds...');

    // Auto-reload after 3 seconds
    setTimeout(() => {
      window.location.reload();
    }, 3000);

  } catch (error) {
    console.error('❌ Error during reset:', error);
    throw error;
  }
}

/**
 * Quick auth reset (keeps app mode)
 */
export async function resetAuthOnly(): Promise<void> {
  console.log('🔄 Resetting authentication only...');
  await clearAllAuthData();
  console.log('✅ Auth reset complete. Reload to sign in again.');
}

/**
 * Reset local mode settings (folder selection)
 * Use this to start fresh with folder selection in local mode
 */
export async function resetLocalMode(): Promise<void> {
  console.log('🔄 Resetting local mode settings...');

  try {
    // Clear root folder setting
    await invoke('delete_config_value', { key: 'root_folder' });
    console.log('   ✅ Root folder cleared');

    // Clear app mode to go back to mode selection
    await clearAppMode();
    console.log('   ✅ App mode cleared');

    console.log('');
    console.log('✅ Local mode reset complete!');
    console.log('🔄 Reloading in 2 seconds...');

    setTimeout(() => {
      window.location.reload();
    }, 2000);
  } catch (error) {
    console.error('❌ Error resetting local mode:', error);
    throw error;
  }
}

// Make available in console
if (typeof window !== 'undefined') {
  (window as any).resetForTesting = resetForTesting;
  (window as any).resetAuthOnly = resetAuthOnly;
  (window as any).resetLocalMode = resetLocalMode;

  console.log('🧪 Testing utilities loaded!');
  console.log('  • resetForTesting() - Complete reset (clears everything)');
  console.log('  • resetAuthOnly() - Clear auth only (keeps app mode & folder)');
  console.log('  • resetLocalMode() - Reset folder selection for local mode');
}
