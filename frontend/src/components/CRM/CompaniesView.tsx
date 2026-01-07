/**
 * Companies View Component
 * Displays and manages companies in the CRM
 */

import { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Filter,
  Building2,
  Globe,
  MapPin,
  Users,
  X,
  Pencil,
  Trash2,
  Plus,
} from 'lucide-react';
import { confirm } from '@tauri-apps/plugin-dialog';
import CompanyModal from './CompanyModal';
import {
  Company,
  CompanyFormData,
  Contact,
  COMPANY_STATUSES,
  CompanyStatus,
} from '../../services/crmTypes';
import {
  createCompany,
  updateCompany,
  deleteCompany,
} from '../../services/crmService';
import './CompaniesView.css';

interface CompaniesViewProps {
  companies: Company[];
  contacts: Contact[];
  boardId: string;
  userId: string;
  userEmail: string;
}

export default function CompaniesView({
  companies,
  contacts,
  boardId,
  userId,
  userEmail,
}: CompaniesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CompanyStatus | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  // Count contacts per company
  const contactsByCompany = useMemo(() => {
    const counts: Record<string, number> = {};
    contacts.forEach((contact) => {
      if (contact.companyId) {
        counts[contact.companyId] = (counts[contact.companyId] || 0) + 1;
      }
    });
    return counts;
  }, [contacts]);

  // Filter companies
  const filteredCompanies = useMemo(() => {
    return companies.filter((company) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          company.name.toLowerCase().includes(query) ||
          company.website.toLowerCase().includes(query) ||
          company.industry.toLowerCase().includes(query) ||
          company.location.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter !== 'all' && company.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [companies, searchQuery, statusFilter]);

  // Handlers
  const handleAddCompany = useCallback(
    async (data: CompanyFormData) => {
      try {
        await createCompany(boardId, data, userId, userEmail);
        setShowAddModal(false);
      } catch (err) {
        console.error('Failed to create company:', err);
      }
    },
    [boardId, userId, userEmail]
  );

  const handleUpdateCompany = useCallback(
    async (companyId: string, data: Partial<CompanyFormData>) => {
      try {
        await updateCompany(companyId, data);
        setEditingCompany(null);
      } catch (err) {
        console.error('Failed to update company:', err);
      }
    },
    []
  );

  const handleDeleteCompany = useCallback(async (companyId: string) => {
    const confirmed = await confirm('Are you sure you want to delete this company? Contacts linked to this company will not be deleted.');
    if (!confirmed) {
      return;
    }

    try {
      await deleteCompany(companyId);
    } catch (err) {
      console.error('Failed to delete company:', err);
    }
  }, []);

  return (
    <div className="companies-view">
      {/* Toolbar */}
      <div className="companies-toolbar">
        {/* Search */}
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search companies..."
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
            onChange={(e) => setStatusFilter(e.target.value as CompanyStatus | 'all')}
          >
            <option value="all">All Statuses</option>
            {COMPANY_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

        {/* Add Company Button */}
        <button className="add-company-btn" onClick={() => setShowAddModal(true)}>
          <Plus size={16} />
          <span className="btn-label">Add Company</span>
        </button>
      </div>

      {/* Companies List */}
      <div className="companies-list">
        {filteredCompanies.length === 0 ? (
          <div className="empty-state">
            <Building2 size={48} />
            <h3>No companies yet</h3>
            <p>Add your first company to get started</p>
          </div>
        ) : (
          filteredCompanies.map((company) => (
            <CompanyCard
              key={company.id}
              company={company}
              contactCount={contactsByCompany[company.id] || 0}
              onEdit={() => setEditingCompany(company)}
              onDelete={() => handleDeleteCompany(company.id)}
            />
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingCompany) && (
        <CompanyModal
          company={editingCompany}
          onSave={
            editingCompany
              ? (data) => handleUpdateCompany(editingCompany.id, data)
              : handleAddCompany
          }
          onClose={() => {
            setShowAddModal(false);
            setEditingCompany(null);
          }}
          onDelete={
            editingCompany ? () => handleDeleteCompany(editingCompany.id) : undefined
          }
        />
      )}
    </div>
  );
}

// Company Card Component
interface CompanyCardProps {
  company: Company;
  contactCount: number;
  onEdit: () => void;
  onDelete: () => void;
}

function CompanyCard({ company, contactCount, onEdit, onDelete }: CompanyCardProps) {
  const statusInfo = COMPANY_STATUSES.find((s) => s.value === company.status);

  return (
    <div className="company-card" onClick={onEdit}>
      <div className="company-icon">
        <Building2 size={24} />
      </div>
      <div className="company-info">
        <div className="company-header">
          <h3 className="company-name">{company.name}</h3>
          <span
            className="company-status"
            style={{
              backgroundColor: statusInfo?.color + '20',
              color: statusInfo?.color,
            }}
          >
            {statusInfo?.label}
          </span>
        </div>
        <div className="company-details">
          {company.industry && (
            <span className="detail">
              <Building2 size={12} />
              {company.industry}
            </span>
          )}
          {company.location && (
            <span className="detail">
              <MapPin size={12} />
              {company.location}
            </span>
          )}
          {company.website && (
            <span className="detail">
              <Globe size={12} />
              {company.website}
            </span>
          )}
          <span className="detail">
            <Users size={12} />
            {contactCount} contact{contactCount !== 1 ? 's' : ''}
          </span>
        </div>
        {company.size && (
          <span className="company-size">{company.size} employees</span>
        )}
      </div>
      <div className="company-actions" onClick={(e) => e.stopPropagation()}>
        <button className="action-btn" onClick={onEdit}>
          <Pencil size={14} />
        </button>
        <button className="action-btn delete" onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
