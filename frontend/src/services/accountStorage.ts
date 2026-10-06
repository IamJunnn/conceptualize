// Account Storage Service
// Provides persistent storage for multiple accounts using Tauri's config storage
// Accounts persist across app updates

import { invoke } from '@tauri-apps/api/core';

export interface StoredAccount {
  id: string;                    // Firebase UID
  email: string;
  displayName: string;
  photoURL?: string;
  customAvatar?: string;
  googleRefreshToken?: string;   // For Google accounts (enables instant switch)
  lastUsed: number;              // Timestamp for sorting
  authMethod: 'google' | 'email';
}

interface AccountsData {
  accounts: StoredAccount[];
  activeAccountId: string | null;
}

const ACCOUNTS_KEY = 'saved_accounts';

/**
 * Get all stored accounts from Tauri persistent storage
 */
export async function getStoredAccounts(): Promise<StoredAccount[]> {
  try {
    const data = await invoke<string | null>('get_config_value', { key: ACCOUNTS_KEY });
    if (!data) return [];

    const parsed: AccountsData = JSON.parse(data);
    return parsed.accounts || [];
  } catch (error) {
    console.error('Failed to get stored accounts:', error);
    return [];
  }
}

/**
 * Get the active account ID
 */
export async function getActiveAccountId(): Promise<string | null> {
  try {
    const data = await invoke<string | null>('get_config_value', { key: ACCOUNTS_KEY });
    if (!data) return null;

    const parsed: AccountsData = JSON.parse(data);
    return parsed.activeAccountId || null;
  } catch (error) {
    console.error('Failed to get active account ID:', error);
    return null;
  }
}

/**
 * Set the active account ID
 */
export async function setActiveAccountId(accountId: string | null): Promise<void> {
  try {
    const accounts = await getStoredAccounts();
    const data: AccountsData = {
      accounts,
      activeAccountId: accountId,
    };
    await invoke('set_config_value', {
      key: ACCOUNTS_KEY,
      value: JSON.stringify(data),
    });
  } catch (error) {
    console.error('Failed to set active account ID:', error);
    throw error;
  }
}

/**
 * Save or update an account in storage
 */
export async function saveAccount(account: StoredAccount): Promise<void> {
  try {
    const accounts = await getStoredAccounts();
    const activeId = await getActiveAccountId();

    // Check if account already exists
    const existingIndex = accounts.findIndex(a => a.id === account.id);

    if (existingIndex >= 0) {
      // Update existing account
      accounts[existingIndex] = {
        ...accounts[existingIndex],
        ...account,
        lastUsed: Date.now(),
      };
    } else {
      // Add new account
      accounts.push({
        ...account,
        lastUsed: Date.now(),
      });
    }

    const data: AccountsData = {
      accounts,
      activeAccountId: activeId,
    };

    await invoke('set_config_value', {
      key: ACCOUNTS_KEY,
      value: JSON.stringify(data),
    });

    console.log('Account saved:', account.email);
  } catch (error) {
    console.error('Failed to save account:', error);
    throw error;
  }
}

/**
 * Remove an account from storage
 */
export async function removeAccount(accountId: string): Promise<void> {
  try {
    const accounts = await getStoredAccounts();
    const activeId = await getActiveAccountId();

    const filteredAccounts = accounts.filter(a => a.id !== accountId);

    const data: AccountsData = {
      accounts: filteredAccounts,
      // Clear active ID if removing the active account
      activeAccountId: activeId === accountId ? null : activeId,
    };

    await invoke('set_config_value', {
      key: ACCOUNTS_KEY,
      value: JSON.stringify(data),
    });

    console.log('Account removed:', accountId);
  } catch (error) {
    console.error('Failed to remove account:', error);
    throw error;
  }
}

/**
 * Update the lastUsed timestamp for an account
 */
export async function updateAccountLastUsed(accountId: string): Promise<void> {
  try {
    const accounts = await getStoredAccounts();
    const activeId = await getActiveAccountId();

    const updatedAccounts = accounts.map(a =>
      a.id === accountId ? { ...a, lastUsed: Date.now() } : a
    );

    const data: AccountsData = {
      accounts: updatedAccounts,
      activeAccountId: activeId,
    };

    await invoke('set_config_value', {
      key: ACCOUNTS_KEY,
      value: JSON.stringify(data),
    });
  } catch (error) {
    console.error('Failed to update account lastUsed:', error);
    throw error;
  }
}

/**
 * Get a specific account by ID
 */
export async function getAccountById(accountId: string): Promise<StoredAccount | null> {
  const accounts = await getStoredAccounts();
  return accounts.find(a => a.id === accountId) || null;
}

/**
 * Get accounts sorted by last used (most recent first)
 */
export async function getAccountsSortedByLastUsed(): Promise<StoredAccount[]> {
  const accounts = await getStoredAccounts();
  return accounts.sort((a, b) => b.lastUsed - a.lastUsed);
}

/**
 * Clear all stored accounts (for debugging/testing)
 */
export async function clearAllAccounts(): Promise<void> {
  try {
    await invoke('delete_config_value', { key: ACCOUNTS_KEY });
    console.log('All accounts cleared');
  } catch (error) {
    console.error('Failed to clear accounts:', error);
    throw error;
  }
}

/**
 * Check if an account exists in storage
 */
export async function hasAccount(accountId: string): Promise<boolean> {
  const accounts = await getStoredAccounts();
  return accounts.some(a => a.id === accountId);
}

/**
 * Get the count of saved accounts
 */
export async function getAccountCount(): Promise<number> {
  const accounts = await getStoredAccounts();
  return accounts.length;
}

/**
 * Update account profile (avatar, displayName) without changing other fields
 */
export async function updateAccountProfile(
  accountId: string,
  updates: { displayName?: string; photoURL?: string; customAvatar?: string }
): Promise<void> {
  try {
    const accounts = await getStoredAccounts();
    const activeId = await getActiveAccountId();

    const accountIndex = accounts.findIndex(a => a.id === accountId);
    if (accountIndex < 0) return; // Account not found, skip

    // Only update if there are actual changes
    const account = accounts[accountIndex];
    const hasChanges =
      (updates.displayName && updates.displayName !== account.displayName) ||
      (updates.photoURL !== undefined && updates.photoURL !== account.photoURL) ||
      (updates.customAvatar !== undefined && updates.customAvatar !== account.customAvatar);

    if (!hasChanges) return;

    accounts[accountIndex] = {
      ...account,
      ...(updates.displayName && { displayName: updates.displayName }),
      ...(updates.photoURL !== undefined && { photoURL: updates.photoURL }),
      ...(updates.customAvatar !== undefined && { customAvatar: updates.customAvatar }),
    };

    const data: AccountsData = {
      accounts,
      activeAccountId: activeId,
    };

    await invoke('set_config_value', {
      key: ACCOUNTS_KEY,
      value: JSON.stringify(data),
    });

    console.log('Account profile updated:', accountId);
  } catch (error) {
    console.error('Failed to update account profile:', error);
  }
}
