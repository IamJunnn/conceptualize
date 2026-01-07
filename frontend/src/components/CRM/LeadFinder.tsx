/**
 * Lead Finder Component
 * Scrapes websites for contact information and lets user build contacts
 */

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Search,
  Globe,
  Check,
  X,
  User,
  Mail,
  Phone,
  Building2,
  Loader2,
  AlertCircle,
  Plus,
  CheckCircle2,
} from 'lucide-react';
import './LeadFinder.css';

interface ScrapedLead {
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  position: string | null;
  source_url: string;
}

interface ScrapeResult {
  success: boolean;
  leads: ScrapedLead[];
  emails_found: string[];
  phones_found: string[];
  error: string | null;
}

interface LeadFinderProps {
  onImport: (leads: ScrapedLead[]) => void;
  onClose: () => void;
}

export default function LeadFinder({ onImport, onClose }: LeadFinderProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  // Selected items for creating a contact
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [contactName, setContactName] = useState('');
  const [companyName, setCompanyName] = useState('');

  // Track created contacts
  const [createdEmails, setCreatedEmails] = useState<Set<string>>(new Set());

  // Scrape the website
  const handleScrape = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    // Validate URL
    let finalUrl = url.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedEmail(null);
    setSelectedPhone(null);
    setContactName('');
    setCompanyName('');

    try {
      const scrapeResult = await invoke<ScrapeResult>('scrape_website_leads', { url: finalUrl });

      if (!scrapeResult.success) {
        setError(scrapeResult.error || 'Failed to scrape website');
        return;
      }

      setResult(scrapeResult);

      // Auto-fill company from first email domain
      if (scrapeResult.emails_found.length > 0) {
        const domain = scrapeResult.emails_found[0].split('@')[1];
        if (domain) {
          const company = domain.split('.')[0];
          setCompanyName(company.charAt(0).toUpperCase() + company.slice(1));
        }
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scrape website');
    } finally {
      setLoading(false);
    }
  };

  // Handle email selection
  const handleSelectEmail = (email: string) => {
    if (selectedEmail === email) {
      setSelectedEmail(null);
      setContactName('');
    } else {
      setSelectedEmail(email);
      // Auto-fill name from email
      const localPart = email.split('@')[0];
      const parts = localPart.split(/[._-]/);
      if (parts.length >= 2) {
        const name = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        setContactName(name);
      } else {
        setContactName(localPart.charAt(0).toUpperCase() + localPart.slice(1));
      }

      // Auto-fill company from domain
      const domain = email.split('@')[1];
      if (domain) {
        const company = domain.split('.')[0];
        setCompanyName(company.charAt(0).toUpperCase() + company.slice(1));
      }
    }
  };

  // Handle phone selection
  const handleSelectPhone = (phone: string) => {
    if (selectedPhone === phone) {
      setSelectedPhone(null);
    } else {
      setSelectedPhone(phone);
    }
  };

  // Create contact from selection
  const handleCreateContact = () => {
    if (!selectedEmail) return;

    const lead: ScrapedLead = {
      name: contactName || null,
      email: selectedEmail,
      phone: selectedPhone,
      company: companyName || null,
      position: null,
      source_url: url,
    };

    onImport([lead]);

    // Mark as created
    setCreatedEmails(prev => new Set([...prev, selectedEmail]));

    // Reset selection for next contact
    setSelectedEmail(null);
    setSelectedPhone(null);
    setContactName('');
  };

  // Check if ready to create
  const canCreate = selectedEmail && !createdEmails.has(selectedEmail);

  return (
    <div className="lead-finder-overlay" onClick={onClose}>
      <div className="lead-finder-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="lead-finder-header">
          <div className="header-title">
            <Globe size={20} />
            <h2>Find Leads from Website</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* URL Input */}
        <div className="url-input-section">
          <div className="url-input-wrapper">
            <Search size={18} />
            <input
              type="text"
              placeholder="Paste contact page URL (e.g., company.com/contact)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScrape()}
              disabled={loading}
            />
          </div>
          <button
            className="scan-btn"
            onClick={handleScrape}
            disabled={loading || !url.trim()}
          >
            {loading ? <Loader2 size={18} className="spinning" /> : <Search size={18} />}
            {loading ? 'Scanning...' : 'Scan'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="error-banner">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="lead-finder-content">
            {/* Left: Select from found data */}
            <div className="found-data-section">
              {/* Emails */}
              <div className="data-group">
                <div className="data-group-header">
                  <Mail size={16} />
                  <span>Emails Found ({result.emails_found.length})</span>
                </div>
                {result.emails_found.length === 0 ? (
                  <div className="no-data">No emails found</div>
                ) : (
                  <div className="data-list">
                    {result.emails_found.map((email) => {
                      const isCreated = createdEmails.has(email);
                      const isSelected = selectedEmail === email;

                      return (
                        <div
                          key={email}
                          className={`data-item ${isSelected ? 'selected' : ''} ${isCreated ? 'created' : ''}`}
                          onClick={() => !isCreated && handleSelectEmail(email)}
                        >
                          <div className="data-item-check">
                            {isCreated ? (
                              <CheckCircle2 size={16} />
                            ) : isSelected ? (
                              <Check size={16} />
                            ) : (
                              <div className="check-empty" />
                            )}
                          </div>
                          <span className="data-item-value">{email}</span>
                          {isCreated && <span className="created-badge">Added</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Phones */}
              <div className="data-group">
                <div className="data-group-header">
                  <Phone size={16} />
                  <span>Phones Found ({result.phones_found.length})</span>
                </div>
                {result.phones_found.length === 0 ? (
                  <div className="no-data">No phones found</div>
                ) : (
                  <div className="data-list">
                    {result.phones_found.map((phone, idx) => {
                      const isSelected = selectedPhone === phone;

                      return (
                        <div
                          key={idx}
                          className={`data-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleSelectPhone(phone)}
                        >
                          <div className="data-item-check">
                            {isSelected ? (
                              <Check size={16} />
                            ) : (
                              <div className="check-empty" />
                            )}
                          </div>
                          <span className="data-item-value">{phone}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Contact Preview/Builder */}
            <div className="contact-builder">
              <div className="builder-header">
                <User size={16} />
                <span>Create Contact</span>
              </div>

              <div className="builder-form">
                <div className="form-field">
                  <label>
                    <Mail size={14} />
                    Email
                  </label>
                  <input
                    type="email"
                    value={selectedEmail || ''}
                    onChange={(e) => setSelectedEmail(e.target.value || null)}
                    placeholder="Enter or select email"
                  />
                </div>

                <div className="form-field">
                  <label>
                    <Phone size={14} />
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={selectedPhone || ''}
                    onChange={(e) => setSelectedPhone(e.target.value || null)}
                    placeholder="Enter or select phone (optional)"
                  />
                </div>

                <div className="form-field">
                  <label>
                    <User size={14} />
                    Name
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Contact name"
                  />
                </div>

                <div className="form-field">
                  <label>
                    <Building2 size={14} />
                    Company
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Company name"
                  />
                </div>

                <button
                  className="create-contact-btn"
                  onClick={handleCreateContact}
                  disabled={!canCreate}
                >
                  <Plus size={16} />
                  Add to CRM
                </button>
              </div>

              {createdEmails.size > 0 && (
                <div className="created-summary">
                  <CheckCircle2 size={14} />
                  <span>{createdEmails.size} contact{createdEmails.size !== 1 ? 's' : ''} added</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <div className="lead-finder-empty">
            <Globe size={48} />
            <p>Enter a website URL to find contact information</p>
            <span>Works best with /contact or /about pages</span>
          </div>
        )}

        {/* Footer */}
        <div className="lead-finder-footer">
          <button className="cancel-btn" onClick={onClose}>
            {createdEmails.size > 0 ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
