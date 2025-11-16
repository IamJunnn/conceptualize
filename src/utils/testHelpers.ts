// Testing Helper Functions
// Use these in the browser console for easier testing

/**
 * Clear all app data and start fresh
 * Usage: clearAppData()
 */
export const clearAppData = () => {
  localStorage.clear();
  sessionStorage.clear();
  console.log('✓ All app data cleared. Refresh the page to start fresh.');
};

/**
 * Simulate receiving an invite link (for development testing)
 * Usage: simulateInvite('your-token-here')
 */
export const simulateInvite = (token: string, workspaceName = 'Test Workspace', role = 'member') => {
  const invitation = {
    token,
    workspaceId: 'test-workspace-id',
    workspaceName,
    role
  };

  localStorage.setItem('pendingInvitation', JSON.stringify(invitation));
  console.log('✓ Invitation simulated:', invitation);
  console.log('📌 Refresh the page to see the invite accept screen');

  return invitation;
};

/**
 * Get current user's workspace info
 * Usage: await getMyWorkspace()
 */
export const getMyWorkspace = async () => {
  const { getUserWorkspace } = await import('../services/workspaceService');
  const { auth } = await import('../services/firebase');

  const user = auth.currentUser;
  if (!user) {
    console.error('❌ No user signed in');
    return null;
  }

  const workspace = await getUserWorkspace(user.uid);
  console.log('Workspace:', workspace);
  return workspace;
};

/**
 * Get all members of current workspace
 * Usage: await getWorkspaceMembers()
 */
export const getWorkspaceMembers = async () => {
  const { getWorkspaceMembers, getUserWorkspace } = await import('../services/workspaceService');
  const { auth } = await import('../services/firebase');

  const user = auth.currentUser;
  if (!user) {
    console.error('❌ No user signed in');
    return null;
  }

  const workspace = await getUserWorkspace(user.uid);
  if (!workspace) {
    console.error('❌ No workspace found');
    return null;
  }

  const members = await getWorkspaceMembers(workspace.id);
  console.table(members);
  return members;
};

/**
 * Print current authentication status
 * Usage: checkAuthStatus()
 */
export const checkAuthStatus = async () => {
  const { auth } = await import('../services/firebase');
  const { getAppMode } = await import('../services/appModeService');

  const user = auth.currentUser;
  const mode = await getAppMode();

  console.log('='.repeat(50));
  console.log('🔐 Authentication Status');
  console.log('='.repeat(50));
  console.log('Signed in:', !!user);
  if (user) {
    console.log('Email:', user.email);
    console.log('Display Name:', user.displayName);
    console.log('UID:', user.uid);
  }
  console.log('App Mode:', mode);
  console.log('='.repeat(50));

  return { user, mode };
};

/**
 * Generate a test invite token (for quick testing)
 * Usage: generateTestToken()
 */
export const generateTestToken = () => {
  const token = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log('Generated test token:', token);
  console.log('Use this with: simulateInvite("' + token + '")');
  return token;
};

/**
 * View pending invitation
 * Usage: viewPendingInvite()
 */
export const viewPendingInvite = () => {
  const stored = localStorage.getItem('pendingInvitation');
  if (!stored) {
    console.log('No pending invitation');
    return null;
  }

  const invitation = JSON.parse(stored);
  console.log('📧 Pending Invitation:');
  console.log('  Workspace:', invitation.workspaceName);
  console.log('  Role:', invitation.role);
  console.log('  Token:', invitation.token);
  return invitation;
};

/**
 * Clear pending invitation
 * Usage: clearPendingInvite()
 */
export const clearPendingInvite = () => {
  localStorage.removeItem('pendingInvitation');
  console.log('✓ Pending invitation cleared');
};

/**
 * Quick test mode switcher
 * Usage: switchMode('local') or switchMode('team')
 */
export const switchMode = async (mode: 'local' | 'team') => {
  const { setAppMode } = await import('../services/appModeService');
  await setAppMode(mode);
  console.log(`✓ Switched to ${mode} mode. Refreshing...`);
  window.location.reload();
};

/**
 * Check Google Drive token status
 * Usage: checkDriveTokens()
 */
export const checkDriveTokens = async () => {
  const { getTokenDebugInfo } = await import('../services/tokenStorage');
  const info = getTokenDebugInfo();

  console.log('='.repeat(50));
  console.log('🔑 Google Drive Token Status');
  console.log('='.repeat(50));
  console.log('Has Access Token:', info.hasAccessToken ? '✅' : '❌');
  console.log('Has Refresh Token:', info.hasRefreshToken ? '✅' : '❌');
  console.log('Token Expired:', info.isExpired ? '⚠️ YES' : '✅ NO');
  if (info.expiresAt) {
    console.log('Expires At:', info.expiresAt.toLocaleString());
  }
  if (info.lastStored) {
    console.log('Last Stored:', info.lastStored.toLocaleString());
  }
  console.log('='.repeat(50));

  return info;
};

/**
 * Manually refresh Google Drive access token
 * Usage: await refreshDriveToken()
 */
export const refreshDriveToken = async () => {
  try {
    const { refreshAccessToken } = await import('../services/tokenStorage');
    const newToken = await refreshAccessToken();
    console.log('✅ Token refreshed successfully!');
    console.log('New token:', newToken.substring(0, 20) + '...');
    return newToken;
  } catch (error: any) {
    console.error('❌ Token refresh failed:', error.message);
    throw error;
  }
};

// Make functions available globally in development
if (import.meta.env.DEV) {
  (window as any).testHelpers = {
    clearAppData,
    simulateInvite,
    getMyWorkspace,
    getWorkspaceMembers,
    checkAuthStatus,
    generateTestToken,
    viewPendingInvite,
    clearPendingInvite,
    switchMode,
    checkDriveTokens,
    refreshDriveToken
  };

  console.log('%c🧪 Test Helpers Loaded!', 'color: #c44fc4; font-size: 16px; font-weight: bold;');
  console.log('%cUsage: testHelpers.clearAppData(), testHelpers.simulateInvite("token"), etc.', 'color: #64c8ca;');
  console.log('%cAvailable functions:', 'color: #64c8ca;');
  console.log('  - clearAppData()');
  console.log('  - simulateInvite(token, workspaceName?, role?)');
  console.log('  - getMyWorkspace()');
  console.log('  - getWorkspaceMembers()');
  console.log('  - checkAuthStatus()');
  console.log('  - generateTestToken()');
  console.log('  - viewPendingInvite()');
  console.log('  - clearPendingInvite()');
  console.log('  - switchMode("local" | "team")');
  console.log('  - checkDriveTokens()');
  console.log('  - refreshDriveToken()');
}
