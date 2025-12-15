import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { invoke } from '@tauri-apps/api/core';
import { TeamDriveStorage } from '../../services/teamDriveStorage';
import './ExcelViewer.css';
import '../UI/CustomScrollbar.css';

interface ExcelViewerProps {
  filePath: string;
  fileName: string;
  rootPath?: string;
  fileId?: string;
  storageBackend?: TeamDriveStorage;
}

const ExcelViewer: React.FC<ExcelViewerProps> = ({ filePath, fileName, fileId, storageBackend }) => {
  const [sheets, setSheets] = useState<Array<{ name: string; data: any[][] }>>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadExcelFile = async () => {
      try {
        setLoading(true);
        setError(null);

        let arrayBuffer: ArrayBuffer;

        // Team mode: load from Firebase Storage
        if (storageBackend && fileId) {
          const blob = await storageBackend.downloadFileAsBlob(fileId);
          arrayBuffer = await blob.arrayBuffer();
        } else {
          // Local mode: Read the file using Tauri's read_binary_file command
          const fileContent = await invoke<number[]>('read_binary_file', { filePath });
          // Convert to Uint8Array for xlsx
          arrayBuffer = new Uint8Array(fileContent).buffer;
        }

        // Parse Excel file
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        // Convert all sheets to JSON
        const sheetsData = workbook.SheetNames.map((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          return { name: sheetName, data };
        });

        setSheets(sheetsData);
        setLoading(false);
      } catch (err) {
        console.error('Error loading Excel file:', err);
        setError('Failed to load Excel spreadsheet');
        setLoading(false);
      }
    };

    loadExcelFile();
  }, [filePath, fileId, storageBackend]);

  if (loading) {
    return (
      <div className="loading-or-error">
        Loading Excel spreadsheet...
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-or-error error-message">
        {error}
      </div>
    );
  }

  const currentSheet = sheets[activeSheet];

  return (
    <div className="excel-viewer">
      {/* Header */}
      <div className="excel-viewer-header">
        <h2>
          {fileName}
        </h2>
      </div>

      {/* Sheet Tabs */}
      {sheets.length > 1 && (
        <div className="excel-viewer-sheets custom-scrollbar">
          {sheets.map((sheet, index) => (
            <button
              key={index}
              onClick={() => setActiveSheet(index)}
              className={`excel-viewer-sheet-button ${activeSheet === index ? 'active' : ''}`}>
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      {/* Spreadsheet Content */}
      <div className="excel-viewer-content custom-scrollbar">
        {currentSheet && currentSheet.data.length > 0 ? (
          <table className="excel-viewer-table">
            <tbody>
              {currentSheet.data.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>
                      {cell !== null && cell !== undefined ? String(cell) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-sheet">
            Empty sheet
          </div>
        )}
      </div>
    </div>
  );
};

export default ExcelViewer;
