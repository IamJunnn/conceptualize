// Token Storage Service
// Provides persistent storage for Google OAuth tokens using localStorage
// with fallback handling for development mode hot-reloads

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'google_access_token',
  REFRESH_TOKEN: 'google_refresh_token',
  EXPIRES_AT: 'google_token_expires_at',
  LAST_STORED: 'google_tokens_last_stored',
};

/**
 * Store Google OAuth tokens in localStorage
 */
export function storeTokens(tokens: GoogleTokens): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
    localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, tokens.expiresAt.toString());
    localStorage.setItem(STORAGE_KEYS.LAST_STORED, Date.now().toString());

    console.log('✅ Google Drive tokens stored successfully');
    console.log('📅 Token expires at:', new Date(tokens.expiresAt).toLocaleString());
  } catch (error) {
    console.error('❌ Failed to store Google tokens:', error);
    throw new Error('Failed to store authentication tokens');
  }
}

/**
 * Retrieve stored Google OAuth tokens
 */
export function getTokens(): GoogleTokens | null {
  try {
    const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    const expiresAt = localStorage.getItem(STORAGE_KEYS.EXPIRES_AT);

    if (!accessToken || !refreshToken || !expiresAt) {
      console.log('⚠️ Missing token data in localStorage');
      return null;
    }

    return {
      accessToken,
      refreshToken,
      expiresAt: parseInt(expiresAt, 10),
    };
  } catch (error) {
    console.error('❌ Failed to retrieve Google tokens:', error);
    return null;
  }
}

/**
 * Check if the access token is expired
 */
export function isTokenExpired(): boolean {
  const tokens = getTokens();
  if (!tokens) return true;

  // Consider token expired if it expires in the next 5 minutes
  const bufferTime = 5 * 60 * 1000; // 5 minutes
  return Date.now() + bufferTime >= tokens.expiresAt;
}

/**
 * Get the access token, checking for expiration
 */
export function getAccessToken(): string | null {
  const tokens = getTokens();
  if (!tokens) return null;

  if (isTokenExpired()) {
    console.warn('⚠️ Access token has expired');
    return null;
  }

  return tokens.accessToken;
}

/**
 * Get the refresh token
 */
export function getRefreshToken(): string | null {
  const tokens = getTokens();
  return tokens?.refreshToken || null;
}

/**
 * Clear all stored tokens
 */
export function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.EXPIRES_AT);
  localStorage.removeItem(STORAGE_KEYS.LAST_STORED);
  console.log('🗑️ Google Drive tokens cleared');
}

/**
 * Check if tokens exist (for debugging)
 */
export function hasTokens(): boolean {
  const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  return !!(accessToken && refreshToken);
}

/**
 * Get debug info about stored tokens
 */
export function getTokenDebugInfo(): {
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  isExpired: boolean;
  expiresAt: Date | null;
  lastStored: Date | null;
} {
  const tokens = getTokens();
  const lastStored = localStorage.getItem(STORAGE_KEYS.LAST_STORED);

  return {
    hasAccessToken: !!localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN),
    hasRefreshToken: !!localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN),
    isExpired: isTokenExpired(),
    expiresAt: tokens ? new Date(tokens.expiresAt) : null,
    lastStored: lastStored ? new Date(parseInt(lastStored, 10)) : null,
  };
}

/**
 * Refresh the access token using the refresh token
 */
export async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  console.log('🔄 Refreshing access token...');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      client_secret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Token refresh failed:', error);
    throw new Error(`Failed to refresh access token: ${error}`);
  }

  const data = await response.json();

  // Store the new access token
  const newTokens: GoogleTokens = {
    accessToken: data.access_token,
    refreshToken: refreshToken, // Keep the same refresh token
    expiresAt: Date.now() + (data.expires_in * 1000),
  };

  storeTokens(newTokens);
  console.log('✅ Access token refreshed successfully');

  return data.access_token;
}
