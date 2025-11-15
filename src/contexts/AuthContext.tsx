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

  useEffect(() => {
    // Check if we're in team mode before setting up auth listener
    const initAuth = async () => {
      try {
        const { getAppMode } = await import('../services/appModeService');
        const mode = await getAppMode();

        if (mode === 'local') {
          // Skip authentication for local mode
          setLoading(false);
          return;
        }

        // Only set up auth listener for team mode
        const unsubscribe = onAuthStateChange((newUser) => {
          setUser(newUser);
          setLoading(false);
        });

        return () => unsubscribe();
      } catch (error) {
        console.error('Error initializing auth:', error);
        setLoading(false);
      }
    };

    const cleanup = initAuth();
    return () => {
      cleanup.then(unsub => unsub && unsub());
    };
  }, []);

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
