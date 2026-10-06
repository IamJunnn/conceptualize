/**
 * Company Modal Component
 * Modal for adding and editing company records
 */

import { useState } from 'react';
import { X, Building2, Globe, MapPin, Phone, Mail, DollarSign } from 'lucide-react';
import { confirm } from '@tauri-apps/plugin-dialog';
import {
  Company,
  CompanyFormData,
  CompanyStatus,
  CompanySize,
  COMPANY_STATUSES,
  COMPANY_SIZES,
  INDUSTRIES,
} from '../../services/crmTypes';
import './CompanyModal.css';

interface CompanyModalProps {
  company: Company | null;
  onSave: (data: CompanyFormData) => void;
  onClose: () => void;
  onDelete?: () => void;
}

export default function CompanyModal({
  company,
  onSave,
  onClose,
  onDelete,
}: CompanyModalProps) {
  const [formData, setFormData] = useState<CompanyFormData>({
    name: company?.name || '',
    website: company?.website || '',
    industry: company?.industry || '',
    size: company?.size || '1-10',
    revenue: company?.revenue || '',
    location: company?.location || '',
    phone: company?.phone || '',
    email: company?.email || '',
    address: company?.address || '',
    status: company?.status || 'prospect',
    tags: company?.tags || [],
    notes: company?.notes || '',
  });

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

  const handleDeleteClick = async () => {
    if (onDelete) {
      const confirmed = await confirm('Are you sure you want to delete this company?');
      if (confirmed) {
        onDelete();
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="company-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Building2 size={20} />
            <h3>{company ? 'Edit Company' : 'Add Company'}</h3>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <h4>Basic Information</h4>

            <div className="form-row">
              <div className="form-group">
                <label>Company Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Acme Inc."
                  required
                />
              </div>
              <div className="form-group">
                <label>Website</label>
                <div className="input-with-icon">
                  <Globe size={14} />
                  <input
                    type="text"
                    value={formData.website}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, website: e.target.value }))
                    }
                    placeholder="www.acme.com"
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Industry</label>
                <select
                  value={formData.industry}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, industry: e.target.value }))
                  }
                >
                  <option value="">Select industry...</option>
                  {INDUSTRIES.map((industry) => (
                    <option key={industry} value={industry}>
                      {industry}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Company Size</label>
                <select
                  value={formData.size}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      size: e.target.value as CompanySize,
                    }))
                  }
                >
                  {COMPANY_SIZES.map((size) => (
                    <option key={size.value} value={size.value}>
                      {size.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Location</label>
                <div className="input-with-icon">
                  <MapPin size={14} />
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, location: e.target.value }))
                    }
                    placeholder="San Francisco, CA"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Revenue</label>
                <div className="input-with-icon">
                  <DollarSign size={14} />
                  <input
                    type="text"
                    value={formData.revenue}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, revenue: e.target.value }))
                    }
                    placeholder="$1M - $10M"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h4>Contact Information</h4>

            <div className="form-row">
              <div className="form-group">
                <label>Phone</label>
                <div className="input-with-icon">
                  <Phone size={14} />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Email</label>
                <div className="input-with-icon">
                  <Mail size={14} />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, email: e.target.value }))
                    }
                    placeholder="info@acme.com"
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, address: e.target.value }))
                }
                placeholder="123 Main St, Suite 100"
              />
            </div>
          </div>

          <div className="form-section">
            <h4>CRM Details</h4>

            <div className="form-group">
              <label>Status</label>
              <div className="status-options">
                {COMPANY_STATUSES.map((status) => (
                  <button
                    key={status.value}
                    type="button"
                    className={`status-option ${formData.status === status.value ? 'active' : ''}`}
                    style={{
                      '--status-color': status.color,
                    } as React.CSSProperties}
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        status: status.value as CompanyStatus,
                      }))
                    }
                  >
                    {status.label}
                  </button>
                ))}
              </div>
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
                placeholder="Add notes about this company..."
                rows={3}
              />
            </div>
          </div>

          <div className="modal-footer">
            {company && onDelete && (
              <button
                type="button"
                className="delete-btn"
                onClick={handleDeleteClick}
              >
                Delete Company
              </button>
            )}
            <div className="footer-actions">
              <button type="button" className="cancel-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="save-btn">
                {company ? 'Save Changes' : 'Add Company'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
