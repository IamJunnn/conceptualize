/**
 * CSV Import Modal Component
 * Allows importing contacts from CSV/Excel files with column mapping
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { read, utils } from 'xlsx';
import {
  Upload,
  X,
  FileSpreadsheet,
  AlertCircle,
  Check,
  Loader2,
} from 'lucide-react';
import { ContactFormData, ContactStatus } from '../../services/crmTypes';
import './CSVImportModal.css';

interface CSVImportModalProps {
  onImport: (contacts: ContactFormData[]) => Promise<number>;
  onClose: () => void;
}

// CRM fields that can be mapped
type CRMField = 'name' | 'email' | 'phone' | 'company' | 'position' | 'source' | 'notes' | 'skip';

const CRM_FIELDS: { value: CRMField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'company', label: 'Company' },
  { value: 'position', label: 'Position/Title' },
  { value: 'source', label: 'Source' },
  { value: 'notes', label: 'Notes' },
  { value: 'skip', label: "Don't import" },
];

// Common column name patterns for auto-detection
const COLUMN_PATTERNS: Record<CRMField, RegExp[]> = {
  name: [/^name$/i, /^full\s*name$/i, /^contact\s*name$/i, /^person$/i, /^first\s*name$/i],
  email: [/^email$/i, /^e-mail$/i, /^email\s*address$/i, /^mail$/i],
  phone: [/^phone$/i, /^telephone$/i, /^mobile$/i, /^cell$/i, /^phone\s*number$/i, /^contact\s*number$/i],
  company: [/^company$/i, /^organization$/i, /^org$/i, /^business$/i, /^company\s*name$/i, /^employer$/i],
  position: [/^position$/i, /^title$/i, /^job\s*title$/i, /^role$/i, /^designation$/i],
  source: [/^source$/i, /^lead\s*source$/i, /^origin$/i, /^channel$/i],
  notes: [/^notes?$/i, /^comments?$/i, /^description$/i, /^details$/i],
  skip: [],
};

// Auto-detect CRM field from column name
function detectField(columnName: string): CRMField {
  const normalizedName = columnName.trim();

  for (const [field, patterns] of Object.entries(COLUMN_PATTERNS) as [CRMField, RegExp[]][]) {
    if (field === 'skip') continue;
    for (const pattern of patterns) {
      if (pattern.test(normalizedName)) {
        return field;
      }
    }
  }

  return 'skip';
}

export default function CSVImportModal({ onImport, onClose }: CSVImportModalProps) {
  // State
  const [isDragOver, setIsDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rawData, setRawData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<number, CRMField>>({});
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; count: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse file
  const parseFile = useCallback(async (file: File) => {
    setError(null);
    setImportResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer, { type: 'array' });

      // Get first sheet
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        setError('No sheets found in file');
        return;
      }

      const sheet = workbook.Sheets[sheetName];
      const data: string[][] = utils.sheet_to_json(sheet, { header: 1, defval: '' });

      if (data.length < 2) {
        setError('File must contain at least a header row and one data row');
        return;
      }

      // First row is headers
      const headerRow = data[0].map(h => String(h).trim());
      const dataRows = data.slice(1).filter(row => row.some(cell => cell !== ''));

      if (dataRows.length === 0) {
        setError('No data rows found');
        return;
      }

      // Auto-detect column mapping
      const autoMapping: Record<number, CRMField> = {};
      const usedFields = new Set<CRMField>();

      headerRow.forEach((header, index) => {
        const detected = detectField(header);
        // Only auto-map if not already used (prevent duplicates)
        if (detected !== 'skip' && !usedFields.has(detected)) {
          autoMapping[index] = detected;
          usedFields.add(detected);
        } else {
          autoMapping[index] = 'skip';
        }
      });

      setFile(file);
      setHeaders(headerRow);
      setRawData(dataRows);
      setColumnMapping(autoMapping);

    } catch (err) {
      console.error('Failed to parse file:', err);
      setError('Failed to parse file. Please ensure it is a valid CSV or Excel file.');
    }
  }, []);

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      parseFile(droppedFile);
    }
  }, [parseFile]);

  // Handle file select
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      parseFile(selectedFile);
    }
  }, [parseFile]);

  // Update column mapping
  const updateMapping = useCallback((columnIndex: number, field: CRMField) => {
    setColumnMapping(prev => ({
      ...prev,
      [columnIndex]: field,
    }));
  }, []);

  // Convert raw data to contacts based on mapping
  const contacts = useMemo((): ContactFormData[] => {
    return rawData.map(row => {
      const contact: ContactFormData = {
        name: '',
        email: '',
        phone: '',
        company: '',
        position: '',
        status: 'lead' as ContactStatus,
        tags: ['csv-import'],
        source: 'CSV Import',
        notes: '',
        customFields: {},
      };

      // Apply mapping
      headers.forEach((_, colIndex) => {
        const field = columnMapping[colIndex];
        const value = String(row[colIndex] || '').trim();

        if (field && field !== 'skip' && value) {
          if (field === 'source') {
            contact.source = value;
          } else {
            contact[field] = value;
          }
        }
      });

      return contact;
    }).filter(c => c.name || c.email); // At least name or email required
  }, [rawData, headers, columnMapping]);

  // Handle import
  const handleImport = useCallback(async () => {
    if (contacts.length === 0) {
      setError('No valid contacts to import. Ensure at least "Name" or "Email" is mapped.');
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const count = await onImport(contacts);
      setImportResult({ success: true, count });

      // Close after success
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Import failed:', err);
      setError('Failed to import contacts. Please try again.');
    } finally {
      setImporting(false);
    }
  }, [contacts, onImport, onClose]);

  // Preview data (first 5 rows)
  const previewData = rawData.slice(0, 5);

  // Check if name column is mapped
  const hasNameMapping = Object.values(columnMapping).includes('name');
  const hasEmailMapping = Object.values(columnMapping).includes('email');
  const hasValidMapping = hasNameMapping || hasEmailMapping;

  return (
    <div className="csv-import-overlay" onClick={onClose}>
      <div className="csv-import-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="csv-import-header">
          <div className="header-title">
            <FileSpreadsheet size={20} />
            <h2>Import Contacts from CSV</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="csv-import-content">
          {/* Success State */}
          {importResult?.success && (
            <div className="import-success">
              <Check size={48} />
              <h3>Import Complete!</h3>
              <p>Successfully imported {importResult.count} contacts</p>
            </div>
          )}

          {/* File Upload Zone */}
          {!file && !importResult && (
            <div
              className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={32} />
              <p className="drop-text">Drag & drop a CSV or Excel file here</p>
              <p className="drop-hint">or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                hidden
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="import-error">
              <AlertCircle size={16} />
              <span>{error}</span>
              <button onClick={() => setError(null)}>
                <X size={14} />
              </button>
            </div>
          )}

          {/* Column Mapping */}
          {file && !importResult && (
            <>
              <div className="file-info">
                <FileSpreadsheet size={16} />
                <span className="file-name">{file.name}</span>
                <span className="row-count">{rawData.length} rows</span>
                <button className="change-file" onClick={() => { setFile(null); setRawData([]); setHeaders([]); }}>
                  Change
                </button>
              </div>

              <div className="mapping-section">
                <h3>Column Mapping</h3>
                <p className="mapping-hint">Map your CSV columns to CRM fields</p>

                <div className="mapping-table">
                  <div className="mapping-header">
                    <span>CSV Column</span>
                    <span>Maps To</span>
                    <span>Sample Data</span>
                  </div>
                  {headers.map((header, index) => (
                    <div key={index} className="mapping-row">
                      <span className="csv-column">{header || `Column ${index + 1}`}</span>
                      <select
                        value={columnMapping[index] || 'skip'}
                        onChange={(e) => updateMapping(index, e.target.value as CRMField)}
                      >
                        {CRM_FIELDS.map(field => (
                          <option key={field.value} value={field.value}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                      <span className="sample-data">
                        {rawData[0]?.[index] || '-'}
                      </span>
                    </div>
                  ))}
                </div>

                {!hasValidMapping && (
                  <div className="mapping-warning">
                    <AlertCircle size={14} />
                    <span>Map at least "Name" or "Email" to import contacts</span>
                  </div>
                )}
              </div>

              {/* Preview */}
              {contacts.length > 0 && (
                <div className="preview-section">
                  <h3>Preview ({Math.min(5, contacts.length)} of {contacts.length} contacts)</h3>
                  <div className="preview-table-wrapper">
                    <table className="preview-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Phone</th>
                          <th>Company</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.slice(0, 5).map((_, rowIndex) => {
                          const contact = contacts[rowIndex];
                          if (!contact) return null;
                          return (
                            <tr key={rowIndex}>
                              <td>{contact.name || '-'}</td>
                              <td>{contact.email || '-'}</td>
                              <td>{contact.phone || '-'}</td>
                              <td>{contact.company || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="csv-import-footer">
          <button className="cancel-btn" onClick={onClose}>
            Cancel
          </button>
          {file && !importResult && (
            <button
              className="import-btn"
              onClick={handleImport}
              disabled={importing || contacts.length === 0 || !hasValidMapping}
            >
              {importing ? (
                <>
                  <Loader2 size={16} className="spinning" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload size={16} />
                  Import {contacts.length} Contact{contacts.length !== 1 ? 's' : ''}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
