// Email Service - Handles sending invitation emails via Gmail SMTP
import { Invitation } from './workspaceService';
import { invoke } from '@tauri-apps/api/core';

/**
 * Send invitation email via Gmail SMTP (Tauri backend)
 */
export const sendInvitationEmail = async (
  invitation: Invitation
): Promise<void> => {
  try {
    // Log for debugging
    console.log('='.repeat(60));
    console.log('📧 SENDING INVITATION EMAIL');
    console.log('='.repeat(60));
    console.log(`To: ${invitation.email}`);
    console.log(`From: ${invitation.invitedByName}`);
    console.log(`Workspace: ${invitation.workspaceName}`);
    console.log(`Role: ${invitation.role}`);
    console.log('='.repeat(60));

    // Call Tauri backend to send email via Gmail SMTP
    const result = await invoke<string>('send_invitation_email', {
      invitation: {
        email: invitation.email,
        workspace_name: invitation.workspaceName,
        invited_by_name: invitation.invitedByName,
        role: invitation.role,
        token: invitation.token
      }
    });

    console.log('✓', result);
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('Error sending invitation email:', error);
    throw new Error(`Failed to send invitation email: ${error}`);
  }
};
