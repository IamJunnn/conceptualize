// Workspace Service - Manages team workspaces and memberships
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
} from "firebase/firestore";
import { db } from "./firebase";
import { getErrorMessage } from "../utils/errorUtils";

// Workspace role type
export type WorkspaceRole = "member" | "leader" | "admin";

// Workspace interface
export interface Workspace {
  id: string;
  name: string;
  createdBy: string; // UID of creator
  createdAt: Date;
  updatedAt: Date;
  memberCount: number;
}

// Workspace member interface
export interface WorkspaceMember {
  uid: string;
  email: string;
  displayName: string;
  role: WorkspaceRole;
  joinedAt: Date;
}

// Invitation interface
export interface Invitation {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: WorkspaceRole;
  invitedBy: string; // UID
  invitedByName: string;
  createdAt: Date;
  status: "pending" | "accepted" | "rejected";
  token: string;
}

/**
 * Create a new workspace (first user becomes admin)
 */
export const createWorkspace = async (
  name: string,
  creatorUid: string,
  creatorEmail: string,
  creatorDisplayName: string
): Promise<Workspace> => {
  try {
    // Create workspace document
    const workspaceRef = doc(collection(db, "workspaces"));
    const workspaceId = workspaceRef.id;

    const workspace: Workspace = {
      id: workspaceId,
      name,
      createdBy: creatorUid,
      createdAt: new Date(),
      updatedAt: new Date(),
      memberCount: 1
    };

    await setDoc(workspaceRef, {
      ...workspace,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });

    // Add creator as admin member
    const memberRef = doc(db, "workspaces", workspaceId, "members", creatorUid);
    await setDoc(memberRef, {
      uid: creatorUid,
      email: creatorEmail,
      displayName: creatorDisplayName,
      role: "admin",
      joinedAt: Timestamp.now()
    });

    // Update user's workspace reference
    const userRef = doc(db, "users", creatorUid);
    await setDoc(userRef, {
      uid: creatorUid,
      email: creatorEmail,
      displayName: creatorDisplayName,
      workspaceId: workspaceId,
      role: "admin",
      createdAt: Timestamp.now(),
      lastLogin: Timestamp.now()
    }, { merge: true });

    return workspace;
  } catch (error) {
    console.error("Error creating workspace:", error);
    throw new Error(`Failed to create workspace: ${getErrorMessage(error)}`);
  }
};

/**
 * Get workspace by ID
 */
export const getWorkspace = async (workspaceId: string): Promise<Workspace | null> => {
  try {
    const workspaceDoc = await getDoc(doc(db, "workspaces", workspaceId));

    if (!workspaceDoc.exists()) {
      return null;
    }

    const data = workspaceDoc.data();
    return {
      id: workspaceDoc.id,
      name: data.name,
      createdBy: data.createdBy,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      memberCount: data.memberCount || 0
    };
  } catch (error) {
    console.error("Error getting workspace:", error);
    throw new Error(`Failed to get workspace: ${getErrorMessage(error)}`);
  }
};

/**
 * Get user's workspace
 */
export const getUserWorkspace = async (uid: string): Promise<Workspace | null> => {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));

    if (!userDoc.exists() || !userDoc.data().workspaceId) {
      return null;
    }

    return await getWorkspace(userDoc.data().workspaceId);
  } catch (error) {
    console.error("Error getting user workspace:", error);
    return null;
  }
};

/**
 * Get all members of a workspace
 */
export const getWorkspaceMembers = async (workspaceId: string): Promise<WorkspaceMember[]> => {
  try {
    const membersRef = collection(db, "workspaces", workspaceId, "members");
    const membersSnapshot = await getDocs(membersRef);

    return membersSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        uid: data.uid,
        email: data.email,
        displayName: data.displayName,
        role: data.role as WorkspaceRole,
        joinedAt: data.joinedAt?.toDate() || new Date()
      };
    });
  } catch (error) {
    console.error("Error getting workspace members:", error);
    throw new Error(`Failed to get workspace members: ${getErrorMessage(error)}`);
  }
};

/**
 * Get member role in workspace
 */
export const getMemberRole = async (
  workspaceId: string,
  uid: string
): Promise<WorkspaceRole | null> => {
  try {
    const memberDoc = await getDoc(doc(db, "workspaces", workspaceId, "members", uid));

    if (!memberDoc.exists()) {
      return null;
    }

    return memberDoc.data().role as WorkspaceRole;
  } catch (error) {
    console.error("Error getting member role:", error);
    return null;
  }
};

/**
 * Update member role (Admin only can promote to admin, Leaders can manage members)
 */
export const updateMemberRole = async (
  workspaceId: string,
  targetUid: string,
  newRole: WorkspaceRole,
  requesterUid: string
): Promise<void> => {
  try {
    // Check requester permissions
    const requesterRole = await getMemberRole(workspaceId, requesterUid);

    if (!requesterRole) {
      throw new Error("You are not a member of this workspace");
    }

    // Get target member's current role
    const targetRole = await getMemberRole(workspaceId, targetUid);

    if (!targetRole) {
      throw new Error("Target user is not a member of this workspace");
    }

    // Permission checks
    if (requesterRole === "member") {
      throw new Error("Members cannot change roles");
    }

    if (requesterRole === "leader") {
      // Leaders can only manage members, not other leaders or admins
      if (targetRole !== "member") {
        throw new Error("Leaders can only manage members");
      }
      if (newRole === "admin") {
        throw new Error("Leaders cannot promote to admin");
      }
    }

    // Update role in workspace members
    const memberRef = doc(db, "workspaces", workspaceId, "members", targetUid);
    await updateDoc(memberRef, {
      role: newRole
    });

    // Update role in user document
    const userRef = doc(db, "users", targetUid);
    await updateDoc(userRef, {
      role: newRole
    });

  } catch (error) {
    console.error("Error updating member role:", error);
    throw new Error(`Failed to update member role: ${getErrorMessage(error)}`);
  }
};

/**
 * Remove member from workspace (Admin can remove anyone, Leader can remove members)
 */
export const removeMemberFromWorkspace = async (
  workspaceId: string,
  targetUid: string,
  requesterUid: string
): Promise<void> => {
  try {
    // Check requester permissions
    const requesterRole = await getMemberRole(workspaceId, requesterUid);

    if (!requesterRole) {
      throw new Error("You are not a member of this workspace");
    }

    // Get target member's current role
    const targetRole = await getMemberRole(workspaceId, targetUid);

    if (!targetRole) {
      throw new Error("Target user is not a member of this workspace");
    }

    // Permission checks
    if (requesterRole === "member") {
      throw new Error("Members cannot remove users");
    }

    if (requesterRole === "leader" && targetRole !== "member") {
      throw new Error("Leaders can only remove members");
    }

    // Remove from workspace members
    await deleteDoc(doc(db, "workspaces", workspaceId, "members", targetUid));

    // Update user document (remove workspace reference)
    const userRef = doc(db, "users", targetUid);
    await updateDoc(userRef, {
      workspaceId: null,
      role: null
    });

    // Update workspace member count
    const workspaceRef = doc(db, "workspaces", workspaceId);
    const workspace = await getDoc(workspaceRef);
    if (workspace.exists()) {
      await updateDoc(workspaceRef, {
        memberCount: Math.max(0, (workspace.data().memberCount || 1) - 1),
        updatedAt: Timestamp.now()
      });
    }

  } catch (error) {
    console.error("Error removing member:", error);
    throw new Error(`Failed to remove member: ${getErrorMessage(error)}`);
  }
};

/**
 * Create invitation for new member
 */
export const createInvitation = async (
  workspaceId: string,
  email: string,
  role: WorkspaceRole,
  inviterUid: string,
  inviterName: string
): Promise<Invitation> => {
  try {
    // Check if inviter has permission
    const inviterRole = await getMemberRole(workspaceId, inviterUid);

    if (inviterRole !== "admin") {
      throw new Error("Only admins can invite new members");
    }

    // Get workspace info
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    // Generate unique token
    const token = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create invitation document
    const inviteRef = doc(collection(db, "invitations"));
    const invitation: Invitation = {
      id: inviteRef.id,
      workspaceId,
      workspaceName: workspace.name,
      email,
      role,
      invitedBy: inviterUid,
      invitedByName: inviterName,
      createdAt: new Date(),
      status: "pending",
      token
    };

    await setDoc(inviteRef, {
      ...invitation,
      createdAt: Timestamp.now()
    });

    return invitation;
  } catch (error) {
    console.error("Error creating invitation:", error);
    throw new Error(`Failed to create invitation: ${getErrorMessage(error)}`);
  }
};

/**
 * Get invitation by token
 */
export const getInvitationByToken = async (token: string): Promise<Invitation | null> => {
  try {
    const invitationsRef = collection(db, "invitations");
    const q = query(invitationsRef, where("token", "==", token), where("status", "==", "pending"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    return {
      id: doc.id,
      workspaceId: data.workspaceId,
      workspaceName: data.workspaceName,
      email: data.email,
      role: data.role as WorkspaceRole,
      invitedBy: data.invitedBy,
      invitedByName: data.invitedByName,
      createdAt: data.createdAt?.toDate() || new Date(),
      status: data.status,
      token: data.token
    };
  } catch (error) {
    console.error("Error getting invitation:", error);
    return null;
  }
};

/**
 * Accept invitation and join workspace
 */
export const acceptInvitation = async (
  invitationId: string,
  uid: string,
  email: string,
  displayName: string
): Promise<void> => {
  try {
    // Get invitation
    const inviteDoc = await getDoc(doc(db, "invitations", invitationId));

    if (!inviteDoc.exists()) {
      throw new Error("Invitation not found");
    }

    const invitation = inviteDoc.data();

    if (invitation.status !== "pending") {
      throw new Error("Invitation is no longer valid");
    }

    if (invitation.email !== email) {
      throw new Error("This invitation is for a different email address");
    }

    // Add user to workspace members
    const memberRef = doc(db, "workspaces", invitation.workspaceId, "members", uid);
    await setDoc(memberRef, {
      uid,
      email,
      displayName,
      role: invitation.role,
      joinedAt: Timestamp.now()
    });

    // Update user document
    const userRef = doc(db, "users", uid);
    await setDoc(userRef, {
      uid,
      email,
      displayName,
      workspaceId: invitation.workspaceId,
      role: invitation.role,
      createdAt: Timestamp.now(),
      lastLogin: Timestamp.now()
    }, { merge: true });

    // Update workspace member count
    const workspaceRef = doc(db, "workspaces", invitation.workspaceId);
    const workspace = await getDoc(workspaceRef);
    if (workspace.exists()) {
      await updateDoc(workspaceRef, {
        memberCount: (workspace.data().memberCount || 0) + 1,
        updatedAt: Timestamp.now()
      });
    }

    // Mark invitation as accepted
    await updateDoc(doc(db, "invitations", invitationId), {
      status: "accepted"
    });

  } catch (error) {
    console.error("Error accepting invitation:", error);
    throw new Error(`Failed to accept invitation: ${getErrorMessage(error)}`);
  }
};

/**
 * Get pending invitations for a workspace
 */
export const getPendingInvitations = async (workspaceId: string): Promise<Invitation[]> => {
  try {
    const invitationsQuery = query(
      collection(db, "invitations"),
      where("workspaceId", "==", workspaceId),
      where("status", "==", "pending")
    );

    const snapshot = await getDocs(invitationsQuery);

    const invitations: Invitation[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      invitations.push({
        id: doc.id,
        workspaceId: data.workspaceId,
        workspaceName: data.workspaceName,
        email: data.email,
        role: data.role as WorkspaceRole,
        invitedBy: data.invitedBy,
        invitedByName: data.invitedByName,
        createdAt: data.createdAt?.toDate() || new Date(),
        status: data.status,
        token: data.token,
      });
    });

    return invitations;
  } catch (error) {
    console.error("Error getting pending invitations:", error);
    throw new Error(`Failed to get pending invitations: ${getErrorMessage(error)}`);
  }
};

/**
 * Cancel a pending invitation
 */
export const cancelInvitation = async (invitationId: string, requesterUid: string): Promise<void> => {
  try {
    // Get the invitation
    const invitationDoc = await getDoc(doc(db, "invitations", invitationId));
    if (!invitationDoc.exists()) {
      throw new Error("Invitation not found");
    }

    const invitation = invitationDoc.data();

    // Check if invitation is pending
    if (invitation.status !== "pending") {
      throw new Error("Can only cancel pending invitations");
    }

    // Check permissions: only admins or the person who sent the invitation can cancel it
    const workspaceId = invitation.workspaceId;
    const memberRole = await getMemberRole(workspaceId, requesterUid);

    if (memberRole !== "admin" && invitation.invitedBy !== requesterUid) {
      throw new Error("You don't have permission to cancel this invitation");
    }

    // Update the invitation status
    await updateDoc(doc(db, "invitations", invitationId), {
      status: "cancelled",
      cancelledBy: requesterUid,
      cancelledAt: Timestamp.now()
    });

  } catch (error) {
    console.error("Error cancelling invitation:", error);
    throw new Error(`Failed to cancel invitation: ${getErrorMessage(error)}`);
  }
};

/**
 * Resend an invitation email
 */
export const resendInvitation = async (invitationId: string, requesterUid: string): Promise<Invitation> => {
  try {
    // Get the invitation
    const invitationDoc = await getDoc(doc(db, "invitations", invitationId));
    if (!invitationDoc.exists()) {
      throw new Error("Invitation not found");
    }

    const data = invitationDoc.data();

    // Check if invitation is pending
    if (data.status !== "pending") {
      throw new Error("Can only resend pending invitations");
    }

    // Check permissions: only admins can resend invitations
    const workspaceId = data.workspaceId;
    const memberRole = await getMemberRole(workspaceId, requesterUid);

    if (memberRole !== "admin") {
      throw new Error("Only admins can resend invitations");
    }

    // Update the resent timestamp
    await updateDoc(doc(db, "invitations", invitationId), {
      lastResentAt: Timestamp.now(),
      resentCount: (data.resentCount || 0) + 1
    });

    // Return the invitation for email sending
    return {
      id: invitationDoc.id,
      workspaceId: data.workspaceId,
      workspaceName: data.workspaceName,
      email: data.email,
      role: data.role as WorkspaceRole,
      invitedBy: data.invitedBy,
      invitedByName: data.invitedByName,
      createdAt: data.createdAt?.toDate() || new Date(),
      status: data.status,
      token: data.token,
    };

  } catch (error) {
    console.error("Error resending invitation:", error);
    throw new Error(`Failed to resend invitation: ${getErrorMessage(error)}`);
  }
};

/**
 * Check if user is admin
 */
export const isWorkspaceAdmin = (member: WorkspaceMember | null): boolean => {
  return member?.role === "admin";
};

/**
 * Check if user is leader or admin
 */
export const isLeaderOrAdmin = (member: WorkspaceMember | null): boolean => {
  return member?.role === "leader" || member?.role === "admin";
};
