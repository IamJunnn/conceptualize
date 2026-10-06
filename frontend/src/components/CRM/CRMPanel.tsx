/**
 * CRM Panel Component
 * Main panel for managing CRM contacts, deals, and activities
 */

import { useState, useEffect, useCallback, useMemo, useId } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  Plus,
  Search,
  Filter,
  Pencil,
  Trash2,
  X,
  Mail,
  Phone,
  User,
  RefreshCw,
  Upload,
  GripVertical,
  Building2,
  Users,
  DollarSign,
  TableProperties,
  SquareKanban,
  Globe,
} from 'lucide-react';
import { confirm } from '@tauri-apps/plugin-dialog';
import CSVImportModal from './CSVImportModal';
import CompaniesView from './CompaniesView';
import LeadFinder from './LeadFinder';
import {
  Contact,
  ContactFormData,
  Company,
  CRMBoard,
  CONTACT_STATUSES,
  ContactStatus,
} from '../../services/crmTypes';
import {
  getOrCreatePersonalBoard,
  getOrCreateTeamBoard,
  subscribeToContacts,
  subscribeToCompanies,
  createContact,
  updateContact,
  deleteContact,
  importContacts,
} from '../../services/crmService';
import './CRMPanel.css';

interface CRMPanelProps {
  userId: string;
  userEmail: string;
  teamId?: string;
  teamName?: string;
  boardId?: string | null; // Active board ID from sidebar
  boardName?: string; // Active board name from sidebar
}

type ViewMode = 'table' | 'pipeline';
type CRMTab = 'contacts' | 'companies' | 'deals';

export default function CRMPanel({
  userId,
  userEmail,
  teamId,
  teamName,
  boardId,
  boardName,
}: CRMPanelProps) {
  // State
  const [board, setBoard] = useState<CRMBoard | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<CRMTab>('contacts');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContactStatus | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showLeadFinder, setShowLeadFinder] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());

  // Board type
  const isTeamBoard = !!teamId;

  // Create default board if no boardId provided
  useEffect(() => {
    const createDefaultBoard = async () => {
      if (!boardId) {
        try {
          const defaultBoard = isTeamBoard
            ? await getOrCreateTeamBoard(teamId!, teamName || 'Team', userId, userEmail)
            : await getOrCreatePersonalBoard(userId, userEmail);
          setBoard(defaultBoard);
        } catch (err) {
          console.error('Failed to create default board:', err);
        }
      }
    };
    createDefaultBoard();
  }, [boardId, isTeamBoard, teamId, teamName, userId, userEmail]);

  // Load contacts and companies when boardId changes
  useEffect(() => {
    const activeBoardId = boardId || board?.id;
    if (!activeBoardId) {
      setContacts([]);
      setCompanies([]);
      setLoading(false);
      return;
    }

    let unsubscribeContacts: (() => void) | null = null;
    let unsubscribeCompanies: (() => void) | null = null;

    setLoading(true);
    setError(null);

    // Subscribe to contacts
    unsubscribeContacts = subscribeToContacts(
      activeBoardId,
      (loadedContacts) => {
        setContacts(loadedContacts);
        setLoading(false);
        setError(null); // Clear any previous error on successful load
      },
      (err) => {
        console.error('Failed to load contacts:', err);
        // Don't show error for permission-denied (often means no data yet)
        // Just show empty state instead
        setContacts([]);
        setLoading(false);
      }
    );

    // Subscribe to companies
    unsubscribeCompanies = subscribeToCompanies(
      activeBoardId,
      (loadedCompanies) => {
        setCompanies(loadedCompanies);
      },
      (err) => {
        console.error('Failed to load companies:', err);
      }
    );

    return () => {
      if (unsubscribeContacts) unsubscribeContacts();
      if (unsubscribeCompanies) unsubscribeCompanies();
    };
  }, [boardId, board?.id]);

  // Filter contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          contact.name.toLowerCase().includes(query) ||
          contact.email.toLowerCase().includes(query) ||
          contact.company.toLowerCase().includes(query) ||
          contact.phone.includes(query);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter !== 'all' && contact.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [contacts, searchQuery, statusFilter]);

  // Handlers
  const handleAddContact = useCallback(
    async (data: ContactFormData) => {
      const activeBoardId = boardId || board?.id;
      if (!activeBoardId) return;

      try {
        await createContact(activeBoardId, data, userId, userEmail);
        setShowAddModal(false);
      } catch (err) {
        console.error('Failed to create contact:', err);
        setError('Failed to create contact');
      }
    },
    [boardId, board, userId, userEmail]
  );

  const handleUpdateContact = useCallback(
    async (contactId: string, data: Partial<ContactFormData>) => {
      try {
        await updateContact(contactId, data, userId, userEmail);
        setEditingContact(null);
      } catch (err) {
        console.error('Failed to update contact:', err);
        setError('Failed to update contact');
      }
    },
    [userId, userEmail]
  );

  const handleDeleteContact = useCallback(async (contactId: string) => {
    const confirmed = await confirm('Are you sure you want to delete this contact?');
    if (!confirmed) return;

    try {
      await deleteContact(contactId);
    } catch (err) {
      console.error('Failed to delete contact:', err);
      setError('Failed to delete contact');
    }
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedContacts.size === filteredContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(filteredContacts.map((c) => c.id)));
    }
  }, [filteredContacts, selectedContacts.size]);

  const handleSelectContact = useCallback((contactId: string) => {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  }, []);

  // Import contacts from CSV
  const handleCSVImport = useCallback(async (contacts: ContactFormData[]) => {
    const activeBoardId = boardId || board?.id;
    if (!activeBoardId) return 0;

    const count = await importContacts(activeBoardId, contacts, userId, userEmail);
    return count;
  }, [boardId, board, userId, userEmail]);

  // Import leads from Lead Finder
  const handleLeadFinderImport = useCallback(async (leads: {
    name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    position: string | null;
    source_url: string;
  }[]) => {
    const activeBoardId = boardId || board?.id;
    if (!activeBoardId) return;

    // Convert scraped leads to ContactFormData
    const contacts: ContactFormData[] = leads
      .filter(lead => lead.email) // Only import leads with email
      .map(lead => ({
        name: lead.name || lead.email?.split('@')[0].replace(/[._-]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Unknown',
        email: lead.email || '',
        phone: lead.phone || '',
        company: lead.company || '',
        companyId: '',
        position: lead.position || '',
        status: 'lead' as ContactStatus,
        tags: [],
        source: lead.source_url,
        notes: '',
        customFields: {},
      }));

    if (contacts.length > 0) {
      await importContacts(activeBoardId, contacts, userId, userEmail);
    }

    setShowLeadFinder(false);
  }, [boardId, board, userId, userEmail]);

  // Render loading
  if (loading) {
    return (
      <div className="crm-panel">
        <div className="crm-loading">
          <RefreshCw className="spinning" size={24} />
          <span>Loading CRM...</span>
        </div>
      </div>
    );
  }

  // Get the active board ID
  const activeBoardId = boardId || board?.id;

  return (
    <div className="crm-panel">
      {/* Header */}
      <div className="crm-header">
        <div className="crm-header-left">
          <h2>{boardName || board?.name || 'CRM'}</h2>

          {/* CRM Tabs */}
          <div className="crm-tabs">
            <button
              className={`crm-tab ${activeTab === 'contacts' ? 'active' : ''}`}
              onClick={() => setActiveTab('contacts')}
            >
              <Users size={16} />
              <span className="tab-label">Contacts</span>
              <span className="tab-count">{contacts.length}</span>
            </button>
            <button
              className={`crm-tab ${activeTab === 'companies' ? 'active' : ''}`}
              onClick={() => setActiveTab('companies')}
            >
              <Building2 size={16} />
              <span className="tab-label">Companies</span>
              <span className="tab-count">{companies.length}</span>
            </button>
            <button
              className={`crm-tab ${activeTab === 'deals' ? 'active' : ''}`}
              onClick={() => setActiveTab('deals')}
            >
              <DollarSign size={16} />
              <span className="tab-label">Deals</span>
              <span className="tab-count">0</span>
            </button>
          </div>
        </div>

        <div className="crm-header-right">
          {/* View Mode Toggle (only for contacts) */}
          {activeTab === 'contacts' && (
            <div className="view-toggle">
              <button
                className={viewMode === 'table' ? 'active' : ''}
                onClick={() => setViewMode('table')}
              >
                <TableProperties size={14} />
                Table
              </button>
              <button
                className={viewMode === 'pipeline' ? 'active' : ''}
                onClick={() => setViewMode('pipeline')}
              >
                <SquareKanban size={14} />
                Pipeline
              </button>
            </div>
          )}

          {/* Find Leads Button */}
          <button
            className="crm-icon-btn"
            onClick={() => setShowLeadFinder(true)}
            title="Find Leads from Website"
          >
            <Globe size={18} />
          </button>

          {/* Import CSV Button - Icon only */}
          <button
            className="crm-icon-btn"
            onClick={() => setShowCSVImport(true)}
            title="Import CSV"
          >
            <Upload size={18} />
          </button>

          {/* Add Button - Icon only */}
          <button
            className="crm-icon-btn primary"
            onClick={() => setShowAddModal(true)}
            title={activeTab === 'contacts' ? 'Add Contact' : activeTab === 'companies' ? 'Add Company' : 'Add Deal'}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Toolbar (only for contacts tab) */}
      {activeTab === 'contacts' && (
        <div className="crm-toolbar">
          {/* Search */}
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search" onClick={() => setSearchQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="status-filter">
            <Filter size={16} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ContactStatus | 'all')}
            >
              <option value="all">All Statuses</option>
              {CONTACT_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>

          {/* Bulk Actions */}
          {selectedContacts.size > 0 && (
            <div className="bulk-actions">
              <span>{selectedContacts.size} selected</span>
              <button
                className="bulk-delete"
                onClick={async () => {
                  const confirmed = await confirm(`Delete ${selectedContacts.size} contacts?`);
                  if (confirmed) {
                    selectedContacts.forEach((id) => deleteContact(id));
                    setSelectedContacts(new Set());
                  }
                }}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Content */}
      <div className="crm-content">
        {/* Contacts Tab */}
        {activeTab === 'contacts' && (
          viewMode === 'table' ? (
            <ContactsTable
              contacts={filteredContacts}
              selectedContacts={selectedContacts}
              onSelectAll={handleSelectAll}
              onSelectContact={handleSelectContact}
              onEdit={setEditingContact}
              onDelete={handleDeleteContact}
              onStatusChange={(contactId, status) =>
                handleUpdateContact(contactId, { status })
              }
            />
          ) : (
            <PipelineView
              contacts={filteredContacts}
              stages={board?.pipelineStages || []}
              onContactClick={setEditingContact}
              onStatusChange={(contactId, status) =>
                handleUpdateContact(contactId, { status })
              }
            />
          )
        )}

        {/* Companies Tab */}
        {activeTab === 'companies' && activeBoardId && (
          <CompaniesView
            companies={companies}
            contacts={contacts}
            boardId={activeBoardId}
            userId={userId}
            userEmail={userEmail}
          />
        )}

        {/* Deals Tab (placeholder) */}
        {activeTab === 'deals' && (
          <div className="empty-state">
            <DollarSign size={48} />
            <h3>Deals coming soon</h3>
            <p>Track your deals and opportunities</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingContact) && (
        <ContactModal
          contact={editingContact}
          companies={companies}
          onSave={
            editingContact
              ? (data) => handleUpdateContact(editingContact.id, data)
              : handleAddContact
          }
          onClose={() => {
            setShowAddModal(false);
            setEditingContact(null);
          }}
          onDelete={
            editingContact ? () => handleDeleteContact(editingContact.id) : undefined
          }
        />
      )}

      {/* CSV Import Modal */}
      {showCSVImport && (
        <CSVImportModal
          onImport={handleCSVImport}
          onClose={() => setShowCSVImport(false)}
        />
      )}

      {/* Lead Finder Modal */}
      {showLeadFinder && (
        <LeadFinder
          onImport={handleLeadFinderImport}
          onClose={() => setShowLeadFinder(false)}
        />
      )}
    </div>
  );
}

// Contacts Table Component
interface ContactsTableProps {
  contacts: Contact[];
  selectedContacts: Set<string>;
  onSelectAll: () => void;
  onSelectContact: (id: string) => void;
  onEdit: (contact: Contact) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: ContactStatus) => void;
}

function ContactsTable({
  contacts,
  selectedContacts,
  onSelectAll,
  onSelectContact,
  onEdit,
  onDelete,
  onStatusChange,
}: ContactsTableProps) {
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const handleCopyEmail = async (email: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail(null), 2000);
    } catch (err) {
      console.error('Failed to copy email:', err);
    }
  };

  if (contacts.length === 0) {
    return (
      <div className="empty-state">
        <User size={48} />
        <h3>No contacts yet</h3>
        <p>Add your first contact to get started</p>
      </div>
    );
  }

  return (
    <div className="contacts-table-wrapper">
      <table className="contacts-table">
        <thead>
          <tr>
            <th className="checkbox-col">
              <input
                type="checkbox"
                checked={selectedContacts.size === contacts.length && contacts.length > 0}
                onChange={onSelectAll}
              />
            </th>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Company</th>
            <th>Status</th>
            <th className="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => (
            <tr
              key={contact.id}
              className={selectedContacts.has(contact.id) ? 'selected' : ''}
            >
              <td className="checkbox-col">
                <input
                  type="checkbox"
                  checked={selectedContacts.has(contact.id)}
                  onChange={() => onSelectContact(contact.id)}
                />
              </td>
              <td className="name-col">
                <div className="contact-name" onClick={() => onEdit(contact)}>
                  <div className="avatar">
                    {contact.name.charAt(0).toUpperCase()}
                  </div>
                  <span>{contact.name}</span>
                </div>
              </td>
              <td>
                <span
                  className={`email-cell ${copiedEmail === contact.email ? 'copied' : ''}`}
                  onClick={(e) => handleCopyEmail(contact.email, e)}
                  title="Click to copy email"
                >
                  {copiedEmail === contact.email ? 'Copied!' : contact.email}
                </span>
              </td>
              <td>{contact.phone || '-'}</td>
              <td>{contact.company || '-'}</td>
              <td>
                <select
                  className="status-select"
                  value={contact.status}
                  onChange={(e) =>
                    onStatusChange(contact.id, e.target.value as ContactStatus)
                  }
                  style={{
                    backgroundColor:
                      CONTACT_STATUSES.find((s) => s.value === contact.status)?.color +
                      '20',
                    color: CONTACT_STATUSES.find((s) => s.value === contact.status)
                      ?.color,
                  }}
                >
                  {CONTACT_STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="actions-col">
                <button className="action-btn" onClick={() => onEdit(contact)}>
                  <Pencil size={14} />
                </button>
                <button
                  className="action-btn delete"
                  onClick={() => onDelete(contact.id)}
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Pipeline View Component (Kanban) with Drag-and-Drop
interface PipelineViewProps {
  contacts: Contact[];
  stages: { id: string; name: string; color: string }[];
  onContactClick: (contact: Contact) => void;
  onStatusChange: (contactId: string, status: ContactStatus) => void;
}

function PipelineView({
  contacts,
  onContactClick,
  onStatusChange,
}: PipelineViewProps) {
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const dndId = useId();

  // Configure sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag
      },
    })
  );

  // Group contacts by status
  const contactsByStatus = useMemo(() => {
    const grouped: Record<string, Contact[]> = {};
    CONTACT_STATUSES.forEach((status) => {
      grouped[status.value] = contacts.filter((c) => c.status === status.value);
    });
    return grouped;
  }, [contacts]);

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const contactId = active.id as string;
    const contact = contacts.find((c) => c.id === contactId);
    setActiveContact(contact || null);
  }, [contacts]);

  // Handle drag end
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveContact(null);

    if (!over) return;

    const contactId = active.id as string;
    const newStatus = over.id as ContactStatus;
    const contact = contacts.find((c) => c.id === contactId);

    // Only update if status changed
    if (contact && contact.status !== newStatus) {
      onStatusChange(contactId, newStatus);
    }
  }, [contacts, onStatusChange]);

  // Use only 7 statuses (exclude 'churned')
  const displayStatuses = CONTACT_STATUSES.slice(0, -1);

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="pipeline-view">
        {displayStatuses.map((status) => (
          <PipelineColumn
            key={status.value}
            status={status}
            contacts={contactsByStatus[status.value] || []}
            onContactClick={onContactClick}
          />
        ))}
      </div>

      {/* Drag Overlay - shows the card being dragged */}
      <DragOverlay>
        {activeContact ? (
          <div className="pipeline-card dragging">
            <div className="card-header">
              <div className="avatar">{activeContact.name.charAt(0).toUpperCase()}</div>
              <div className="card-info">
                <span className="card-name">{activeContact.name}</span>
                <span className="card-company">{activeContact.company || '-'}</span>
              </div>
            </div>
            {activeContact.email && (
              <div className="card-detail">
                <Mail size={12} />
                <span>{activeContact.email}</span>
              </div>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// Pipeline Column (Droppable)
interface PipelineColumnProps {
  status: { value: ContactStatus; label: string; color: string };
  contacts: Contact[];
  onContactClick: (contact: Contact) => void;
}

function PipelineColumn({ status, contacts, onContactClick }: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status.value,
  });

  return (
    <div
      ref={setNodeRef}
      className={`pipeline-column ${isOver ? 'drag-over' : ''}`}
    >
      <div
        className="pipeline-header"
        style={{ borderTopColor: status.color }}
      >
        <span className="stage-name">{status.label}</span>
        <span className="stage-count">{contacts.length}</span>
      </div>
      <div className="pipeline-cards">
        {contacts.map((contact) => (
          <DraggableCard
            key={contact.id}
            contact={contact}
            onClick={() => onContactClick(contact)}
          />
        ))}
      </div>
    </div>
  );
}

// Draggable Contact Card
interface DraggableCardProps {
  contact: Contact;
  onClick: () => void;
}

function DraggableCard({ contact, onClick }: DraggableCardProps) {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: contact.id,
  });

  const handleCopyEmail = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(contact.email);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch (err) {
      console.error('Failed to copy email:', err);
    }
  };

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`pipeline-card ${isDragging ? 'is-dragging' : ''}`}
      onClick={onClick}
    >
      <div className="card-drag-handle" {...listeners} {...attributes}>
        <GripVertical size={14} />
      </div>
      <div className="card-content">
        <div className="card-header">
          <div className="avatar">{contact.name.charAt(0).toUpperCase()}</div>
          <div className="card-info">
            <span className="card-name">{contact.name}</span>
            <span className="card-company">{contact.company || '-'}</span>
          </div>
        </div>
        <div className="card-details">
          {contact.email && (
            <div
              className={`card-detail email-clickable ${copiedEmail ? 'copied' : ''}`}
              onClick={handleCopyEmail}
              title="Click to copy email"
            >
              <Mail size={12} />
              <span>{copiedEmail ? 'Copied!' : contact.email}</span>
            </div>
          )}
          {contact.phone && (
            <div className="card-detail">
              <Phone size={12} />
              <span>{contact.phone}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Contact Modal Component
interface ContactModalProps {
  contact: Contact | null;
  companies: Company[];
  onSave: (data: ContactFormData) => void;
  onClose: () => void;
  onDelete?: () => void;
}

function ContactModal({ contact, companies, onSave, onClose, onDelete }: ContactModalProps) {
  const [formData, setFormData] = useState<ContactFormData>({
    name: contact?.name || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    company: contact?.company || '',
    companyId: contact?.companyId || '',
    position: contact?.position || '',
    status: contact?.status || 'lead',
    tags: contact?.tags || [],
    source: contact?.source || '',
    notes: contact?.notes || '',
    customFields: contact?.customFields || {},
  });

  // Handle company selection - update both companyId and company name
  const handleCompanyChange = (companyId: string) => {
    const selectedCompany = companies.find(c => c.id === companyId);
    setFormData(prev => ({
      ...prev,
      companyId: companyId,
      company: selectedCompany?.name || prev.company,
    }));
  };

  const [tagInput, setTagInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    onSave(formData);
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData((prev) => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()],
      }));
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }));
  };

  return (
    <div className="modal-overlay">
      <div className="contact-modal">
        <div className="modal-header">
          <h3>{contact ? 'Edit Contact' : 'Add Contact'}</h3>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="John Doe"
                required
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="john@example.com"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div className="form-group">
              <label>Company</label>
              {companies.length > 0 ? (
                <select
                  value={formData.companyId || ''}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  className="company-select"
                >
                  <option value="">Select a company...</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, company: e.target.value }))
                  }
                  placeholder="Acme Inc."
                />
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Position</label>
              <input
                type="text"
                value={formData.position}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, position: e.target.value }))
                }
                placeholder="CEO"
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    status: e.target.value as ContactStatus,
                  }))
                }
              >
                {CONTACT_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Source</label>
            <input
              type="text"
              value={formData.source}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, source: e.target.value }))
              }
              placeholder="e.g., Website, Referral, LinkedIn"
            />
          </div>

          <div className="form-group">
            <label>Tags</label>
            <div className="tags-input">
              <div className="tags-list">
                {formData.tags.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag and press Enter"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Add any notes about this contact..."
              rows={3}
            />
          </div>

          <div className="modal-actions">
            {onDelete && (
              <button type="button" className="delete-btn" onClick={onDelete}>
                <Trash2 size={14} />
                Delete
              </button>
            )}
            <div className="right-actions">
              <button type="button" className="cancel-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="save-btn">
                {contact ? 'Save Changes' : 'Add Contact'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
