// Deep Link Service - Handles invitation deep links
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { getInvitationByToken, acceptInvitation } from './workspaceService';

export interface DeepLinkInvitation {
  token: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
}

let pendingInvitation: DeepLinkInvitation | null = null;

/**
 * Initialize deep link listener
 */
export const initializeDeepLinkListener = (
  onInviteLink: (invitation: DeepLinkInvitation) => void
) => {
  // Listen for deep link events
  onOpenUrl((urls) => {
    console.log('Deep link received:', urls);

    for (const url of urls) {
      handleDeepLink(url, onInviteLink);
    }
  });

  console.log('Deep link listener initialized');
};

/**
 * Parse and handle deep link URL
 */
const handleDeepLink = (
  url: string,
  onInviteLink: (invitation: DeepLinkInvitation) => void
) => {
  try {
    console.log('Handling deep link:', url);

    // Parse URL
    const urlObj = new URL(url);

    // Check if it's an invite link: conceptualize://invite?token=xxx
    if (urlObj.protocol === 'conceptualize:' && urlObj.pathname === '//invite') {
      const token = urlObj.searchParams.get('token');

      if (token) {
        console.log('Invite token found:', token);
        handleInviteToken(token, onInviteLink);
      } else {
        console.error('No token found in invite link');
      }
    }
  } catch (error) {
    console.error('Error parsing deep link:', error);
  }
};

/**
 * Handle invitation token
 */
const handleInviteToken = async (
  token: string,
  onInviteLink: (invitation: DeepLinkInvitation) => void
) => {
  try {
    // Get invitation from Firestore
    const invitation = await getInvitationByToken(token);

    if (!invitation) {
      console.error('Invitation not found or expired');
      alert('This invitation is invalid or has expired.');
      return;
    }

    // Store invitation data
    const inviteData: DeepLinkInvitation = {
      token,
      workspaceId: invitation.workspaceId,
      workspaceName: invitation.workspaceName,
      role: invitation.role
    };

    // Store in memory
    pendingInvitation = inviteData;

    // Also store in localStorage for persistence across app restarts
    localStorage.setItem('pendingInvitation', JSON.stringify(inviteData));

    // Trigger callback
    onInviteLink(inviteData);

    console.log('Invitation processed:', inviteData);
  } catch (error) {
    console.error('Error handling invite token:', error);
    alert('Failed to process invitation. Please try again.');
  }
};

/**
 * Get pending invitation (from memory or localStorage)
 */
export const getPendingInvitation = (): DeepLinkInvitation | null => {
  // First check memory
  if (pendingInvitation) {
    return pendingInvitation;
  }

  // Then check localStorage
  try {
    const stored = localStorage.getItem('pendingInvitation');
    if (stored) {
      pendingInvitation = JSON.parse(stored);
      return pendingInvitation;
    }
  } catch (error) {
    console.error('Error reading pending invitation:', error);
  }

  return null;
};

/**
 * Accept pending invitation (after user signs in)
 */
export const acceptPendingInvitation = async (
  uid: string,
  email: string,
  displayName: string
): Promise<void> => {
  const invitation = getPendingInvitation();

  if (!invitation) {
    throw new Error('No pending invitation found');
  }

  try {
    // Get full invitation details from Firestore
    const fullInvitation = await getInvitationByToken(invitation.token);

    if (!fullInvitation) {
      throw new Error('Invitation not found or expired');
    }

    // Accept the invitation
    await acceptInvitation(fullInvitation.id, uid, email, displayName);

    // Clear pending invitation
    clearPendingInvitation();

    console.log('Invitation accepted successfully');
  } catch (error: any) {
    console.error('Error accepting invitation:', error);
    throw error;
  }
};

/**
 * Clear pending invitation
 */
export const clearPendingInvitation = () => {
  pendingInvitation = null;
  localStorage.removeItem('pendingInvitation');
};

/**
 * Check if there's a pending invitation
 */
export const hasPendingInvitation = (): boolean => {
  return getPendingInvitation() !== null;
};
