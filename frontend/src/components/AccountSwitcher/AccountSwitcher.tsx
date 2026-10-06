import React, { useRef, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Check, Plus, Loader2, Mail, ArrowLeft } from 'lucide-react';
import { getAllTeamsForUser, Team } from '../../services/teamService';
import './AccountSwitcher.css';

// Cache key for storing teams per account
const TEAMS_CACHE_KEY = 'accountTeamsCache';

interface CachedTeam {
  id: string;
  name: string;
}

interface TeamsCache {
  [email: string]: {
    teams: CachedTeam[];
    updatedAt: number;
  };
}

// Save teams to local cache
function cacheTeamsForAccount(email: string, teams: Team[]) {
  try {
    const cacheStr = localStorage.getItem(TEAMS_CACHE_KEY);
    const cache: TeamsCache = cacheStr ? JSON.parse(cacheStr) : {};
    cache[email.toLowerCase()] = {
      teams: teams.map(t => ({ id: t.id, name: t.name })),
      updatedAt: Date.now(),
    };
    localStorage.setItem(TEAMS_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('Failed to cache teams:', e);
  }
}

// Load cached teams for an account
function getCachedTeams(email: string): CachedTeam[] {
  try {
    const cacheStr = localStorage.getItem(TEAMS_CACHE_KEY);
    if (!cacheStr) return [];
    const cache: TeamsCache = JSON.parse(cacheStr);
    const cached = cache[email.toLowerCase()];
    if (!cached) return [];
    // Cache expires after 7 days
    const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - cached.updatedAt > CACHE_EXPIRY) return [];
    return cached.teams;
  } catch (e) {
    console.warn('Failed to load cached teams:', e);
    return [];
  }
}

// Google icon component
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

interface AccountWithTeams {
  accountId: string;
  email: string;
  displayName: string;
  photoURL?: string;
  customAvatar?: string;
  teams: Team[];
  isCurrentAccount: boolean;
}

interface AccountSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRect?: DOMRect | null;
  currentTeamId?: string;
  onTeamSelect?: (teamId: string, accountId: string) => void;
}

const AccountSwitcher: React.FC<AccountSwitcherProps> = ({ isOpen, onClose, anchorRect, currentTeamId, onTeamSelect }) => {
  const { user, savedAccounts, switchAccount, addAccount, addAccountWithEmail, isSwitching } = useAuth();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showAuthOptions, setShowAuthOptions] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [accountsWithTeams, setAccountsWithTeams] = useState<AccountWithTeams[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      // Delay adding listener to prevent immediate close
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showEmailForm) {
          setShowEmailForm(false);
          setShowAuthOptions(true);
        } else if (showAuthOptions) {
          setShowAuthOptions(false);
        } else {
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, showAuthOptions, showEmailForm]);

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setShowAuthOptions(false);
      setShowEmailForm(false);
      setEmail('');
      setPassword('');
      setEmailError('');
    }
  }, [isOpen]);

  // Fetch teams for all accounts when dropdown opens
  useEffect(() => {
    if (!isOpen) return;

    const fetchTeamsForAccounts = async () => {
      setLoadingTeams(true);
      try {
        // Get all unique emails from saved accounts and current user
        const allAccounts = [...savedAccounts];
        if (user && !allAccounts.find(a => a.id === user.uid)) {
          allAccounts.unshift({
            id: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            customAvatar: user.customAvatar,
            lastUsed: Date.now(),
            authMethod: 'google' as const,
          });
        }

        const accountsData: AccountWithTeams[] = await Promise.all(
          allAccounts.map(async (account) => {
            const isCurrentAccount = account.id === user?.uid;

            // Only fetch teams for the current account (Firestore rules prevent cross-account queries)
            if (isCurrentAccount) {
              try {
                const teams = await getAllTeamsForUser(account.email);
                console.log(`Found ${teams.length} teams for ${account.email}:`, teams.map(t => t.name));

                // Cache teams for this account
                cacheTeamsForAccount(account.email, teams);

                return {
                  accountId: account.id,
                  email: account.email,
                  displayName: account.displayName,
                  photoURL: account.photoURL,
                  customAvatar: account.customAvatar,
                  teams,
                  isCurrentAccount: true,
                };
              } catch (error) {
                console.error(`Failed to fetch teams for ${account.email}:`, error);
                return {
                  accountId: account.id,
                  email: account.email,
                  displayName: account.displayName,
                  photoURL: account.photoURL,
                  customAvatar: account.customAvatar,
                  teams: [],
                  isCurrentAccount: true,
                };
              }
            } else {
              // For other accounts, load from cache
              const cachedTeams = getCachedTeams(account.email);
              console.log(`Loaded ${cachedTeams.length} cached teams for ${account.email}`);

              return {
                accountId: account.id,
                email: account.email,
                displayName: account.displayName,
                photoURL: account.photoURL,
                customAvatar: account.customAvatar,
                teams: cachedTeams.map(ct => ({
                  id: ct.id,
                  name: ct.name,
                  // Minimal Team object for display
                  description: '',
                  createdBy: '',
                  createdAt: new Date(),
                  driveFolderId: '',
                  memberEmails: [],
                  members: {},
                } as Team)),
                isCurrentAccount: false,
              };
            }
          })
        );

        // Sort: current account first, then by email
        accountsData.sort((a, b) => {
          if (a.isCurrentAccount) return -1;
          if (b.isCurrentAccount) return 1;
          return a.email.localeCompare(b.email);
        });

        setAccountsWithTeams(accountsData);
      } catch (error) {
        console.error('Failed to fetch teams:', error);
      } finally {
        setLoadingTeams(false);
      }
    };

    fetchTeamsForAccounts();
  }, [isOpen, savedAccounts, user]);

  if (!isOpen) return null;

  const handleAddAccountClick = () => {
    setShowAuthOptions(true);
  };

  const handleGoogleSignIn = async () => {
    try {
      await addAccount();
      onClose();
    } catch (error) {
      console.error('Failed to add Google account:', error);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');

    if (!email || !password) {
      setEmailError('Please enter email and password');
      return;
    }

    try {
      await addAccountWithEmail(email, password);
      onClose();
    } catch (error: any) {
      console.error('Failed to add email account:', error);
      setEmailError(error.message || 'Failed to sign in');
    }
  };

  const handleBackToOptions = () => {
    setShowEmailForm(false);
    setShowAuthOptions(true);
    setEmail('');
    setPassword('');
    setEmailError('');
  };

  const handleBackToAccounts = () => {
    setShowAuthOptions(false);
    setShowEmailForm(false);
  };

  const handleTeamSelect = async (teamId: string, accountId: string) => {
    if (isSwitching) return;

    // If selecting a team from a different account, switch account first
    if (accountId !== user?.uid) {
      try {
        await switchAccount(accountId);
        // After switching, close the dropdown - the app will reload with that account's teams
        onClose();
        return;
      } catch (error: any) {
        if (error.message === 'REAUTH_REQUIRED') {
          await addAccount();
        }
        return;
      }
    }

    // Call the onTeamSelect callback (only if we have a specific team)
    if (onTeamSelect && teamId) {
      onTeamSelect(teamId, accountId);
    }
    onClose();
  };

  // Get avatar URL for an account
  const getAvatarUrl = (account: { photoURL?: string; customAvatar?: string; email: string; displayName: string }) => {
    if (account.customAvatar) return account.customAvatar;
    if (account.photoURL) return account.photoURL;
    // Generate a placeholder based on initials
    return null;
  };

  // Get initials for avatar fallback
  const getInitials = (displayName: string, email: string) => {
    if (displayName) {
      const parts = displayName.split(' ');
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return displayName[0].toUpperCase();
    }
    return email[0].toUpperCase();
  };

  // Position dropdown below anchor, constrained to sidebar width
  const dropdownStyle: React.CSSProperties = anchorRect
    ? {
        position: 'fixed',
        top: anchorRect.bottom + 4,
        left: anchorRect.left,
        maxWidth: Math.min(anchorRect.width + 32, 280), // Slightly wider than header, max 280px
      }
    : {};

  return (
    <div className="account-switcher-overlay">
      <div
        ref={dropdownRef}
        className="account-switcher-dropdown"
        style={dropdownStyle}
      >
        {/* Loading overlay */}
        {(isSwitching || loadingTeams) && (
          <div className="account-switcher-loading">
            <Loader2 className="spinner" size={24} />
            <span>{isSwitching ? 'Switching account...' : 'Loading teams...'}</span>
          </div>
        )}

        {/* Accounts with Teams */}
        {!showAuthOptions && !showEmailForm && accountsWithTeams.map((account, index) => (
          <div key={account.accountId} className="account-section">
            {/* Account Header */}
            <div className={`account-header ${account.isCurrentAccount ? 'current' : ''}`}>
              <div className="account-avatar">
                {getAvatarUrl(account) ? (
                  <img src={getAvatarUrl(account)!} alt={account.displayName} />
                ) : (
                  <div className="avatar-fallback">
                    {getInitials(account.displayName, account.email)}
                  </div>
                )}
              </div>
              <div className="account-info">
                <span className="account-email-title">{account.email}</span>
              </div>
            </div>

            {/* Teams under this account */}
            <div className="teams-list">
              {account.teams.length > 0 ? (
                account.teams.map(team => (
                  <button
                    key={team.id}
                    className={`team-item ${currentTeamId === team.id && account.isCurrentAccount ? 'active' : ''}`}
                    onClick={() => handleTeamSelect(team.id, account.accountId)}
                    disabled={isSwitching}
                  >
                    <span className="team-name">{team.name}</span>
                    {currentTeamId === team.id && account.isCurrentAccount && (
                      <Check className="active-check" size={16} />
                    )}
                  </button>
                ))
              ) : account.isCurrentAccount ? (
                <div className="no-teams">No teams</div>
              ) : (
                <button
                  className="switch-to-view"
                  onClick={() => handleTeamSelect('', account.accountId)}
                  disabled={isSwitching}
                >
                  Switch to view teams
                </button>
              )}
            </div>

            {/* Divider between accounts */}
            {index < accountsWithTeams.length - 1 && (
              <div className="account-switcher-divider" />
            )}
          </div>
        ))}

        {!showAuthOptions && !showEmailForm && accountsWithTeams.length > 0 && (
          <div className="account-switcher-divider" />
        )}

        {/* Add Another Account - shows auth options when clicked */}
        {!showAuthOptions && !showEmailForm && (
          <button
            className="account-item add-account"
            onClick={handleAddAccountClick}
            disabled={isSwitching}
          >
            <div className="account-avatar add-icon">
              <Plus size={20} />
            </div>
            <span className="add-account-text">Add another account</span>
          </button>
        )}

        {/* Auth Method Selection */}
        {showAuthOptions && !showEmailForm && (
          <div className="auth-options">
            <button
              className="auth-option-back"
              onClick={handleBackToAccounts}
              disabled={isSwitching}
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <div className="auth-options-title">Add account</div>
            <button
              className="auth-option-btn google"
              onClick={handleGoogleSignIn}
              disabled={isSwitching}
            >
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>
            <button
              className="auth-option-btn email"
              onClick={() => {
                setShowAuthOptions(false);
                setShowEmailForm(true);
              }}
              disabled={isSwitching}
            >
              <Mail size={18} />
              <span>Continue with Email</span>
            </button>
          </div>
        )}

        {/* Email Sign In Form */}
        {showEmailForm && (
          <div className="email-form-container">
            <button
              className="auth-option-back"
              onClick={handleBackToOptions}
              disabled={isSwitching}
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <div className="auth-options-title">Sign in with Email</div>
            <form onSubmit={handleEmailSignIn} className="email-form">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSwitching}
                autoFocus
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSwitching}
              />
              {emailError && <div className="email-error">{emailError}</div>}
              <button
                type="submit"
                className="email-submit-btn"
                disabled={isSwitching || !email || !password}
              >
                {isSwitching ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountSwitcher;
