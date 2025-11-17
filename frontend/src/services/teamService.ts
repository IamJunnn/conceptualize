/**
 * Team Service
 * Manages team creation, invitations, and member management
 * Uses Firebase Firestore for team metadata and Google Drive for file storage
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  Timestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { invoke } from '@tauri-apps/api/core';
import { db, auth, functions } from './firebase';
import { createTeamFolder, shareFolder } from './googleDriveService';
import { httpsCallable } from 'firebase/functions';

export interface TeamMember {
  email: string;
  role: 'owner' | 'admin' | 'leader' | 'member';
  joinedAt: Date;
  displayName?: string;
}


export interface Team {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  createdBy: string; // owner's email
  driveFolderId: string; // Google Drive folder ID where team files are stored
  members: { [email: string]: TeamMember };
  memberEmails: string[]; // For querying
}

export interface TeamInvitation {
  id: string;
  teamId: string;
  teamName: string;
  memberEmail: string;
  invitedBy: string;
  invitedAt: Date;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
}

/**
 * Create a new team
 */
export async function createTeam(
  teamName: string,
  description: string,
  ownerEmail: string,
  ownerDisplayName: string,
  ownerUid: string
): Promise<Team> {
  try {
    console.log(`Creating team "${teamName}"...`);

    // 1. Generate team ID
    const teamId = doc(collection(db, 'teams')).id;

    // 2. Create Google Drive folder for the team
    console.log(`📁 Creating Google Drive folder: "Conceptualize - ${teamName}"...`);
    const driveFolder = await createTeamFolder(teamName);
    console.log(`✅ Drive folder created (ID: ${driveFolder.id})`);

    // 3. Create team document in Firestore
    const team: Team = {
      id: teamId,
      name: teamName,
      description,
      createdAt: new Date(),
      createdBy: ownerEmail,
      driveFolderId: driveFolder.id, // Store Drive folder ID
      members: {
        [ownerEmail]: {
          email: ownerEmail,
          role: 'owner',
          joinedAt: new Date(),
          displayName: ownerDisplayName,
        },
      },
      memberEmails: [ownerEmail],
    };

    await setDoc(doc(db, 'teams', teamId), {
      ...team,
      createdAt: Timestamp.fromDate(team.createdAt),
      members: {
        [ownerEmail]: {
          ...team.members[ownerEmail],
          joinedAt: Timestamp.fromDate(team.members[ownerEmail].joinedAt),
        },
      },
    });

    // 4. Upgrade user's app role to 'admin' since they created a team
    console.log(`⬆️ Upgrading ${ownerEmail} to admin role...`);
    await updateDoc(doc(db, 'users', ownerUid), {
      role: 'admin'
    });
    console.log(`✅ User upgraded to admin role`);

    console.log(`✅ Team "${teamName}" created successfully (ID: ${teamId})`);
    return team;
  } catch (error: any) {
    console.error('Failed to create team:', error);
    throw new Error(`Failed to create team: ${error.message}`);
  }
}

/**
 * Invite a member to a team
 */
export async function inviteTeamMember(
  teamId: string,
  memberEmail: string,
  inviterEmail: string,
  inviterDisplayName: string
): Promise<void> {
  try {
    console.log(`Inviting ${memberEmail} to team ${teamId}...`);

    // 1. Get team data
    const teamDoc = await getDoc(doc(db, 'teams', teamId));
    if (!teamDoc.exists()) {
      throw new Error('Team not found');
    }

    const team = {
      id: teamDoc.id,
      ...teamDoc.data(),
      createdAt: teamDoc.data().createdAt?.toDate(),
    } as Team;

    // Check if already a member
    if (team.memberEmails.includes(memberEmail)) {
      throw new Error('User is already a member of this team');
    }

    // 2. Share the Google Drive folder with the new member
    console.log(`📤 Sharing Drive folder with ${memberEmail}...`);
    await shareFolder(team.driveFolderId, memberEmail, 'writer');
    console.log(`✅ Drive folder shared with ${memberEmail}`);

    // 3. Create pending invite in Firestore
    const inviteId = `${teamId}_${memberEmail.replace(/[.@]/g, '_')}`;
    await setDoc(doc(db, 'team_invites', inviteId), {
      teamId,
      teamName: team.name,
      memberEmail,
      invitedBy: inviterDisplayName || inviterEmail,
      invitedAt: Timestamp.now(),
      status: 'pending',
    });

    console.log(`✅ Invited ${memberEmail} to team "${team.name}"`);
  } catch (error: any) {
    console.error('Failed to invite team member:', error);
    throw new Error(`Failed to invite member: ${error.message}`);
  }
}

/**
 * Accept a team invite
 */
export async function acceptTeamInvite(
  teamId: string,
  memberEmail: string,
  memberDisplayName: string
): Promise<void> {
  try {
    console.log(`Accepting team invite for ${memberEmail}...`);

    // 1. Update team members
    await updateDoc(doc(db, 'teams', teamId), {
      [`members.${memberEmail}`]: {
        email: memberEmail,
        role: 'member',
        joinedAt: Timestamp.now(),
        displayName: memberDisplayName,
      },
      memberEmails: arrayUnion(memberEmail),
    });

    // 2. Update invite status
    const inviteId = `${teamId}_${memberEmail.replace(/[.@]/g, '_')}`;
    await updateDoc(doc(db, 'team_invites', inviteId), {
      status: 'accepted',
      acceptedAt: Timestamp.now(),
    });

    console.log(`✅ ${memberEmail} accepted invite to team ${teamId}`);
  } catch (error: any) {
    console.error('Failed to accept team invite:', error);
    throw new Error(`Failed to accept invite: ${error.message}`);
  }
}

/**
 * Decline a team invite
 */
export async function declineTeamInvite(
  teamId: string,
  memberEmail: string
): Promise<void> {
  try {
    const inviteId = `${teamId}_${memberEmail.replace(/[.@]/g, '_')}`;
    await updateDoc(doc(db, 'team_invites', inviteId), {
      status: 'declined',
      declinedAt: Timestamp.now(),
    });

    console.log(`✅ ${memberEmail} declined invite to team ${teamId}`);
  } catch (error: any) {
    console.error('Failed to decline team invite:', error);
    throw new Error(`Failed to decline invite: ${error.message}`);
  }
}

/**
 * Get all teams for a user
 */
export async function getUserTeams(userEmail: string): Promise<Team[]> {
  try {
    const q = query(
      collection(db, 'teams'),
      where('memberEmails', 'array-contains', userEmail)
    );

    const snapshot = await getDocs(q);
    const teams = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate(),
      } as Team;
    });

    console.log(`✅ Found ${teams.length} teams for ${userEmail}`);
    return teams;
  } catch (error: any) {
    console.error('Failed to get user teams:', error);
    throw new Error(`Failed to get teams: ${error.message}`);
  }
}

/**
 * Get pending invites for a user
 */
export async function getPendingInvites(userEmail: string): Promise<TeamInvitation[]> {
  try {
    const q = query(
      collection(db, 'team_invites'),
      where('memberEmail', '==', userEmail),
      where('status', '==', 'pending')
    );

    const snapshot = await getDocs(q);
    const invites = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        invitedAt: data.invitedAt?.toDate(),
      } as TeamInvitation;
    });

    console.log(`✅ Found ${invites.length} pending invites for ${userEmail}`);
    return invites;
  } catch (error: any) {
    console.error('Failed to get pending invites:', error);
    throw new Error(`Failed to get invites: ${error.message}`);
  }
}

/**
 * Get pending invitations for a team (for admins to see who they invited)
 */
export async function getTeamPendingInvites(teamId: string): Promise<TeamInvitation[]> {
  try {
    const q = query(
      collection(db, 'team_invites'),
      where('teamId', '==', teamId),
      where('status', '==', 'pending')
    );

    const snapshot = await getDocs(q);
    const invites = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        invitedAt: data.invitedAt?.toDate(),
      } as TeamInvitation;
    });

    console.log(`✅ Found ${invites.length} pending invites for team ${teamId}`);
    return invites;
  } catch (error: any) {
    console.error('Failed to get team pending invites:', error);
    throw new Error(`Failed to get team invites: ${error.message}`);
  }
}

/**
 * Get team by ID
 */
export async function getTeamById(teamId: string): Promise<Team | null> {
  try {
    const teamDoc = await getDoc(doc(db, 'teams', teamId));
    if (!teamDoc.exists()) {
      return null;
    }

    const data = teamDoc.data();
    return {
      ...data,
      id: teamDoc.id,
      createdAt: data.createdAt?.toDate(),
    } as Team;
  } catch (error: any) {
    console.error('Failed to get team:', error);
    throw new Error(`Failed to get team: ${error.message}`);
  }
}

/**
 * Remove a member from a team
 */
export async function removeTeamMember(
  teamId: string,
  memberEmail: string
): Promise<void> {
  try {
    console.log(`Removing ${memberEmail} from team ${teamId}...`);

    // Get team to check ownership
    const team = await getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    // Prevent removing the owner
    if (team.members[memberEmail]?.role === 'owner') {
      throw new Error('Cannot remove team owner');
    }

    // Update team document
    await updateDoc(doc(db, 'teams', teamId), {
      [`members.${memberEmail}`]: deleteDoc as any, // Remove member
      memberEmails: arrayRemove(memberEmail),
    });

    // Note: Access to Cloud Storage is automatically revoked when user is removed from team

    console.log(`✅ Removed ${memberEmail} from team ${teamId}`);
  } catch (error: any) {
    console.error('Failed to remove team member:', error);
    throw new Error(`Failed to remove member: ${error.message}`);
  }
}

/**
 * Delete a team (owner only)
 */
export async function deleteTeam(teamId: string): Promise<void> {
  try {
    console.log(`Deleting team ${teamId}...`);

    // Delete team document
    await deleteDoc(doc(db, 'teams', teamId));

    // Note: Cloud Storage files remain but access is revoked for all members
    // Files can be deleted through a separate cleanup process if needed

    console.log(`✅ Deleted team ${teamId}`);
  } catch (error: any) {
    console.error('Failed to delete team:', error);
    throw new Error(`Failed to delete team: ${error.message}`);
  }
}


/**
 * Send invitation email to a team member
 */
export async function sendInviteEmail(
  toEmail: string,
  teamName: string,
  role: 'admin' | 'leader' | 'member'
): Promise<void> {
  try {
    // Call Tauri backend to send email via Gmail SMTP
    const result = await invoke<string>('send_team_invitation_email', {
      invitation: {
        email: toEmail,
        team_name: teamName,
        role: role
      }
    });
    console.log(`✅ ${result}`);
  } catch (error: any) {
    console.error('Failed to send team invite email:', error);
    throw new Error(`Failed to send invite email: ${error}`);
  }
}

/**
 * Send invitation emails to all invited members
 */
export async function sendInvitationEmails(
  teamName: string,
  invites: Array<{ email: string; role: 'admin' | 'leader' | 'member' }>
): Promise<void> {
  try {
    // Send emails to all invited members
    const emailPromises = invites.map(invite =>
      sendInviteEmail(invite.email, teamName, invite.role)
        .catch(error => {
          console.error(`Failed to send email to ${invite.email}:`, error);
          // Don't fail the entire operation if one email fails
        })
    );

    await Promise.all(emailPromises);

    console.log(`✅ Sent invitation emails to ${invites.length} members`);
  } catch (error: any) {
    console.error('Failed to send invitation emails:', error);
    throw new Error(`Failed to send invitation emails: ${error.message}`);
  }
}

/**
 * Cancel a pending invitation
 */
export async function cancelInvitation(inviteId: string): Promise<void> {
  try {
    console.log(`Canceling invitation ${inviteId}...`);

    // Update the invitation status to 'cancelled'
    await updateDoc(doc(db, 'team_invites', inviteId), {
      status: 'cancelled',
    });

    console.log(`✅ Cancelled invitation ${inviteId}`);
  } catch (error: any) {
    console.error('Failed to cancel invitation:', error);
    throw new Error(`Failed to cancel invitation: ${error.message}`);
  }
}

/**
 * Resend invitation email
 */
export async function resendInvitation(
  teamName: string,
  email: string,
  role: 'admin' | 'leader' | 'member'
): Promise<void> {
  try {
    console.log(`Resending invitation to ${email}...`);

    // Resend the email
    await sendInviteEmail(email, teamName, role);

    console.log(`✅ Resent invitation to ${email}`);
  } catch (error: any) {
    console.error('Failed to resend invitation:', error);
    throw new Error(`Failed to resend invitation: ${error.message}`);
  }
}


/**
 * Update team member role
 */
export async function updateMemberRole(
  teamId: string,
  memberEmail: string,
  newRole: 'admin' | 'leader' | 'member'
): Promise<void> {
  try {
    await updateDoc(doc(db, 'teams', teamId), {
      [`members.${memberEmail}.role`]: newRole,
    });

    console.log(`✅ Updated ${memberEmail} role to ${newRole} in team ${teamId}`);
  } catch (error: any) {
    console.error('Failed to update member role:', error);
    throw new Error(`Failed to update role: ${error.message}`);
  }
}
