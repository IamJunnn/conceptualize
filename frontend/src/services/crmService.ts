/**
 * CRM Service
 * Firestore operations for CRM boards, contacts, deals, and activities
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
  onSnapshot,
  Timestamp,
  Unsubscribe,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { getErrorMessage } from '../utils/errorUtils';
import {
  CRMBoard,
  CRMBoardDoc,
  Contact,
  ContactDoc,
  ContactFormData,
  Company,
  CompanyDoc,
  CompanyFormData,
  Deal,
  DealDoc,
  DealFormData,
  Activity,
  ActivityDoc,
  ActivityType,
  PipelineStage,
  DEFAULT_PIPELINE_STAGES,
  docToBoard,
  docToContact,
  docToDeal,
  docToActivity,
  docToCompany,
  generateBoardId,
  generateContactId,
  generateCompanyId,
  generateDealId,
  generateActivityId,
  generateStageId,
} from './crmTypes';

// ============================================
// BOARD OPERATIONS
// ============================================

/**
 * Get or create a personal CRM board for a user
 */
export async function getOrCreatePersonalBoard(
  userId: string,
  userEmail: string
): Promise<CRMBoard> {
  try {
    const boardsRef = collection(db, 'crmBoards');
    const q = query(
      boardsRef,
      where('type', '==', 'personal'),
      where('ownerId', '==', userId)
    );
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      return docToBoard(snapshot.docs[0].data() as CRMBoardDoc);
    }

    // Create new personal board
    const boardId = generateBoardId();
    const now = Timestamp.now();

    const defaultStages: PipelineStage[] = DEFAULT_PIPELINE_STAGES.map(stage => ({
      ...stage,
      id: generateStageId(),
    }));

    const newBoard: CRMBoardDoc = {
      id: boardId,
      name: 'Personal CRM',
      type: 'personal',
      ownerId: userId,
      ownerEmail: userEmail.toLowerCase(),
      customFields: [],
      pipelineStages: defaultStages,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'crmBoards', boardId), newBoard);
    console.log(`✅ Created personal CRM board for ${userEmail}`);

    return docToBoard(newBoard);
  } catch (error) {
    console.error('Failed to get/create personal board:', error);
    throw new Error(`Failed to get/create personal board: ${getErrorMessage(error)}`);
  }
}

/**
 * Get or create a team CRM board
 */
export async function getOrCreateTeamBoard(
  teamId: string,
  teamName: string,
  userId: string,
  userEmail: string
): Promise<CRMBoard> {
  try {
    const boardsRef = collection(db, 'crmBoards');
    const q = query(
      boardsRef,
      where('type', '==', 'team'),
      where('teamId', '==', teamId)
    );
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      return docToBoard(snapshot.docs[0].data() as CRMBoardDoc);
    }

    // Create new team board
    const boardId = generateBoardId();
    const now = Timestamp.now();

    const defaultStages: PipelineStage[] = DEFAULT_PIPELINE_STAGES.map(stage => ({
      ...stage,
      id: generateStageId(),
    }));

    const newBoard: CRMBoardDoc = {
      id: boardId,
      name: `${teamName} CRM`,
      type: 'team',
      teamId,
      ownerId: userId,
      ownerEmail: userEmail.toLowerCase(),
      customFields: [],
      pipelineStages: defaultStages,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'crmBoards', boardId), newBoard);
    console.log(`✅ Created team CRM board for ${teamName}`);

    return docToBoard(newBoard);
  } catch (error) {
    console.error('Failed to get/create team board:', error);
    throw new Error(`Failed to get/create team board: ${getErrorMessage(error)}`);
  }
}

/**
 * Get a board by ID
 */
export async function getBoard(boardId: string): Promise<CRMBoard | null> {
  try {
    const docRef = doc(db, 'crmBoards', boardId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      return null;
    }

    return docToBoard(snapshot.data() as CRMBoardDoc);
  } catch (error) {
    console.error('Failed to get board:', error);
    throw new Error(`Failed to get board: ${getErrorMessage(error)}`);
  }
}

/**
 * Subscribe to a board
 */
export function subscribeToBoard(
  boardId: string,
  callback: (board: CRMBoard | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'crmBoards', boardId),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      callback(docToBoard(snapshot.data() as CRMBoardDoc));
    },
    (error) => {
      console.error('Error in board subscription:', error);
      onError?.(error);
    }
  );
}

/**
 * Update board settings
 */
export async function updateBoard(
  boardId: string,
  updates: Partial<Pick<CRMBoard, 'name' | 'customFields' | 'pipelineStages'>>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'crmBoards', boardId), {
      ...updates,
      updatedAt: Timestamp.now(),
    });
    console.log(`✅ Updated board ${boardId}`);
  } catch (error) {
    console.error('Failed to update board:', error);
    throw new Error(`Failed to update board: ${getErrorMessage(error)}`);
  }
}

/**
 * Get all boards for a user (personal and team boards)
 */
export async function getUserBoards(
  userId: string,
  teamId?: string
): Promise<CRMBoard[]> {
  try {
    const boardsRef = collection(db, 'crmBoards');

    // Get personal boards
    const personalQuery = query(
      boardsRef,
      where('type', '==', 'personal'),
      where('ownerId', '==', userId)
    );
    const personalSnapshot = await getDocs(personalQuery);
    const personalBoards = personalSnapshot.docs.map(doc =>
      docToBoard(doc.data() as CRMBoardDoc)
    );

    // Get team boards if teamId provided
    let teamBoards: CRMBoard[] = [];
    if (teamId) {
      const teamQuery = query(
        boardsRef,
        where('type', '==', 'team'),
        where('teamId', '==', teamId)
      );
      const teamSnapshot = await getDocs(teamQuery);
      teamBoards = teamSnapshot.docs.map(doc =>
        docToBoard(doc.data() as CRMBoardDoc)
      );
    }

    return [...personalBoards, ...teamBoards];
  } catch (error) {
    console.error('Failed to get user boards:', error);
    throw new Error(`Failed to get user boards: ${getErrorMessage(error)}`);
  }
}

/**
 * Subscribe to boards for a user
 */
export function subscribeToUserBoards(
  userId: string,
  teamId: string | undefined,
  callback: (boards: CRMBoard[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const boardsRef = collection(db, 'crmBoards');

  // For now, subscribe to team boards only (most common use case)
  // Personal boards can be added later if needed
  const q = teamId
    ? query(boardsRef, where('type', '==', 'team'), where('teamId', '==', teamId))
    : query(boardsRef, where('type', '==', 'personal'), where('ownerId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const boards = snapshot.docs.map(doc =>
        docToBoard(doc.data() as CRMBoardDoc)
      );
      callback(boards);
    },
    (error) => {
      console.error('Error in boards subscription:', error);
      onError?.(error);
    }
  );
}

/**
 * Create a new CRM board
 */
export async function createBoard(
  name: string,
  type: 'personal' | 'team',
  userId: string,
  userEmail: string,
  teamId?: string
): Promise<CRMBoard> {
  try {
    const boardId = generateBoardId();
    const now = Timestamp.now();

    const defaultStages: PipelineStage[] = DEFAULT_PIPELINE_STAGES.map(stage => ({
      ...stage,
      id: generateStageId(),
    }));

    const newBoard: CRMBoardDoc = {
      id: boardId,
      name,
      type,
      ...(teamId ? { teamId } : {}), // Only include teamId if it has a value
      ownerId: userId,
      ownerEmail: userEmail.toLowerCase(),
      customFields: [],
      pipelineStages: defaultStages,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'crmBoards', boardId), newBoard);
    console.log(`✅ Created CRM board: ${name}`);

    return docToBoard(newBoard);
  } catch (error) {
    console.error('Failed to create board:', error);
    throw new Error(`Failed to create board: ${getErrorMessage(error)}`);
  }
}

/**
 * Delete a CRM board and all associated data
 */
export async function deleteBoard(boardId: string): Promise<void> {
  try {
    const batch = writeBatch(db);

    // Delete all contacts for this board
    const contactsQuery = query(
      collection(db, 'crm_contacts'),
      where('boardId', '==', boardId)
    );
    const contactsSnapshot = await getDocs(contactsQuery);
    contactsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    // Delete all companies for this board
    const companiesQuery = query(
      collection(db, 'crmCompanies'),
      where('boardId', '==', boardId)
    );
    const companiesSnapshot = await getDocs(companiesQuery);
    companiesSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    // Delete all deals for this board
    const dealsQuery = query(
      collection(db, 'crm_deals'),
      where('boardId', '==', boardId)
    );
    const dealsSnapshot = await getDocs(dealsQuery);
    dealsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    // Delete the board itself
    batch.delete(doc(db, 'crmBoards', boardId));

    await batch.commit();
    console.log(`✅ Deleted board ${boardId} and all associated data`);
  } catch (error) {
    console.error('Failed to delete board:', error);
    throw new Error(`Failed to delete board: ${getErrorMessage(error)}`);
  }
}

/**
 * Rename a CRM board
 */
export async function renameBoard(boardId: string, newName: string): Promise<void> {
  return updateBoard(boardId, { name: newName });
}

// ============================================
// CONTACT OPERATIONS
// ============================================

/**
 * Create a new contact
 */
export async function createContact(
  boardId: string,
  data: ContactFormData,
  userId: string,
  userEmail: string
): Promise<Contact> {
  try {
    const contactId = generateContactId();
    const now = Timestamp.now();

    const contactDoc: ContactDoc = {
      id: contactId,
      boardId,
      name: data.name,
      email: data.email.toLowerCase(),
      phone: data.phone,
      company: data.company,
      position: data.position,
      status: data.status,
      tags: data.tags,
      source: data.source,
      notes: data.notes,
      customFields: data.customFields,
      emailsSent: 0,
      emailsOpened: 0,
      emailsReplied: 0,
      createdBy: userId,
      createdByEmail: userEmail.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'crmContacts', contactId), contactDoc);
    console.log(`✅ Created contact: ${data.name}`);

    // Log activity
    await logActivity(boardId, contactId, undefined, 'note_added', 'Contact created', `Created contact ${data.name}`, userId, userEmail);

    return docToContact(contactDoc);
  } catch (error) {
    console.error('Failed to create contact:', error);
    throw new Error(`Failed to create contact: ${getErrorMessage(error)}`);
  }
}

/**
 * Update a contact
 */
export async function updateContact(
  contactId: string,
  updates: Partial<ContactFormData>,
  userId?: string,
  userEmail?: string
): Promise<void> {
  try {
    const updateData: any = {
      ...updates,
      updatedAt: Timestamp.now(),
    };

    // Handle email lowercase
    if (updates.email) {
      updateData.email = updates.email.toLowerCase();
    }

    await updateDoc(doc(db, 'crmContacts', contactId), updateData);
    console.log(`✅ Updated contact ${contactId}`);

    // Log status change if applicable
    if (updates.status && userId && userEmail) {
      const contact = await getContact(contactId);
      if (contact) {
        await logActivity(
          contact.boardId,
          contactId,
          undefined,
          'status_changed',
          'Status changed',
          `Status changed to ${updates.status}`,
          userId,
          userEmail
        );
      }
    }
  } catch (error) {
    console.error('Failed to update contact:', error);
    throw new Error(`Failed to update contact: ${getErrorMessage(error)}`);
  }
}

/**
 * Delete a contact
 */
export async function deleteContact(contactId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'crmContacts', contactId));
    console.log(`✅ Deleted contact ${contactId}`);
  } catch (error) {
    console.error('Failed to delete contact:', error);
    throw new Error(`Failed to delete contact: ${getErrorMessage(error)}`);
  }
}

/**
 * Get a contact by ID
 */
export async function getContact(contactId: string): Promise<Contact | null> {
  try {
    const snapshot = await getDoc(doc(db, 'crmContacts', contactId));
    if (!snapshot.exists()) {
      return null;
    }
    return docToContact(snapshot.data() as ContactDoc);
  } catch (error) {
    console.error('Failed to get contact:', error);
    throw new Error(`Failed to get contact: ${getErrorMessage(error)}`);
  }
}

/**
 * Get all contacts for a board
 */
export async function getContacts(boardId: string): Promise<Contact[]> {
  try {
    const q = query(
      collection(db, 'crmContacts'),
      where('boardId', '==', boardId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => docToContact(doc.data() as ContactDoc));
  } catch (error) {
    console.error('Failed to get contacts:', error);
    throw new Error(`Failed to get contacts: ${getErrorMessage(error)}`);
  }
}

/**
 * Subscribe to contacts for a board
 */
export function subscribeToContacts(
  boardId: string,
  callback: (contacts: Contact[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'crmContacts'),
    where('boardId', '==', boardId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const contacts = snapshot.docs.map(doc => docToContact(doc.data() as ContactDoc));
      callback(contacts);
    },
    (error) => {
      console.error('Error in contacts subscription:', error);
      onError?.(error);
    }
  );
}

/**
 * Update contact engagement (for email tracking)
 */
export async function updateContactEngagement(
  contactId: string,
  type: 'sent' | 'opened' | 'replied'
): Promise<void> {
  try {
    const contact = await getContact(contactId);
    if (!contact) return;

    const updates: any = {
      updatedAt: Timestamp.now(),
    };

    if (type === 'sent') {
      updates.emailsSent = contact.emailsSent + 1;
      updates.lastContactedAt = Timestamp.now();
    } else if (type === 'opened') {
      updates.emailsOpened = contact.emailsOpened + 1;
    } else if (type === 'replied') {
      updates.emailsReplied = contact.emailsReplied + 1;
      updates.lastRepliedAt = Timestamp.now();
    }

    await updateDoc(doc(db, 'crmContacts', contactId), updates);
  } catch (error) {
    console.error('Failed to update contact engagement:', error);
  }
}

// ============================================
// DEAL OPERATIONS
// ============================================

/**
 * Create a new deal
 */
export async function createDeal(
  boardId: string,
  data: DealFormData,
  userId: string,
  userEmail: string
): Promise<Deal> {
  try {
    const dealId = generateDealId();
    const now = Timestamp.now();

    const dealDoc: DealDoc = {
      id: dealId,
      boardId,
      contactId: data.contactId,
      title: data.title,
      value: data.value,
      currency: data.currency,
      stageId: data.stageId,
      probability: data.probability,
      expectedCloseDate: data.expectedCloseDate ? Timestamp.fromDate(data.expectedCloseDate) : undefined,
      notes: data.notes,
      tags: data.tags,
      createdBy: userId,
      createdByEmail: userEmail.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'crmDeals', dealId), dealDoc);
    console.log(`✅ Created deal: ${data.title}`);

    // Log activity
    await logActivity(boardId, data.contactId, dealId, 'deal_created', 'Deal created', `Created deal "${data.title}" worth ${data.value} ${data.currency}`, userId, userEmail);

    return docToDeal(dealDoc);
  } catch (error) {
    console.error('Failed to create deal:', error);
    throw new Error(`Failed to create deal: ${getErrorMessage(error)}`);
  }
}

/**
 * Update a deal
 */
export async function updateDeal(
  dealId: string,
  updates: Partial<DealFormData>,
  userId?: string,
  userEmail?: string
): Promise<void> {
  try {
    const updateData: any = {
      ...updates,
      updatedAt: Timestamp.now(),
    };

    if (updates.expectedCloseDate) {
      updateData.expectedCloseDate = Timestamp.fromDate(updates.expectedCloseDate);
    }

    await updateDoc(doc(db, 'crmDeals', dealId), updateData);
    console.log(`✅ Updated deal ${dealId}`);

    // Log stage change if applicable
    if (updates.stageId && userId && userEmail) {
      const deal = await getDeal(dealId);
      if (deal) {
        await logActivity(
          deal.boardId,
          deal.contactId,
          dealId,
          'stage_changed',
          'Stage changed',
          `Deal stage changed`,
          userId,
          userEmail
        );
      }
    }
  } catch (error) {
    console.error('Failed to update deal:', error);
    throw new Error(`Failed to update deal: ${getErrorMessage(error)}`);
  }
}

/**
 * Delete a deal
 */
export async function deleteDeal(dealId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'crmDeals', dealId));
    console.log(`✅ Deleted deal ${dealId}`);
  } catch (error) {
    console.error('Failed to delete deal:', error);
    throw new Error(`Failed to delete deal: ${getErrorMessage(error)}`);
  }
}

/**
 * Get a deal by ID
 */
export async function getDeal(dealId: string): Promise<Deal | null> {
  try {
    const snapshot = await getDoc(doc(db, 'crmDeals', dealId));
    if (!snapshot.exists()) {
      return null;
    }
    return docToDeal(snapshot.data() as DealDoc);
  } catch (error) {
    console.error('Failed to get deal:', error);
    throw new Error(`Failed to get deal: ${getErrorMessage(error)}`);
  }
}

/**
 * Get all deals for a board
 */
export async function getDeals(boardId: string): Promise<Deal[]> {
  try {
    const q = query(
      collection(db, 'crmDeals'),
      where('boardId', '==', boardId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => docToDeal(doc.data() as DealDoc));
  } catch (error) {
    console.error('Failed to get deals:', error);
    throw new Error(`Failed to get deals: ${getErrorMessage(error)}`);
  }
}

/**
 * Subscribe to deals for a board
 */
export function subscribeToDeals(
  boardId: string,
  callback: (deals: Deal[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'crmDeals'),
    where('boardId', '==', boardId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const deals = snapshot.docs.map(doc => docToDeal(doc.data() as DealDoc));
      callback(deals);
    },
    (error) => {
      console.error('Error in deals subscription:', error);
      onError?.(error);
    }
  );
}

/**
 * Mark deal as won
 */
export async function markDealWon(dealId: string, userId: string, userEmail: string): Promise<void> {
  try {
    const deal = await getDeal(dealId);
    if (!deal) return;

    await updateDoc(doc(db, 'crmDeals', dealId), {
      actualCloseDate: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    await logActivity(deal.boardId, deal.contactId, dealId, 'deal_won', 'Deal won', `Deal "${deal.title}" marked as won`, userId, userEmail);
  } catch (error) {
    console.error('Failed to mark deal as won:', error);
    throw new Error(`Failed to mark deal as won: ${getErrorMessage(error)}`);
  }
}

/**
 * Mark deal as lost
 */
export async function markDealLost(dealId: string, userId: string, userEmail: string): Promise<void> {
  try {
    const deal = await getDeal(dealId);
    if (!deal) return;

    await updateDoc(doc(db, 'crmDeals', dealId), {
      actualCloseDate: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    await logActivity(deal.boardId, deal.contactId, dealId, 'deal_lost', 'Deal lost', `Deal "${deal.title}" marked as lost`, userId, userEmail);
  } catch (error) {
    console.error('Failed to mark deal as lost:', error);
    throw new Error(`Failed to mark deal as lost: ${getErrorMessage(error)}`);
  }
}

// ============================================
// ACTIVITY OPERATIONS
// ============================================

/**
 * Log an activity
 */
export async function logActivity(
  boardId: string,
  contactId: string | undefined,
  dealId: string | undefined,
  type: ActivityType,
  title: string,
  description: string,
  userId: string,
  userEmail: string
): Promise<Activity> {
  try {
    const activityId = generateActivityId();
    const now = Timestamp.now();

    const activityDoc: ActivityDoc = {
      id: activityId,
      boardId,
      ...(contactId ? { contactId } : {}),
      ...(dealId ? { dealId } : {}),
      type,
      title,
      description,
      performedBy: userId,
      performedByEmail: userEmail.toLowerCase(),
      timestamp: now,
    };

    await setDoc(doc(db, 'crmActivities', activityId), activityDoc);
    return docToActivity(activityDoc);
  } catch (error) {
    console.error('Failed to log activity:', error);
    throw new Error(`Failed to log activity: ${getErrorMessage(error)}`);
  }
}

/**
 * Get activities for a contact
 */
export async function getContactActivities(contactId: string): Promise<Activity[]> {
  try {
    const q = query(
      collection(db, 'crmActivities'),
      where('contactId', '==', contactId),
      orderBy('timestamp', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => docToActivity(doc.data() as ActivityDoc));
  } catch (error) {
    console.error('Failed to get contact activities:', error);
    throw new Error(`Failed to get contact activities: ${getErrorMessage(error)}`);
  }
}

/**
 * Subscribe to activities for a board
 */
export function subscribeToActivities(
  boardId: string,
  callback: (activities: Activity[]) => void,
  onError?: (error: Error) => void,
  limit: number = 50
): Unsubscribe {
  const q = query(
    collection(db, 'crmActivities'),
    where('boardId', '==', boardId),
    orderBy('timestamp', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const activities = snapshot.docs
        .slice(0, limit)
        .map(doc => docToActivity(doc.data() as ActivityDoc));
      callback(activities);
    },
    (error) => {
      console.error('Error in activities subscription:', error);
      onError?.(error);
    }
  );
}

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * Import contacts from CSV data
 */
export async function importContacts(
  boardId: string,
  contacts: ContactFormData[],
  userId: string,
  userEmail: string
): Promise<number> {
  try {
    const batch = writeBatch(db);
    const now = Timestamp.now();
    let count = 0;

    for (const data of contacts) {
      const contactId = generateContactId();
      const contactDoc: ContactDoc = {
        id: contactId,
        boardId,
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone,
        company: data.company,
        position: data.position,
        status: data.status,
        tags: data.tags,
        source: data.source || 'import',
        notes: data.notes,
        customFields: data.customFields,
        emailsSent: 0,
        emailsOpened: 0,
        emailsReplied: 0,
        createdBy: userId,
        createdByEmail: userEmail.toLowerCase(),
        createdAt: now,
        updatedAt: now,
      };

      batch.set(doc(db, 'crmContacts', contactId), contactDoc);
      count++;

      // Firestore batch limit is 500
      if (count % 500 === 0) {
        await batch.commit();
      }
    }

    await batch.commit();
    console.log(`✅ Imported ${count} contacts`);
    return count;
  } catch (error) {
    console.error('Failed to import contacts:', error);
    throw new Error(`Failed to import contacts: ${getErrorMessage(error)}`);
  }
}

/**
 * Export contacts to CSV-ready format
 */
export async function exportContacts(boardId: string): Promise<any[]> {
  try {
    const contacts = await getContacts(boardId);
    return contacts.map(contact => ({
      Name: contact.name,
      Email: contact.email,
      Phone: contact.phone,
      Company: contact.company,
      Position: contact.position,
      Status: contact.status,
      Tags: contact.tags.join(', '),
      Source: contact.source,
      Notes: contact.notes,
      'Emails Sent': contact.emailsSent,
      'Emails Opened': contact.emailsOpened,
      'Emails Replied': contact.emailsReplied,
      'Created At': contact.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error('Failed to export contacts:', error);
    throw new Error(`Failed to export contacts: ${getErrorMessage(error)}`);
  }
}

// ============================================
// COMPANY OPERATIONS
// ============================================

/**
 * Create a new company
 */
export async function createCompany(
  boardId: string,
  data: CompanyFormData,
  userId: string,
  userEmail: string
): Promise<Company> {
  try {
    const companyId = generateCompanyId();
    const now = Timestamp.now();

    const companyDoc: CompanyDoc = {
      id: companyId,
      boardId,
      name: data.name,
      website: data.website,
      industry: data.industry,
      size: data.size,
      revenue: data.revenue,
      location: data.location,
      phone: data.phone,
      email: data.email.toLowerCase(),
      address: data.address,
      status: data.status,
      tags: data.tags,
      notes: data.notes,
      createdBy: userId,
      createdByEmail: userEmail.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'crmCompanies', companyId), companyDoc);
    console.log(`✅ Created company: ${data.name}`);

    return docToCompany(companyDoc);
  } catch (error) {
    console.error('Failed to create company:', error);
    throw new Error(`Failed to create company: ${getErrorMessage(error)}`);
  }
}

/**
 * Update a company
 */
export async function updateCompany(
  companyId: string,
  updates: Partial<CompanyFormData>
): Promise<void> {
  try {
    const updateData: any = {
      ...updates,
      updatedAt: Timestamp.now(),
    };

    // Handle email lowercase
    if (updates.email) {
      updateData.email = updates.email.toLowerCase();
    }

    await updateDoc(doc(db, 'crmCompanies', companyId), updateData);
    console.log(`✅ Updated company ${companyId}`);
  } catch (error) {
    console.error('Failed to update company:', error);
    throw new Error(`Failed to update company: ${getErrorMessage(error)}`);
  }
}

/**
 * Delete a company
 */
export async function deleteCompany(companyId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'crmCompanies', companyId));
    console.log(`✅ Deleted company ${companyId}`);
  } catch (error) {
    console.error('Failed to delete company:', error);
    throw new Error(`Failed to delete company: ${getErrorMessage(error)}`);
  }
}

/**
 * Get a company by ID
 */
export async function getCompany(companyId: string): Promise<Company | null> {
  try {
    const snapshot = await getDoc(doc(db, 'crmCompanies', companyId));
    if (!snapshot.exists()) {
      return null;
    }
    return docToCompany(snapshot.data() as CompanyDoc);
  } catch (error) {
    console.error('Failed to get company:', error);
    throw new Error(`Failed to get company: ${getErrorMessage(error)}`);
  }
}

/**
 * Get all companies for a board
 */
export async function getCompanies(boardId: string): Promise<Company[]> {
  try {
    const q = query(
      collection(db, 'crmCompanies'),
      where('boardId', '==', boardId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => docToCompany(doc.data() as CompanyDoc));
  } catch (error) {
    console.error('Failed to get companies:', error);
    throw new Error(`Failed to get companies: ${getErrorMessage(error)}`);
  }
}

/**
 * Subscribe to companies for a board
 */
export function subscribeToCompanies(
  boardId: string,
  callback: (companies: Company[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'crmCompanies'),
    where('boardId', '==', boardId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const companies = snapshot.docs.map(doc => docToCompany(doc.data() as CompanyDoc));
      callback(companies);
    },
    (error) => {
      console.error('Error in companies subscription:', error);
      onError?.(error);
    }
  );
}

/**
 * Get contacts for a company
 */
export async function getCompanyContacts(companyId: string): Promise<Contact[]> {
  try {
    const q = query(
      collection(db, 'crmContacts'),
      where('companyId', '==', companyId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => docToContact(doc.data() as ContactDoc));
  } catch (error) {
    console.error('Failed to get company contacts:', error);
    throw new Error(`Failed to get company contacts: ${getErrorMessage(error)}`);
  }
}

/**
 * Get deals for a company
 */
export async function getCompanyDeals(companyId: string): Promise<Deal[]> {
  try {
    const q = query(
      collection(db, 'crmDeals'),
      where('companyId', '==', companyId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => docToDeal(doc.data() as DealDoc));
  } catch (error) {
    console.error('Failed to get company deals:', error);
    throw new Error(`Failed to get company deals: ${getErrorMessage(error)}`);
  }
}

/**
 * Import companies from CSV data
 */
export async function importCompanies(
  boardId: string,
  companies: CompanyFormData[],
  userId: string,
  userEmail: string
): Promise<number> {
  try {
    const batch = writeBatch(db);
    const now = Timestamp.now();
    let count = 0;

    for (const data of companies) {
      const companyId = generateCompanyId();
      const companyDoc: CompanyDoc = {
        id: companyId,
        boardId,
        name: data.name,
        website: data.website,
        industry: data.industry,
        size: data.size,
        revenue: data.revenue,
        location: data.location,
        phone: data.phone,
        email: data.email.toLowerCase(),
        address: data.address,
        status: data.status || 'prospect',
        tags: data.tags || [],
        notes: data.notes || '',
        createdBy: userId,
        createdByEmail: userEmail.toLowerCase(),
        createdAt: now,
        updatedAt: now,
      };

      batch.set(doc(db, 'crmCompanies', companyId), companyDoc);
      count++;

      // Firestore batch limit is 500
      if (count % 500 === 0) {
        await batch.commit();
      }
    }

    await batch.commit();
    console.log(`✅ Imported ${count} companies`);
    return count;
  } catch (error) {
    console.error('Failed to import companies:', error);
    throw new Error(`Failed to import companies: ${getErrorMessage(error)}`);
  }
}
