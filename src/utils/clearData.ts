/**
 * Development utility to clear all user data
 * Use this for testing and debugging
 */

import { signOut } from '../services/authServiceTauri';
import { clearDriveTokens } from '../services/googleDriveService';

/**
 * Clear all authentication and Drive tokens
 */
export async function clearAllAuthData(): Promise<void> {
  try {
    console.log('🧹 Clearing all authentication data...');

    // 1. Clear Google Drive tokens
    clearDriveTokens();

    // 2. Sign out from Firebase
    await signOut();

    // 3. Clear any other localStorage data related to auth
    const keysToRemove = [
      'google_access_token',
      'google_refresh_token',
      'google_token_expires_at',
      'firebase:authUser',
      'firebase:host',
    ];

    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });

    // 4. Clear all localStorage starting with specific prefixes
    Object.keys(localStorage).forEach(key => {
      if (
        key.startsWith('firebase:') ||
        key.startsWith('google_') ||
        key.startsWith('auth_')
      ) {
        localStorage.removeItem(key);
      }
    });

    console.log('✅ All authentication data cleared');
    console.log('📌 You can now sign in again with a fresh account');

    return;
  } catch (error) {
    console.error('❌ Error clearing auth data:', error);
    throw error;
  }
}

/**
 * Clear EVERYTHING (nuclear option)
 * Use only for complete reset during development
 */
export function clearEverything(): void {
  console.log('💣 NUCLEAR CLEAR: Removing all localStorage data...');
  localStorage.clear();
  sessionStorage.clear();
  console.log('✅ Everything cleared. Please reload the app.');
}

/**
 * Show what's currently stored
 */
export function showStoredData(): void {
  console.log('📊 Current stored data:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Google Drive tokens
  console.log('🔐 Google Drive:');
  console.log('  access_token:', localStorage.getItem('google_access_token') ? 'SET ✓' : 'NOT SET ✗');
  console.log('  refresh_token:', localStorage.getItem('google_refresh_token') ? 'SET ✓' : 'NOT SET ✗');
  const expiresAt = localStorage.getItem('google_token_expires_at');
  if (expiresAt) {
    const expires = new Date(parseInt(expiresAt));
    const isExpired = Date.now() >= parseInt(expiresAt);
    console.log(`  expires_at: ${expires.toLocaleString()} ${isExpired ? '(EXPIRED)' : '(VALID)'}`);
  }

  console.log('');

  // All localStorage keys
  console.log('📦 All localStorage keys:');
  Object.keys(localStorage).forEach(key => {
    const value = localStorage.getItem(key);
    const preview = value && value.length > 50 ? value.substring(0, 50) + '...' : value;
    console.log(`  ${key}: ${preview}`);
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// Make functions available in browser console for development
if (typeof window !== 'undefined') {
  (window as any).clearAllAuthData = clearAllAuthData;
  (window as any).clearEverything = clearEverything;
  (window as any).showStoredData = showStoredData;
  console.log('🛠️ Dev tools loaded! Available commands:');
  console.log('  • clearAllAuthData() - Clear auth tokens and sign out');
  console.log('  • clearEverything() - Nuclear option: clear ALL data');
  console.log('  • showStoredData() - Show what\'s currently stored');
}
