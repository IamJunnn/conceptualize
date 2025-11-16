import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChange, User, signOut as authSignOut } from '../services/authServiceTauri';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => void;
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
      return;
    }

    if (appMode === 'team') {
      console.log('🔐 AuthContext: Setting up auth listener for team mode');
      // Set up auth listener for team mode
      const unsubscribe = onAuthStateChange((newUser) => {
        console.log('🔐 AuthContext: Auth state changed:', newUser ? `User: ${newUser.email}` : 'No user');
        setUser(newUser);
        setLoading(false);
      });

      return () => {
        console.log('🔐 AuthContext: Cleaning up auth listener');
        unsubscribe();
      };
    }

    // Mode not set yet
    setLoading(false);
  }, [appMode]);

  const signOut = async () => {
    await authSignOut();
    setUser(null);
  };

  const refreshUser = () => {
    // Trigger a re-check of the current user
    setLoading(true);
  };

  const value: AuthContextType = {
    user,
    loading,
    signOut,
    refreshUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
