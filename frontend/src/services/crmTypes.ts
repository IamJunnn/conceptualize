/**
 * CRM Types
 * Data models for the CRM feature with automation-ready structure
 */

// Contact status options
export type ContactStatus = 'lead' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost' | 'churned';

export const CONTACT_STATUSES: { value: ContactStatus; label: string; color: string }[] = [
  { value: 'lead', label: 'Lead', color: '#6366f1' },
  { value: 'contacted', label: 'Contacted', color: '#8b5cf6' },
  { value: 'qualified', label: 'Qualified', color: '#06b6d4' },
  { value: 'proposal', label: 'Proposal', color: '#f59e0b' },
  { value: 'negotiation', label: 'Negotiation', color: '#f97316' },
  { value: 'won', label: 'Won', color: '#10b981' },
  { value: 'lost', label: 'Lost', color: '#ef4444' },
  { value: 'churned', label: 'Churned', color: '#6b7280' },
];

// CRM Board (Personal or Team)
export interface CRMBoard {
  id: string;
  name: string;
  type: 'personal' | 'team';
  teamId?: string;
  ownerId: string;
  ownerEmail: string;

  // Custom fields configuration
  customFields: CustomField[];

  // Pipeline stages (customizable)
  pipelineStages: PipelineStage[];

  createdAt: Date;
  updatedAt: Date;
}

// Custom field definition
export interface CustomField {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'email' | 'phone' | 'url';
  options?: string[]; // For select/multiselect
  required?: boolean;
  order: number;
}

// Pipeline stage
export interface PipelineStage {
  id: string;
  name: string;
  color: string;
  order: number;
}

// Default pipeline stages
export const DEFAULT_PIPELINE_STAGES: Omit<PipelineStage, 'id'>[] = [
  { name: 'Lead', color: '#6366f1', order: 0 },
  { name: 'Contacted', color: '#8b5cf6', order: 1 },
  { name: 'Qualified', color: '#06b6d4', order: 2 },
  { name: 'Proposal', color: '#f59e0b', order: 3 },
  { name: 'Negotiation', color: '#f97316', order: 4 },
  { name: 'Won', color: '#10b981', order: 5 },
  { name: 'Lost', color: '#ef4444', order: 6 },
];

// Company size options
export type CompanySize = '1-10' | '11-50' | '51-200' | '201-500' | '500+';

export const COMPANY_SIZES: { value: CompanySize; label: string }[] = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '500+', label: '500+ employees' },
];

// Company status options
export type CompanyStatus = 'prospect' | 'active' | 'inactive' | 'churned';

export const COMPANY_STATUSES: { value: CompanyStatus; label: string; color: string }[] = [
  { value: 'prospect', label: 'Prospect', color: '#6366f1' },
  { value: 'active', label: 'Active', color: '#10b981' },
  { value: 'inactive', label: 'Inactive', color: '#f59e0b' },
  { value: 'churned', label: 'Churned', color: '#6b7280' },
];

// Industry options
export const INDUSTRIES = [
  'Technology',
  'Software/SaaS',
  'Healthcare',
  'Finance',
  'Real Estate',
  'E-commerce',
  'Marketing/Advertising',
  'Consulting',
  'Manufacturing',
  'Education',
  'Retail',
  'Media/Entertainment',
  'Non-profit',
  'Other',
];

// Company record
export interface Company {
  id: string;
  boardId: string;

  // Core Info
  name: string;
  website: string;
  industry: string;

  // Details
  size: CompanySize;
  revenue: string;
  location: string;

  // Contact Info
  phone: string;
  email: string;
  address: string;

  // CRM Data
  status: CompanyStatus;
  tags: string[];
  notes: string;

  // Metadata
  createdBy: string;
  createdByEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

// Contact record
export interface Contact {
  id: string;
  boardId: string;
  companyId?: string; // Link to Company

  // Core fields
  name: string;
  email: string;
  phone: string;
  company: string; // Keep for backwards compatibility / display
  position: string;

  // Status & Pipeline
  status: ContactStatus;
  pipelineStageId?: string;

  // Categorization
  tags: string[];
  source: string; // Where the contact came from

  // Custom field values
  customFields: Record<string, any>;

  // Engagement tracking (for future automation)
  lastContactedAt?: Date;
  lastRepliedAt?: Date;
  emailsSent: number;
  emailsOpened: number;
  emailsReplied: number;

  // Assignment
  assignedTo?: string; // User ID
  assignedToEmail?: string;

  // Notes
  notes: string;

  // Metadata
  createdBy: string;
  createdByEmail: string;
  createdAt: Date;
  updatedAt: Date;

  // Future automation data
  automationData?: {
    activeSequences: string[];
    nextActionAt?: Date;
    pausedUntil?: Date;
  };
}

// Deal/Opportunity
export interface Deal {
  id: string;
  boardId: string;
  contactId?: string;

  title: string;
  value: number;
  currency: string;

  stageId: string;
  probability: number; // 0-100

  expectedCloseDate?: Date;
  actualCloseDate?: Date;

  assignedTo?: string;
  assignedToEmail?: string;

  notes: string;
  tags: string[];

  createdBy: string;
  createdByEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

// Activity log entry (for tracking & automation triggers)
export interface Activity {
  id: string;
  boardId: string;
  contactId?: string;
  dealId?: string;

  type: ActivityType;
  title: string;
  description: string;

  // Email-specific data
  emailData?: {
    subject: string;
    body: string;
    threadId?: string;
    messageId?: string;
    opened?: boolean;
    openedAt?: Date;
    replied?: boolean;
    repliedAt?: Date;
  };

  performedBy: string;
  performedByEmail: string;
  timestamp: Date;
}

export type ActivityType =
  | 'email_sent'
  | 'email_opened'
  | 'email_replied'
  | 'email_bounced'
  | 'call_made'
  | 'call_received'
  | 'meeting_scheduled'
  | 'meeting_completed'
  | 'note_added'
  | 'stage_changed'
  | 'status_changed'
  | 'deal_created'
  | 'deal_won'
  | 'deal_lost'
  | 'task_created'
  | 'task_completed';

// Firestore document structures
export interface CRMBoardDoc extends Omit<CRMBoard, 'createdAt' | 'updatedAt'> {
  createdAt: { seconds: number; nanoseconds: number } | Date;
  updatedAt: { seconds: number; nanoseconds: number } | Date;
}

export interface ContactDoc extends Omit<Contact, 'createdAt' | 'updatedAt' | 'lastContactedAt' | 'lastRepliedAt'> {
  createdAt: { seconds: number; nanoseconds: number } | Date;
  updatedAt: { seconds: number; nanoseconds: number } | Date;
  lastContactedAt?: { seconds: number; nanoseconds: number } | Date;
  lastRepliedAt?: { seconds: number; nanoseconds: number } | Date;
}

export interface DealDoc extends Omit<Deal, 'createdAt' | 'updatedAt' | 'expectedCloseDate' | 'actualCloseDate'> {
  createdAt: { seconds: number; nanoseconds: number } | Date;
  updatedAt: { seconds: number; nanoseconds: number } | Date;
  expectedCloseDate?: { seconds: number; nanoseconds: number } | Date;
  actualCloseDate?: { seconds: number; nanoseconds: number } | Date;
}

export interface ActivityDoc extends Omit<Activity, 'timestamp'> {
  timestamp: { seconds: number; nanoseconds: number } | Date;
}

export interface CompanyDoc extends Omit<Company, 'createdAt' | 'updatedAt'> {
  createdAt: { seconds: number; nanoseconds: number } | Date;
  updatedAt: { seconds: number; nanoseconds: number } | Date;
}

// Helper functions
export function firestoreTimestampToDate(
  timestamp: { seconds: number; nanoseconds: number } | Date | undefined
): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return new Date(timestamp.seconds * 1000);
}

export function docToContact(doc: ContactDoc): Contact {
  return {
    ...doc,
    createdAt: firestoreTimestampToDate(doc.createdAt) || new Date(),
    updatedAt: firestoreTimestampToDate(doc.updatedAt) || new Date(),
    lastContactedAt: firestoreTimestampToDate(doc.lastContactedAt),
    lastRepliedAt: firestoreTimestampToDate(doc.lastRepliedAt),
  };
}

export function docToBoard(doc: CRMBoardDoc): CRMBoard {
  return {
    ...doc,
    createdAt: firestoreTimestampToDate(doc.createdAt) || new Date(),
    updatedAt: firestoreTimestampToDate(doc.updatedAt) || new Date(),
  };
}

export function docToDeal(doc: DealDoc): Deal {
  return {
    ...doc,
    createdAt: firestoreTimestampToDate(doc.createdAt) || new Date(),
    updatedAt: firestoreTimestampToDate(doc.updatedAt) || new Date(),
    expectedCloseDate: firestoreTimestampToDate(doc.expectedCloseDate),
    actualCloseDate: firestoreTimestampToDate(doc.actualCloseDate),
  };
}

export function docToActivity(doc: ActivityDoc): Activity {
  return {
    ...doc,
    timestamp: firestoreTimestampToDate(doc.timestamp) || new Date(),
  };
}

export function docToCompany(doc: CompanyDoc): Company {
  return {
    ...doc,
    createdAt: firestoreTimestampToDate(doc.createdAt) || new Date(),
    updatedAt: firestoreTimestampToDate(doc.updatedAt) || new Date(),
  };
}

// Form data types
export interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  company: string;
  companyId?: string; // Link to Company entity
  position: string;
  status: ContactStatus;
  tags: string[];
  source: string;
  notes: string;
  customFields: Record<string, any>;
}

export interface DealFormData {
  title: string;
  contactId?: string;
  companyId?: string;
  value: number;
  currency: string;
  stageId: string;
  probability: number;
  expectedCloseDate?: Date;
  notes: string;
  tags: string[];
}

export interface CompanyFormData {
  name: string;
  website: string;
  industry: string;
  size: CompanySize;
  revenue: string;
  location: string;
  phone: string;
  email: string;
  address: string;
  status: CompanyStatus;
  tags: string[];
  notes: string;
}

// Generate unique IDs
export function generateContactId(): string {
  return `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateBoardId(): string {
  return `board_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateDealId(): string {
  return `deal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateActivityId(): string {
  return `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateStageId(): string {
  return `stage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateFieldId(): string {
  return `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateCompanyId(): string {
  return `company_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
