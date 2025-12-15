import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChange, User, signOut as authSignOut } from '../services/authServiceTauri';
import { checkLocalPartnerDomain } from '../services/promoService';
import type { PartnerCheck } from '../services/promoTypes';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => void;
  partnerInfo: PartnerCheck | null;
  isPartnerUser: boolean;
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
      (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.data();
          // Update user state with new profile data
          setUser((prevUser) => {
            if (!prevUser) return null;
            return {
              ...prevUser,
              displayName: userData.displayName || prevUser.displayName,
              customAvatar: userData.customAvatar || '',
              photoURL: userData.photoURL || prevUser.photoURL || '',
            };
          });
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

  const signOut = async () => {
    await authSignOut();
    setUser(null);
  };

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

  const value: AuthContextType = {
    user,
    loading,
    signOut,
    refreshUser,
    partnerInfo,
    isPartnerUser: partnerInfo?.isPartner || false,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
