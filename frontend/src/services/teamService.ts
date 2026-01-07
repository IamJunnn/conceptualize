/**
 * Team Service
 * Manages team creation, invitations, and member management
 * Uses Firebase Firestore for team metadata and Firebase Cloud Storage for file storage
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  query,
  where,
  getDocs,
  Timestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { invoke } from '@tauri-apps/api/core';
import { db } from './firebase';
// Google Drive imports kept for legacy teams that still use Drive storage
import { shareFolderRecursively } from './googleDriveService';
import { updateSubscriptionQuantity } from './billingService';
import { createNotification } from './teamChatService';
import { getErrorMessage } from '../utils/errorUtils';

export type MemberBillingStatus = 'active' | 'grace_period' | 'blocked';

export interface TeamMember {
  email: string;
  role: 'owner' | 'admin' | 'leader' | 'member';
  joinedAt: Date;
  displayName?: string;
  photoURL?: string;
  customAvatar?: string; // DiceBear avatar URL chosen by user
  // Billing status for paid teams
  billingStatus?: MemberBillingStatus;
  gracePeriodEnd?: Date; // When grace period expires (if in grace_period status)
  lastChargeAttempt?: Date; // Last time we tried to charge for this member
  chargeFailureReason?: string; // Why the charge failed
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
  inviteCodes?: { [code: string]: { email: string; role: 'admin' | 'leader' | 'member'; used: boolean; createdAt: Date } };
  billing?: {
    subscription?: {
      status?: string;
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
    };
    storageUsedBytes?: number;
    memberCount?: number;
  };
}

export interface TeamInvitation {
  id: string;
  teamId: string;
  teamName: string;
  memberEmail: string;
  invitedBy: string;
  invitedAt: Date;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  role?: 'admin' | 'leader' | 'member';
  inviteCode?: string;
}

/**
 * Encode email for use as Firestore field key
 * Firestore doesn't allow dots in field names when using dot notation
 */
function encodeEmailKey(email: string): string {
  return email.replace(/\./g, '_DOT_').replace(/@/g, '_AT_');
}

/**
 * Decode Firestore field key back to email
 * Handles:
 * - Legacy keys that weren't encoded (contain @ or .)
 * - Old lowercase encoding (_dot_ and _at_)
 * - New uppercase encoding (_DOT_ and _AT_)
 */
export function decodeEmailKey(key: string): string {
  // If the key already looks like an email (contains @), return as-is (legacy data)
  if (key.includes('@')) {
    return key;
  }
  // Decode both uppercase and lowercase formats for backwards compatibility
  return key
    .replace(/_DOT_/g, '.')
    .replace(/_AT_/g, '@')
    .replace(/_dot_/g, '.')
    .replace(/_at_/g, '@');
}

// Internal domains that get automatic pro access
const INTERNAL_PRO_DOMAINS = ['ecoblox.build'];

/**
 * Check if an email belongs to an internal domain that gets auto pro access
 */
export function isInternalProEmail(email: string): boolean {
  const domain = email.toLowerCase().split('@')[1];
  return INTERNAL_PRO_DOMAINS.includes(domain);
}

/**
 * Create a new team
 * Now uses Firebase Cloud Storage instead of Google Drive for file storage
 */
export async function createTeam(
  teamName: string,
  description: string,
  ownerEmail: string,
  ownerDisplayName: string,
  ownerUid: string,
  ownerPhotoURL?: string
): Promise<Team> {
  try {
    console.log(`Creating team "${teamName}"...`);

    // 1. Generate team ID - this will also be used as the storage folder ID
    const teamId = doc(collection(db, 'teams')).id;

    // 2. No longer need to create Google Drive folder
    // Files will be stored in Firebase Cloud Storage under /teams/{teamId}/
    console.log(`📁 Team files will be stored in Firebase Storage: /teams/${teamId}/`);

    // 3. Create team document in Firestore
    // Use encoded email key for Firestore compatibility
    const ownerEmailKey = encodeEmailKey(ownerEmail);

    // Normalize email to lowercase for consistent lookups
    const normalizedOwnerEmail = ownerEmail.toLowerCase();

    const team: Team = {
      id: teamId,
      name: teamName,
      description,
      createdAt: new Date(),
      createdBy: normalizedOwnerEmail,
      driveFolderId: teamId, // Use teamId as the storage identifier (for backward compatibility)
      members: {
        [normalizedOwnerEmail]: {
          email: normalizedOwnerEmail,
          role: 'owner',
          joinedAt: new Date(),
          displayName: ownerDisplayName,
          photoURL: ownerPhotoURL,
        },
      },
      memberEmails: [normalizedOwnerEmail], // Always store lowercase for Firebase Storage rules
    };

    // Check if owner gets automatic pro access
    const isInternalUser = isInternalProEmail(normalizedOwnerEmail);

    const teamDoc: Record<string, unknown> = {
      ...team,
      createdAt: Timestamp.fromDate(team.createdAt),
      members: {
        [ownerEmailKey]: {
          ...team.members[normalizedOwnerEmail],
          joinedAt: Timestamp.fromDate(team.members[normalizedOwnerEmail].joinedAt),
        },
      },
    };

    // Auto-grant pro access for internal domains
    if (isInternalUser) {
      console.log(`🎁 Auto-granting pro access for internal user: ${normalizedOwnerEmail}`);
      teamDoc.billing = {
        subscription: {
          status: 'active',
          type: 'internal',
          grantedAt: Timestamp.now(),
        },
      };
    }

    await setDoc(doc(db, 'teams', teamId), teamDoc);

    // 4. Upgrade user's app role to 'admin' since they created a team
    console.log(`⬆️ Upgrading ${ownerEmail} to admin role...`);
    await updateDoc(doc(db, 'users', ownerUid), {
      role: 'admin'
    });
    console.log(`✅ User upgraded to admin role`);

    console.log(`✅ Team "${teamName}" created successfully (ID: ${teamId})`);
    return team;
  } catch (error) {
    console.error('Failed to create team:', error);
    throw new Error(`Failed to create team: ${getErrorMessage(error)}`);
  }
}

/**
 * Invite a member to a team
 * No longer needs to share Google Drive - Firebase Storage handles permissions via Security Rules
 */
export async function inviteTeamMember(
  teamId: string,
  memberEmail: string,
  inviterEmail: string,
  inviterDisplayName: string,
  role: 'admin' | 'leader' | 'member' = 'member'
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

    // 2. Generate invite code
    const inviteCode = `${teamId.substring(0, 8)}-${Date.now().toString(36)}`;

    // 3. No longer need to share Google Drive folder
    // Firebase Storage Security Rules handle access based on team membership
    console.log(`📁 Access to team files handled by Firebase Storage Security Rules`);

    // 4. Store invite code in team document
    await updateDoc(doc(db, 'teams', teamId), {
      [`inviteCodes.${inviteCode}`]: {
        email: memberEmail,
        role: role,
        used: false,
        createdAt: Timestamp.now(),
      }
    });

    // 5. Create pending invite in Firestore
    // IMPORTANT: Always use lowercase email for invite ID to ensure consistent matching
    const normalizedEmail = memberEmail.toLowerCase();
    const inviteId = `${teamId}_${normalizedEmail.replace(/[.@]/g, '_')}`;
    await setDoc(doc(db, 'team_invites', inviteId), {
      teamId,
      teamName: team.name,
      memberEmail: normalizedEmail, // Store lowercase for consistent matching
      invitedBy: inviterDisplayName || inviterEmail, // Display name for showing in UI
      inviterEmail: inviterEmail, // Email for sending notifications
      invitedAt: Timestamp.now(),
      status: 'pending',
      role: role,
      inviteCode: inviteCode,
    });

    console.log(`✅ Invited ${memberEmail} to team "${team.name}" with code ${inviteCode}`);
  } catch (error) {
    console.error('Failed to invite team member:', error);
    throw new Error(`Failed to invite member: ${getErrorMessage(error)}`);
  }
}

/**
 * Accept a team invite directly via Firestore
 * Uses Firestore rules that allow users with pending invites to update teams
 * Handles billing: charges immediately, or sets 7-day grace period if charge fails
 */
export async function acceptTeamInvite(
  teamId: string,
  memberEmail: string,
  memberDisplayName: string,
  memberPhotoURL?: string
): Promise<void> {
  try {
    const normalizedEmail = memberEmail.toLowerCase();
    console.log(`Accepting team invite for ${normalizedEmail} via Firestore...`);

    // 1. Find the invite - try lowercase ID first
    let inviteId = `${teamId}_${normalizedEmail.replace(/[.@]/g, '_')}`;
    let inviteDocRef = doc(db, 'team_invites', inviteId);
    let inviteSnapshot = await getDoc(inviteDocRef);

    // If not found with lowercase, search for it
    if (!inviteSnapshot.exists()) {
      console.log(`Invite not found with ID ${inviteId}, searching...`);
      const invitesQuery = query(
        collection(db, 'team_invites'),
        where('teamId', '==', teamId),
        where('status', '==', 'pending')
      );
      const invitesSnapshot = await getDocs(invitesQuery);

      const matchingInvite = invitesSnapshot.docs.find(doc =>
        doc.data().memberEmail?.toLowerCase() === normalizedEmail
      );

      if (matchingInvite) {
        inviteId = matchingInvite.id;
        inviteDocRef = doc(db, 'team_invites', inviteId);
        inviteSnapshot = matchingInvite;
        console.log(`Found invite with ID: ${inviteId}`);
      }
    }

    if (!inviteSnapshot.exists()) {
      throw new Error('No pending invite found for this team');
    }

    const inviteData = inviteSnapshot.data();
    if (inviteData?.status !== 'pending') {
      throw new Error('Invite is not pending');
    }

    const role = inviteData?.role || 'member';
    const teamName = inviteData?.teamName || 'Unknown Team';
    // Use inviterEmail (new field) or fall back to trying to parse invitedBy as email
    let teamOwnerEmail = inviteData?.inviterEmail || null;

    // If inviterEmail wasn't stored (legacy invites), try to get owner from team document
    if (!teamOwnerEmail) {
      try {
        const teamDoc = await getDoc(doc(db, 'teams', teamId));
        if (teamDoc.exists()) {
          teamOwnerEmail = teamDoc.data()?.createdBy || null;
        }
      } catch (err) {
        console.warn('Could not fetch team to get owner email:', err);
      }
    }

    // Log the invite ID we found for debugging
    console.log(`Found invite with ID: ${inviteId}, role: ${role}, teamName: ${teamName}, ownerEmail: ${teamOwnerEmail}`);

    // 2. Update team with new member (skip reading team doc first - rules allow update with pending invite)
    const teamDocRef = doc(db, 'teams', teamId);
    // Use the email key format expected by Firestore rules
    // IMPORTANT: Use regex with /g flag to replace ALL occurrences
    const memberEmailKey = encodeEmailKey(normalizedEmail);
    const now = Timestamp.now();

    // Add member with initial billing status (will update after charge attempt)
    await updateDoc(teamDocRef, {
      [`members.${memberEmailKey}`]: {
        email: normalizedEmail,
        role: role,
        joinedAt: now,
        displayName: memberDisplayName || normalizedEmail,
        photoURL: memberPhotoURL || null,
        billingStatus: 'active', // Will update if charge fails
      },
      memberEmails: arrayUnion(normalizedEmail),
    });

    // 3. Update invite status
    await updateDoc(inviteDocRef, {
      status: 'accepted',
      acceptedAt: now,
    });

    console.log(`✅ ${normalizedEmail} accepted invite to team ${teamName} as ${role}`);

    // 4. Try to charge via Stripe (update subscription quantity)
    let billingSuccess = false;
    let billingError: string | null = null;

    try {
      await updateSubscriptionQuantity(teamId);
      billingSuccess = true;
      console.log('💳 Subscription quantity updated for new member');
    } catch (error) {
      billingSuccess = false;
      billingError = getErrorMessage(error) || 'Payment failed';
      console.warn('⚠️ Could not update subscription quantity:', error);

      // Set grace period (7 days from now)
      const gracePeriodEnd = new Date();
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);

      // Update member with grace period status
      try {
        await updateDoc(teamDocRef, {
          [`members.${memberEmailKey}.billingStatus`]: 'grace_period',
          [`members.${memberEmailKey}.gracePeriodEnd`]: Timestamp.fromDate(gracePeriodEnd),
          [`members.${memberEmailKey}.lastChargeAttempt`]: now,
          [`members.${memberEmailKey}.chargeFailureReason`]: billingError,
        });
        console.log(`⏳ Set 7-day grace period for ${normalizedEmail} until ${gracePeriodEnd.toLocaleDateString()}`);
      } catch (updateError) {
        console.warn('Could not set grace period:', updateError);
      }
    }

    // 5. Send notification to team owner
    if (teamOwnerEmail) {
      try {
        console.log(`📬 Sending notification to team owner: ${teamOwnerEmail}`);
        if (billingSuccess) {
          // Success notification
          await createNotification(teamId, {
            type: 'member_joined',
            title: 'New Team Member',
            message: `${memberDisplayName || normalizedEmail} has joined your team as ${role}. Your subscription has been updated.`,
            recipientEmail: teamOwnerEmail,
            senderEmail: normalizedEmail,
            senderName: memberDisplayName || normalizedEmail,
          });
          console.log(`✅ Notification sent: member_joined`);
        } else {
          // Grace period notification
          await createNotification(teamId, {
            type: 'billing_warning',
            title: 'New Member - Payment Issue',
            message: `${memberDisplayName || normalizedEmail} has joined your team, but we couldn't process the payment. They have a 7-day grace period. Please update your payment method.`,
            recipientEmail: teamOwnerEmail,
            senderEmail: normalizedEmail,
            senderName: memberDisplayName || normalizedEmail,
          });
          console.log(`✅ Notification sent: billing_warning`);
        }
      } catch (notifError) {
        // Don't fail if notification creation fails
        console.error('❌ Could not create notification:', notifError);
      }
    } else {
      console.warn('⚠️ No team owner email found - notification not sent');
    }
  } catch (error) {
    console.error('Failed to accept team invite:', error);
    throw new Error(`Failed to accept invite: ${getErrorMessage(error)}`);
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
    // Always use lowercase for consistent matching
    const normalizedEmail = memberEmail.toLowerCase();
    const inviteId = `${teamId}_${normalizedEmail.replace(/[.@]/g, '_')}`;
    await updateDoc(doc(db, 'team_invites', inviteId), {
      status: 'declined',
      declinedAt: Timestamp.now(),
    });

    console.log(`✅ ${memberEmail} declined invite to team ${teamId}`);
  } catch (error) {
    console.error('Failed to decline team invite:', error);
    throw new Error(`Failed to decline invite: ${getErrorMessage(error)}`);
  }
}

/**
 * Check member billing status and return access level
 * Returns: 'full' (active), 'grace' (grace period), 'blocked' (no access except settings)
 */
export function getMemberAccessLevel(member: TeamMember | undefined): 'full' | 'grace' | 'blocked' {
  if (!member) return 'blocked';

  // Owner always has full access
  if (member.role === 'owner') return 'full';

  // No billing status means active (legacy members or free teams)
  if (!member.billingStatus || member.billingStatus === 'active') return 'full';

  // Check grace period
  if (member.billingStatus === 'grace_period') {
    if (member.gracePeriodEnd) {
      const gracePeriodEnd = member.gracePeriodEnd instanceof Date
        ? member.gracePeriodEnd
        : (member.gracePeriodEnd as any).toDate?.() || new Date(member.gracePeriodEnd);

      // If grace period hasn't expired, allow access
      if (gracePeriodEnd > new Date()) {
        return 'grace';
      }
      // Grace period expired - should be blocked
      return 'blocked';
    }
    // Has grace_period status but no end date - treat as grace
    return 'grace';
  }

  // Explicitly blocked
  if (member.billingStatus === 'blocked') return 'blocked';

  // Default to full access
  return 'full';
}

/**
 * Get days remaining in grace period
 */
export function getGracePeriodDaysRemaining(member: TeamMember | undefined): number {
  if (!member || !member.gracePeriodEnd) return 0;

  const gracePeriodEnd = member.gracePeriodEnd instanceof Date
    ? member.gracePeriodEnd
    : (member.gracePeriodEnd as any).toDate?.() || new Date(member.gracePeriodEnd);

  const now = new Date();
  const diffTime = gracePeriodEnd.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
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
    console.log(`🔍 Query returned ${snapshot.docs.length} teams for ${userEmail}`);

    const teams = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      console.log(`\n📁 Processing team "${data.name}" (ID: ${docSnap.id})`);
      console.log(`   Raw data.members:`, JSON.stringify(data.members, null, 2));

      // Convert member timestamps and decode email keys
      const members: { [email: string]: TeamMember } = {};
      if (data.members) {
        const rawKeys = Object.keys(data.members);
        console.log(`   Raw member keys:`, rawKeys);

        Object.entries(data.members).forEach(([encodedEmail, member]: [string, any]) => {
          // Decode the email key back to the actual email
          const email = decodeEmailKey(encodedEmail);
          // Store with lowercase email for consistent lookup
          const normalizedEmail = email.toLowerCase();
          console.log(`   📧 Key "${encodedEmail}" -> decoded "${email}" -> normalized "${normalizedEmail}"`);
          console.log(`      Member data:`, JSON.stringify(member, null, 2));

          members[normalizedEmail] = {
            ...member,
            email: member.email || email,
            joinedAt: member.joinedAt?.toDate?.() || member.joinedAt,
          };
        });
      }

      console.log(`   Final members object keys:`, Object.keys(members));
      console.log(`   Looking for user "${userEmail.toLowerCase()}" in members:`, members[userEmail.toLowerCase()]);

      return {
        ...data,
        id: docSnap.id,
        createdAt: data.createdAt?.toDate(),
        members,
      } as Team;
    });

    console.log(`✅ Found ${teams.length} teams for ${userEmail}`);
    return teams;
  } catch (error) {
    console.error('Failed to get user teams:', error);
    throw new Error(`Failed to get teams: ${getErrorMessage(error)}`);
  }
}

/**
 * Get all teams for a user (includes teams where user is owner via createdBy)
 * This handles cases where memberEmails might not include the owner
 */
export async function getAllTeamsForUser(userEmail: string): Promise<Team[]> {
  const normalizedEmail = userEmail.toLowerCase();
  const teamsMap = new Map<string, Team>();

  const processDoc = (docSnap: any) => {
    if (teamsMap.has(docSnap.id)) return;

    const data = docSnap.data();
    const members: { [email: string]: TeamMember } = {};
    if (data.members) {
      Object.entries(data.members).forEach(([encodedEmail, member]: [string, any]) => {
        const email = decodeEmailKey(encodedEmail).toLowerCase();
        members[email] = {
          ...member,
          joinedAt: member.joinedAt?.toDate(),
        };
      });
    }

    teamsMap.set(docSnap.id, {
      id: docSnap.id,
      name: data.name,
      description: data.description || '',
      createdBy: data.createdBy,
      createdAt: data.createdAt?.toDate(),
      driveFolderId: data.driveFolderId || docSnap.id,
      memberEmails: (data.memberEmails || []).map((e: string) => e.toLowerCase()),
      members,
    } as Team);
  };

  // Query 1: Teams where user is a member (this should always work)
  try {
    const memberQuery = query(
      collection(db, 'teams'),
      where('memberEmails', 'array-contains', normalizedEmail)
    );
    const memberSnapshot = await getDocs(memberQuery);
    memberSnapshot.docs.forEach(processDoc);
    console.log(`✅ Found ${memberSnapshot.docs.length} teams via memberEmails for ${userEmail}`);
  } catch (error) {
    console.error('Failed memberEmails query:', error);
  }

  // Query 2: Teams where user is owner (createdBy) - may fail due to Firestore rules
  try {
    const ownerQuery = query(
      collection(db, 'teams'),
      where('createdBy', '==', normalizedEmail)
    );
    const ownerSnapshot = await getDocs(ownerQuery);
    ownerSnapshot.docs.forEach(processDoc);
    console.log(`✅ Found ${ownerSnapshot.docs.length} teams via createdBy for ${userEmail}`);
  } catch (error) {
    // This query may fail due to Firestore rules - that's ok, memberEmails should cover most cases
    console.log('createdBy query not permitted (this is expected)');
  }

  const teams = Array.from(teamsMap.values());
  console.log(`✅ Found ${teams.length} total teams for ${userEmail}`);
  return teams;
}

/**
 * Get pending invites for a user
 * Handles backwards compatibility with invites created before lowercase normalization
 */
export async function getPendingInvites(userEmail: string): Promise<TeamInvitation[]> {
  try {
    const normalizedEmail = userEmail.toLowerCase();
    const invitesMap = new Map<string, TeamInvitation>();

    // Query 1: Try lowercase (new format)
    const q1 = query(
      collection(db, 'team_invites'),
      where('memberEmail', '==', normalizedEmail),
      where('status', '==', 'pending')
    );
    const snapshot1 = await getDocs(q1);
    snapshot1.docs.forEach(doc => {
      const data = doc.data();
      invitesMap.set(doc.id, {
        id: doc.id,
        ...data,
        invitedAt: data.invitedAt?.toDate(),
      } as TeamInvitation);
    });

    // Query 2: If original email has different casing, also try that (backwards compat)
    if (userEmail !== normalizedEmail) {
      const q2 = query(
        collection(db, 'team_invites'),
        where('memberEmail', '==', userEmail),
        where('status', '==', 'pending')
      );
      const snapshot2 = await getDocs(q2);
      snapshot2.docs.forEach(doc => {
        if (!invitesMap.has(doc.id)) {
          const data = doc.data();
          invitesMap.set(doc.id, {
            id: doc.id,
            ...data,
            invitedAt: data.invitedAt?.toDate(),
          } as TeamInvitation);
        }
      });
    }

    const invites = Array.from(invitesMap.values());
    console.log(`✅ Found ${invites.length} pending invites for ${userEmail}`);
    return invites;
  } catch (error) {
    console.error('Failed to get pending invites:', error);
    throw new Error(`Failed to get invites: ${getErrorMessage(error)}`);
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
  } catch (error) {
    console.error('Failed to get team pending invites:', error);
    throw new Error(`Failed to get team invites: ${getErrorMessage(error)}`);
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

    // Convert member timestamps and decode email keys
    const members: { [email: string]: TeamMember } = {};
    if (data.members) {
      Object.entries(data.members).forEach(([encodedEmail, member]: [string, any]) => {
        // Decode the email key back to the actual email
        const email = decodeEmailKey(encodedEmail);
        // Store with lowercase email for consistent lookup
        const normalizedEmail = email.toLowerCase();
        members[normalizedEmail] = {
          ...member,
          email: member.email || email, // Use stored email or decoded key
          joinedAt: member.joinedAt?.toDate?.() || member.joinedAt,
        };
      });
    }

    return {
      ...data,
      id: teamDoc.id,
      createdAt: data.createdAt?.toDate(),
      members,
    } as Team;
  } catch (error) {
    console.error('Failed to get team:', error);
    throw new Error(`Failed to get team: ${getErrorMessage(error)}`);
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

    // Prevent removing the owner (use lowercase for lookup)
    if (team.members[memberEmail.toLowerCase()]?.role === 'owner') {
      throw new Error('Cannot remove team owner');
    }

    // Update team document - use encoded email key
    const memberEmailKey = encodeEmailKey(memberEmail);
    await updateDoc(doc(db, 'teams', teamId), {
      [`members.${memberEmailKey}`]: deleteField(), // Remove member field
      memberEmails: arrayRemove(memberEmail),
    });

    // Note: Access to Cloud Storage is automatically revoked when user is removed from team

    console.log(`✅ Removed ${memberEmail} from team ${teamId}`);
  } catch (error) {
    console.error('Failed to remove team member:', error);
    throw new Error(`Failed to remove member: ${getErrorMessage(error)}`);
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
  } catch (error) {
    console.error('Failed to delete team:', error);
    throw new Error(`Failed to delete team: ${getErrorMessage(error)}`);
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
  } catch (error) {
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
  } catch (error) {
    console.error('Failed to send invitation emails:', error);
    throw new Error(`Failed to send invitation emails: ${getErrorMessage(error)}`);
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
  } catch (error) {
    console.error('Failed to cancel invitation:', error);
    throw new Error(`Failed to cancel invitation: ${getErrorMessage(error)}`);
  }
}

/**
 * Resend invitation email
 */
export async function resendInvitation(
  _teamId: string,
  teamName: string,
  email: string,
  _inviteCode: string,
  role: 'admin' | 'leader' | 'member'
): Promise<void> {
  try {
    console.log(`Resending invitation to ${email}...`);

    // Resend the email
    await sendInviteEmail(email, teamName, role);

    console.log(`✅ Resent invitation to ${email}`);
  } catch (error) {
    console.error('Failed to resend invitation:', error);
    throw new Error(`Failed to resend invitation: ${getErrorMessage(error)}`);
  }
}

/**
 * Re-share Google Drive folder with a team member
 * This should be called by the team OWNER when a member has permission issues
 * Also repairs membership data if the user is in memberEmails but not in members object
 */
export async function reshareWithMember(
  teamId: string,
  memberEmail: string
): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`🔄 Re-sharing Drive folder with ${memberEmail}...`);

    // 1. Get the team
    const teamDoc = await getDoc(doc(db, 'teams', teamId));
    if (!teamDoc.exists()) {
      return { success: false, message: 'Team not found' };
    }

    const team = teamDoc.data() as Team;

    if (!team.driveFolderId) {
      return { success: false, message: 'Team has no associated Drive folder' };
    }

    // Normalize email for lookups
    const normalizedEmail = memberEmail.toLowerCase();

    // 2. Check if user needs membership repair (in memberEmails but not in members)
    const isMemberByEmail = team.memberEmails?.some(e => e.toLowerCase() === normalizedEmail);

    // Check members object - need to decode keys
    let foundInMembers = false;
    if (team.members) {
      for (const key of Object.keys(team.members)) {
        const decodedEmail = decodeEmailKey(key).toLowerCase();
        if (decodedEmail === normalizedEmail) {
          foundInMembers = true;
          break;
        }
      }
    }

    if (isMemberByEmail && !foundInMembers) {
      console.log(`⚠️ Member ${memberEmail} is in memberEmails but not in members object - repairing...`);

      // Try to get role from pending invite
      const inviteId = `${teamId}_${memberEmail.replace(/[.@]/g, '_')}`;
      let role: 'admin' | 'leader' | 'member' = 'member';

      try {
        const inviteDoc = await getDoc(doc(db, 'team_invites', inviteId));
        if (inviteDoc.exists()) {
          const inviteData = inviteDoc.data();
          role = inviteData.role || 'member';
          console.log(`📋 Found invite with role: ${role}`);
        }
      } catch (inviteErr) {
        console.warn('Could not fetch invite data:', inviteErr);
      }

      // Add the member to the members object in Firestore
      const memberEmailKey = encodeEmailKey(memberEmail);
      await updateDoc(doc(db, 'teams', teamId), {
        [`members.${memberEmailKey}`]: {
          email: memberEmail,
          role: role,
          joinedAt: Timestamp.now(),
          displayName: memberEmail.split('@')[0],
        },
      });

      console.log(`✅ Added ${memberEmail} to members object with role: ${role}`);
    }

    // 3. Share the folder recursively
    console.log(`📤 Sharing folder ${team.driveFolderId} with ${memberEmail}...`);
    await shareFolderRecursively(team.driveFolderId, memberEmail, 'writer');

    console.log(`✅ Successfully re-shared folder with ${memberEmail}`);
    return {
      success: true,
      message: `Successfully shared folder with ${memberEmail}. They may need to refresh their app.`
    };
  } catch (error) {
    console.error('Failed to re-share folder:', error);
    return {
      success: false,
      message: `Failed to share: ${getErrorMessage(error)}`
    };
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
    // Use encoded email key for Firestore compatibility
    const memberEmailKey = encodeEmailKey(memberEmail);
    await updateDoc(doc(db, 'teams', teamId), {
      [`members.${memberEmailKey}.role`]: newRole,
    });

    console.log(`✅ Updated ${memberEmail} role to ${newRole} in team ${teamId}`);
  } catch (error) {
    console.error('Failed to update member role:', error);
    throw new Error(`Failed to update role: ${getErrorMessage(error)}`);
  }
}

/**
 * Update team member's profile info (photoURL, displayName, customAvatar)
 * Call this when a user loads their teams to sync their current profile
 */
export async function updateMemberProfile(
  teamId: string,
  memberEmail: string,
  displayName?: string,
  photoURL?: string,
  customAvatar?: string
): Promise<void> {
  try {
    const memberEmailKey = encodeEmailKey(memberEmail);
    const updates: Record<string, any> = {};

    if (displayName) {
      updates[`members.${memberEmailKey}.displayName`] = displayName;
    }
    if (photoURL) {
      updates[`members.${memberEmailKey}.photoURL`] = photoURL;
    }
    if (customAvatar !== undefined) {
      updates[`members.${memberEmailKey}.customAvatar`] = customAvatar;
    }

    if (Object.keys(updates).length > 0) {
      await updateDoc(doc(db, 'teams', teamId), updates);
      console.log(`✅ Updated profile for ${memberEmail} in team ${teamId}`);
    }
  } catch (error) {
    // Silent failure - profile sync is not critical
    console.warn('Failed to update member profile:', getErrorMessage(error));
  }
}

/**
 * Update pending invitation role
 */
export async function updateInvitationRole(
  inviteId: string,
  newRole: 'admin' | 'leader' | 'member'
): Promise<void> {
  try {
    console.log(`Updating invitation ${inviteId} role to ${newRole}...`);

    await updateDoc(doc(db, 'team_invites', inviteId), {
      role: newRole,
    });

    console.log(`✅ Updated invitation role to ${newRole}`);
  } catch (error) {
    console.error('Failed to update invitation role:', error);
    throw new Error(`Failed to update invitation role: ${getErrorMessage(error)}`);
  }
}

/**
 * Re-share team folder contents with an existing member
 * Useful for fixing permissions when a member was invited before recursive sharing was implemented
 */
export async function reshareTeamContents(
  teamId: string,
  memberEmail: string
): Promise<void> {
  try {
    console.log(`Re-sharing team contents with ${memberEmail}...`);

    // Get team data
    const team = await getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    // Normalize email to lowercase for lookups (members object uses lowercase keys)
    const normalizedEmail = memberEmail.toLowerCase();

    // Check if user is a member (memberEmails may have original case)
    const isMember = team.memberEmails.some(e => e.toLowerCase() === normalizedEmail);
    if (!isMember) {
      throw new Error('User is not a member of this team');
    }

    // Get the member's role to determine permission level (use lowercase for lookup)
    let memberRole = team.members[normalizedEmail]?.role;

    // If member is in memberEmails but not in members object, repair the membership data first
    if (!memberRole) {
      console.log(`⚠️ Member ${memberEmail} is in memberEmails but not in members object - repairing...`);

      // Try to get role from pending invite
      const inviteId = `${teamId}_${memberEmail.replace(/[.@]/g, '_')}`;
      let role: 'admin' | 'leader' | 'member' = 'member';

      try {
        const inviteDoc = await getDoc(doc(db, 'team_invites', inviteId));
        if (inviteDoc.exists()) {
          const inviteData = inviteDoc.data();
          role = inviteData.role || 'member';
          console.log(`📋 Found invite with role: ${role}`);
        }
      } catch (inviteErr) {
        console.warn('Could not fetch invite data:', inviteErr);
      }

      // Add the member to the members object in Firestore
      const memberEmailKey = encodeEmailKey(memberEmail);
      await updateDoc(doc(db, 'teams', teamId), {
        [`members.${memberEmailKey}`]: {
          email: memberEmail,
          role: role,
          joinedAt: Timestamp.now(),
          displayName: memberEmail.split('@')[0],
        },
      });

      console.log(`✅ Added ${memberEmail} to members object with role: ${role}`);
      memberRole = role;
    }

    const permission = memberRole === 'owner' || memberRole === 'admin' ? 'writer' : 'writer';

    // Recursively share all contents
    await shareFolderRecursively(team.driveFolderId, memberEmail, permission);

    console.log(`✅ Re-shared all team contents with ${memberEmail}`);
  } catch (error) {
    console.error('Failed to re-share team contents:', error);
    throw new Error(`Failed to re-share team contents: ${getErrorMessage(error)}`);
  }
}

/**
 * Automatically repair permissions for a team member
 * This function is called when access issues are detected
 */
export async function autoRepairMemberPermissions(
  teamId: string,
  memberEmail: string
): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`🔧 Auto-repairing permissions for ${memberEmail} in team ${teamId}...`);

    // Get team data
    const team = await getTeamById(teamId);
    if (!team) {
      return { success: false, message: 'Team not found' };
    }

    // Normalize email to lowercase for lookups (members object uses lowercase keys)
    const normalizedEmail = memberEmail.toLowerCase();

    // Verify user is actually a member (memberEmails may have original case)
    const isMember = team.memberEmails.some(e => e.toLowerCase() === normalizedEmail);
    if (!isMember) {
      return { success: false, message: 'User is not a member of this team' };
    }

    // Use lowercase for member lookup
    let member = team.members[normalizedEmail];

    // If member is in memberEmails but not in members object, repair the membership data
    if (!member) {
      console.log(`⚠️ Member ${memberEmail} is in memberEmails but not in members object - repairing...`);

      // Try to get role from pending invite
      const inviteId = `${teamId}_${memberEmail.replace(/[.@]/g, '_')}`;
      let role: 'admin' | 'leader' | 'member' = 'member';

      try {
        const inviteDoc = await getDoc(doc(db, 'team_invites', inviteId));
        if (inviteDoc.exists()) {
          const inviteData = inviteDoc.data();
          role = inviteData.role || 'member';
          console.log(`📋 Found invite with role: ${role}`);
        }
      } catch (inviteErr) {
        console.warn('Could not fetch invite data:', inviteErr);
      }

      // Add the member to the members object in Firestore
      const memberEmailKey = encodeEmailKey(memberEmail);
      await updateDoc(doc(db, 'teams', teamId), {
        [`members.${memberEmailKey}`]: {
          email: memberEmail,
          role: role,
          joinedAt: Timestamp.now(),
          displayName: memberEmail.split('@')[0], // Use email prefix as display name
        },
      });

      console.log(`✅ Added ${memberEmail} to members object with role: ${role}`);

      // Update local member reference
      member = {
        email: memberEmail,
        role: role,
        joinedAt: new Date(),
        displayName: memberEmail.split('@')[0],
      };
    }

    console.log(`👤 Member role: ${member.role}`);
    console.log(`📅 Member joined: ${member.joinedAt}`);

    // Determine appropriate permission level
    const permission = member.role === 'owner' || member.role === 'admin' ? 'writer' : 'writer';

    try {
      // First, check current permissions
      const { diagnoseFolderPermissions } = await import('./googleDriveService');
      const diagnostic = await diagnoseFolderPermissions(team.driveFolderId, memberEmail);

      if (diagnostic.hasAccess && diagnostic.userPermission?.role === permission) {
        return { success: true, message: 'Permissions are already correct' };
      }

      // Attempt to re-share the folder and all contents
      console.log(`📤 Re-sharing folder with ${memberEmail} as ${permission}...`);
      await shareFolderRecursively(team.driveFolderId, memberEmail, permission);

      // Verify the fix worked
      const postDiagnostic = await diagnoseFolderPermissions(team.driveFolderId, memberEmail);
      if (postDiagnostic.hasAccess) {
        console.log(`✅ Successfully repaired permissions for ${memberEmail}`);
        return { success: true, message: 'Permissions repaired successfully' };
      } else {
        console.warn(`⚠️ Repair attempted but access still not working`);
        return {
          success: false,
          message: 'Repair attempted but access issue persists. Please sign out and back in with Google.'
        };
      }

    } catch (repairError) {
      console.error('Repair error:', repairError);

      const repairErrorMsg = getErrorMessage(repairError);
      // Check if this is a permission error (owner action required)
      if (repairErrorMsg.includes('403') || repairErrorMsg.includes('forbidden')) {
        return {
          success: false,
          message: 'Only the team owner can repair permissions. Please contact them.'
        };
      }

      return {
        success: false,
        message: `Repair failed: ${repairErrorMsg}`
      };
    }

  } catch (error) {
    console.error('Auto-repair failed:', error);
    return {
      success: false,
      message: `Auto-repair failed: ${getErrorMessage(error)}`
    };
  }
}
