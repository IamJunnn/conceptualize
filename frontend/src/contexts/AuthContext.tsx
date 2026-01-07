import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
  onAuthStateChange,
  User,
  signOut as authSignOut,
  switchToAccount as authSwitchToAccount,
  signInWithGoogle,
  signInWithEmail,
  StoredAccount,
} from '../services/authServiceTauri';
import {
  getStoredAccounts,
  removeAccount as removeStoredAccount,
  getAccountById,
  updateAccountProfile,
} from '../services/accountStorage';
import { checkLocalPartnerDomain } from '../services/promoService';
import type { PartnerCheck } from '../services/promoTypes';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: (removeFromSaved?: boolean) => Promise<void>;
  refreshUser: () => void;
  partnerInfo: PartnerCheck | null;
  isPartnerUser: boolean;
  // Multi-account support
  savedAccounts: StoredAccount[];
  isSwitching: boolean;
  switchAccount: (accountId: string) => Promise<void>;
  addAccount: () => Promise<void>;
  addAccountWithEmail: (email: string, password: string) => Promise<void>;
  removeAccountFromSaved: (accountId: string) => Promise<void>;
  refreshSavedAccounts: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [appMode, setAppModeState] = useState<'local' | 'team' | null>(null);
  const [partnerInfo, setPartnerInfo] = useState<PartnerCheck | null>(null);

  // Multi-account state
  const [savedAccounts, setSavedAccounts] = useState<StoredAccount[]>([]);
  const [isSwitching, setIsSwitching] = useState(false);

  // Monitor app mode changes
  useEffect(() => {
    const checkMode = async () => {
      const { getAppMode } = await import('../services/appModeService');
      const mode = await getAppMode();
      setAppModeState(mode);
    };

    checkMode();

    // Poll for mode changes every second (in case user changes mode)
    const interval = setInterval(checkMode, 1000);
    return () => clearInterval(interval);
  }, []);

  // Set up auth listener when in team mode
  useEffect(() => {
    if (appMode === 'local') {
      // Skip authentication for local mode
      setUser(null);
      setLoading(false);
      setPartnerInfo(null);
      return;
    }

    if (appMode === 'team') {
      // Set up auth listener for team mode
      const unsubscribe = onAuthStateChange((newUser) => {
        setUser(newUser);
        setLoading(false);
      });

      return () => {
        unsubscribe();
      };
    }

    // Mode not set yet
    setLoading(false);
  }, [appMode]);

  // Listen to user profile changes in real-time
  useEffect(() => {
    if (!user?.uid || appMode !== 'team') {
      return;
    }

    // Set up real-time listener to user document
    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.data();
          const newDisplayName = userData.displayName || user.displayName;
          const newCustomAvatar = userData.customAvatar || '';
          const newPhotoURL = userData.photoURL || user.photoURL || '';

          // Update user state with new profile data
          setUser((prevUser) => {
            if (!prevUser) return null;
            return {
              ...prevUser,
              displayName: newDisplayName,
              customAvatar: newCustomAvatar,
              photoURL: newPhotoURL,
            };
          });

          // Sync avatar to stored account for account switcher
          await updateAccountProfile(user.uid, {
            displayName: newDisplayName,
            customAvatar: newCustomAvatar,
            photoURL: newPhotoURL,
          });

          // Refresh savedAccounts to update UI
          const accounts = await getStoredAccounts();
          setSavedAccounts(accounts.sort((a, b) => b.lastUsed - a.lastUsed));
        }
      },
      (error) => {
        console.error('Error listening to user profile changes:', error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user?.uid, appMode]);

  // Check for partner domain when user logs in
  useEffect(() => {
    const checkPartnerDomain = async () => {
      if (user?.email && appMode === 'team') {
        try {
          const result = await checkLocalPartnerDomain(user.email);
          setPartnerInfo(result);
          if (result.isPartner) {
            console.log(`🤝 Partner domain detected: ${result.domain} (${result.partnerName})`);
          }
        } catch (error) {
          console.error('Error checking partner domain:', error);
          setPartnerInfo(null);
        }
      } else {
        setPartnerInfo(null);
      }
    };

    checkPartnerDomain();
  }, [user?.email, appMode]);

  // Load saved accounts on mount and when user changes
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const accounts = await getStoredAccounts();
        setSavedAccounts(accounts.sort((a, b) => b.lastUsed - a.lastUsed));
      } catch (error) {
        console.error('Failed to load saved accounts:', error);
      }
    };

    if (appMode === 'team') {
      loadAccounts();
    }
  }, [appMode, user?.uid]);

  // Refresh saved accounts function
  const refreshSavedAccounts = useCallback(async () => {
    try {
      const accounts = await getStoredAccounts();
      setSavedAccounts(accounts.sort((a, b) => b.lastUsed - a.lastUsed));
    } catch (error) {
      console.error('Failed to refresh saved accounts:', error);
    }
  }, []);

  const signOut = useCallback(async (removeFromSaved = false) => {
    await authSignOut(removeFromSaved);
    setUser(null);
    // Refresh accounts list in case we removed an account
    if (removeFromSaved) {
      await refreshSavedAccounts();
    }
  }, [refreshSavedAccounts]);

  const refreshUser = async () => {
    // Force reload user data from Firestore
    if (user && appMode === 'team') {
      const { getCurrentUser } = await import('../services/authServiceTauri');
      const { auth } = await import('../services/firebase');
      const firebaseUser = auth.currentUser;

      if (firebaseUser) {
        const freshUser = await getCurrentUser(firebaseUser);
        setUser(freshUser);
      }
    }
  };

  // Switch to a different saved account
  const switchAccount = useCallback(async (accountId: string) => {
    // Don't switch if already on this account
    if (accountId === user?.uid) return;

    // Prevent concurrent switches
    if (isSwitching) return;

    setIsSwitching(true);
    try {
      // Check if this is an email account (requires password)
      const account = await getAccountById(accountId);
      if (account?.authMethod === 'email') {
        // For email accounts, we throw a special error to indicate re-auth is needed
        throw new Error('REAUTH_REQUIRED');
      }

      const newUser = await authSwitchToAccount(accountId);
      setUser(newUser);

      // Refresh accounts list to update lastUsed
      await refreshSavedAccounts();
    } catch (error: any) {
      console.error('Account switch error:', error);

      if (error.message === 'REAUTH_REQUIRED') {
        // Token revoked or email account - remove from saved and notify
        await removeStoredAccount(accountId);
        await refreshSavedAccounts();
      }

      throw error;
    } finally {
      setIsSwitching(false);
    }
  }, [user?.uid, isSwitching, refreshSavedAccounts]);

  // Add another account (opens OAuth flow) without switching away from current account
  const addAccount = useCallback(async () => {
    if (isSwitching) return;

    setIsSwitching(true);
    try {
      // Remember the current user before OAuth flow
      const currentUserId = user?.uid;

      // This will sign in to the new account and save it
      const newUser = await signInWithGoogle();

      // Refresh accounts list to include the new one
      await refreshSavedAccounts();

      // Switch back to the original account if we had one and the new account is different
      if (currentUserId && newUser.uid !== currentUserId) {
        await switchAccount(currentUserId);
      } else {
        // If same account or no previous account, just update user state
        setUser(newUser);
      }
    } finally {
      setIsSwitching(false);
    }
  }, [isSwitching, refreshSavedAccounts, user?.uid, switchAccount]);

  // Add another account with email/password without switching away from current account
  const addAccountWithEmail = useCallback(async (email: string, password: string) => {
    if (isSwitching) return;

    setIsSwitching(true);
    try {
      // Remember the current user before sign in
      const currentUserId = user?.uid;

      // This will sign in to the new account and save it
      const newUser = await signInWithEmail(email, password);

      // Refresh accounts list to include the new one
      await refreshSavedAccounts();

      // Switch back to the original account if we had one and the new account is different
      if (currentUserId && newUser.uid !== currentUserId) {
        await switchAccount(currentUserId);
      } else {
        // If same account or no previous account, just update user state
        setUser(newUser);
      }
    } finally {
      setIsSwitching(false);
    }
  }, [isSwitching, refreshSavedAccounts, user?.uid, switchAccount]);

  // Remove an account from saved accounts
  const removeAccountFromSaved = useCallback(async (accountId: string) => {
    await removeStoredAccount(accountId);
    await refreshSavedAccounts();
  }, [refreshSavedAccounts]);

  const value: AuthContextType = {
    user,
    loading,
    signOut,
    refreshUser,
    partnerInfo,
    isPartnerUser: partnerInfo?.isPartner || false,
    // Multi-account support
    savedAccounts,
    isSwitching,
    switchAccount,
    addAccount,
    addAccountWithEmail,
    removeAccountFromSaved,
    refreshSavedAccounts,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
