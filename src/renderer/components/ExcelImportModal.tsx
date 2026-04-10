import React, { useState } from 'react';
import * as XLSX from 'xlsx';

interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
  value: string;
}

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: Record<string, string>[]) => Promise<{ success: boolean; message: string; importedCount: number; errors: ValidationError[] }>;
  moduleName: string;
  requiredFields: string[];
  fieldLabels: Record<string, string>;
  duplicateCheckField?: string;
  existingValues?: string[];
  /** Fields to display in preview/mapping but not required (can be empty) */
  optionalFields?: string[];
}

interface ParsedRow {
  rowIndex: number;
  data: Record<string, string>;
  isDuplicate: boolean;
  errors: ValidationError[];
}

const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
  moduleName,
  requiredFields,
  fieldLabels,
  duplicateCheckField,
  existingValues = [],
  optionalFields = [],
}) => {
  const [step, setStep] = useState<'select' | 'preview' | 'importing' | 'complete'>('select');
  const [fileName, setFileName] = useState<string>('');
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [previewData, setPreviewData] = useState<Record<string, string>[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string; importedCount: number; errors: ValidationError[] } | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(0);

  if (!isOpen) return null;

  const toStringValue = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    if (val instanceof Date) return val.toISOString().split('T')[0];
    if (typeof val === 'number') return String(val);
    if (typeof val === 'string') return val;
    return String(val);
  };

  const handleOpenFile = async () => {
    if (!window.electronAPI) {
      alert('Electron API not available');
      return;
    }

    const result = await window.electronAPI.showOpenDialog('Pilih File Excel untuk Import');
    if (result.canceled || result.filePaths.length === 0) {
      return;
    }

    const filePath = result.filePaths[0];
    const fileName = filePath.split(/[\\/]/).pop() || 'Unknown';
    setFileName(fileName);

    const readResult = await window.electronAPI.readExcelFile(filePath);
    if (!readResult.success) {
      alert('Gagal membaca file Excel: ' + readResult.error);
      return;
    }

    const jsonData = readResult.data;
    if (!jsonData || jsonData.length === 0) {
      alert('File tidak berisi data');
      return;
    }

    // Get column headers
    const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
    console.log('[ExcelImport] Columns found:', columns);
    console.log('[ExcelImport] JSON data rows:', jsonData.length);
    setAvailableColumns(columns);

    // Auto-detect column mappings based on field labels (both required and optional fields)
    const allMappedFields = [...requiredFields, ...optionalFields];
    const autoMappings: ColumnMapping[] = [];
        
        // Helper to normalize column names - extract significant words
        const normalizeForMatch = (str: string) => {
          // Extract significant words (letters + numbers, >= 2 chars)
          return str.toLowerCase().trim().split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, '')).filter(w => w.length >= 2);
        };
        
        // Helper to check if label is a subset of column
        const isLabelInColumn = (colWords: string[], labelWords: string[]) => {
          return labelWords.every(labelWord => {
            return colWords.some(colWord => {
              if (colWord === labelWord) return true;
              // Substring match only if col word is much longer (avoid "nama" matching "tanaman")
              return colWord.length >= labelWord.length * 3 && colWord.includes(labelWord);
            });
          });
        };
        
        for (const field of allMappedFields) {
          const label = fieldLabels[field]?.toLowerCase() || field.toLowerCase();
          const labelWords = normalizeForMatch(label);
          
          // Find column that matches
          const matchedColumn = columns.find(col => {
            const colWords = normalizeForMatch(col);
            
            // Skip if either is empty
            if (colWords.length === 0 || labelWords.length === 0) return false;
            
            // Strategy 1: Same number of significant words - all must match
            if (colWords.length === labelWords.length) {
              const colSorted = [...colWords].sort();
              const labelSorted = [...labelWords].sort();
              return JSON.stringify(colSorted) === JSON.stringify(labelSorted);
            }
            
            // Strategy 2: Single-word column matching one of the label words
            if (colWords.length === 1 && labelWords.some(lw => colWords[0].includes(lw) || lw.includes(colWords[0]))) {
              return true;
            }
            
            // Strategy 3: Label words are a subset of column words
            if (isLabelInColumn(colWords, labelWords)) return true;
            
            return false;
          });
          
          if (matchedColumn) {
            autoMappings.push({ sourceColumn: matchedColumn, targetField: field });
          }
        }

        console.log('[ExcelImport] Auto-detected mappings:', autoMappings);

        // Show preview of first 10 rows
        const preview = (jsonData as Record<string, unknown>[]).slice(0, 10).map((row: Record<string, unknown>) => {
          const mapped: Record<string, string> = {};
          autoMappings.forEach(mapping => {
            mapped[mapping.targetField] = toStringValue(row[mapping.sourceColumn]);
          });
          return mapped;
        });

        setColumnMappings(autoMappings);
        setPreviewData(preview);
        setStep('preview');

        // Validate all rows for duplicates
        validateRows(jsonData as Record<string, unknown>[], autoMappings);
  };

  const validateRows = (data: Record<string, unknown>[], mappings: ColumnMapping[]) => {
    const validated: ParsedRow[] = [];
    let duplicates = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const errors: ValidationError[] = [];
      
      // Build mapped row
      const mappedRow: Record<string, string> = {};
      mappings.forEach(mapping => {
        mappedRow[mapping.targetField] = toStringValue(row[mapping.sourceColumn]);
      });

      // Check for duplicates
      let isDuplicate = false;
      if (duplicateCheckField && duplicateCheckField in mappedRow) {
        isDuplicate = existingValues.includes(mappedRow[duplicateCheckField]);
        if (isDuplicate) duplicates++;
      }

      // Validate required fields (but not optional fields - they can be empty)
      for (const field of requiredFields) {
        // Skip validation for fields that are in optionalFields (they can be empty)
        if (optionalFields.includes(field)) {
          continue;
        }
        if (!mappedRow[field] || mappedRow[field].trim() === '') {
          errors.push({
            row: i + 2, // +2 because Excel row starts at 1 and has header
            field,
            message: `${fieldLabels[field] || field} harus diisi`,
            value: mappedRow[field] || '',
          });
        }
      }

      validated.push({ rowIndex: i + 2, data: mappedRow, isDuplicate, errors });
    }

    setParsedData(validated);
    setDuplicateCount(duplicates);
  };

  const handleMappingChange = (sourceColumn: string, targetField: string) => {
    const newMappings = columnMappings.filter(m => m.sourceColumn !== sourceColumn);
    newMappings.push({ sourceColumn, targetField });
    setColumnMappings(newMappings);
  };

  const handleImport = async () => {
    const validRows = parsedData.filter(row => !row.isDuplicate && row.errors.length === 0);
    
    if (validRows.length === 0) {
      const errorRows = parsedData.filter(r => r.errors.length > 0);
      const errorMsg = errorRows.length > 0 
        ? 'Ada ' + errorRows.length + ' baris dengan error:\n' + errorRows.slice(0,3).map(r => 'Row ' + r.rowIndex + ': ' + r.errors.map(e => e.message).join(', ')).join('\n')
        : 'Tidak ada data valid untuk diimport';
      window.alert('GAGAL IMPORT!\n\n' + errorMsg);
      return;
    }
    
    setStep('importing');
    setProgress(0);

    // Build final data
    const importData = parsedData
      .filter(row => !row.isDuplicate && row.errors.length === 0)
      .map(row => row.data);

    // Simulate progress updates
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 10, 90));
    }, 100);

    try {
      const result = await onImport(importData);
      clearInterval(progressInterval);
      setProgress(100);
      setImportResult(result);
      setStep('complete');
    } catch (error) {
      clearInterval(progressInterval);
      setImportResult({
        success: false,
        message: 'Terjadi kesalahan saat import',
        importedCount: 0,
        errors: [],
      });
      setStep('complete');
    }
  };

  const handleDownloadErrorLog = () => {
    if (!importResult?.errors || importResult.errors.length === 0) return;

    const errorData = importResult.errors.map(err => ({
      Baris: err.row,
      Field: err.field,
      Nilai: err.value,
      Kesalahan: err.message,
    }));

    const worksheet = XLSX.utils.json_to_sheet(errorData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Error Log');
    XLSX.writeFile(workbook, `Error_Log_${moduleName}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleClose = () => {
    setStep('select');
    setFileName('');
    setParsedData([]);
    setPreviewData([]);
    setColumnMappings([]);
    setProgress(0);
    setImportResult(null);
    setDuplicateCount(0);
    onClose();
  };

  const renderSelectStep = () => (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4">Import Data {moduleName}</h2>
      <p className="text-sm text-gray-600 mb-6">
        Pilih file Excel (.xlsx) untuk diimport. File harus memiliki header kolom yang sesuai.
      </p>
      
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <button
          onClick={handleOpenFile}
          className="cursor-pointer flex flex-col items-center gap-3 mx-auto"
        >
          <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span className="text-gray-600">Klik untuk memilih file Excel</span>
          <span className="text-xs text-gray-400">Format: .xlsx atau .xls</span>
        </button>
      </div>

      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-medium text-sm mb-2">Format Kolom yang Dibutuhkan:</h3>
        <ul className="text-xs text-gray-600 space-y-1">
          {requiredFields.map(field => (
            <li key={field}>
              <span className="font-medium">{fieldLabels[field] || field}</span>
              <span className="text-gray-400"> ({field})</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  const renderPreviewStep = () => (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-2">Preview Data {moduleName}</h2>
      <p className="text-sm text-gray-600 mb-4">
        File: <span className="font-medium">{fileName}</span> - {parsedData.length} baris data
      </p>

      {/* Duplicate warning */}
      {duplicateCount > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{duplicateCount} data memiliki Kode yang sudah ada (akan dilewati)</span>
          </div>
        </div>
      )}

      {/* Column mapping */}
      <div className="mb-4 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-medium text-sm mb-3">Mapping Kolom</h3>
        <div className="grid grid-cols-2 gap-3">
          {[...requiredFields, ...optionalFields].map(field => {
            const currentMapping = columnMappings.find(m => m.targetField === field);
            const isOptional = optionalFields.includes(field);
            return (
              <div key={field} className="flex items-center gap-2">
                <label className="text-sm font-medium w-32">
                  {fieldLabels[field] || field}:
                  {isOptional && <span className="text-gray-400 text-xs ml-1">(opsional)</span>}
                </label>
                <select
                  value={currentMapping?.sourceColumn || ''}
                  onChange={(e) => handleMappingChange(e.target.value, field)}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm"
                >
                  <option value="">-- Pilih Kolom --</option>
                  {availableColumns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Preview table */}
      <div className="mb-4 overflow-x-auto">
        <table className="w-full text-xs border border-gray-200">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left border-b">Row</th>
              {[...requiredFields, ...optionalFields].map(field => (
                <th key={field} className="px-3 py-2 text-left border-b">{fieldLabels[field] || field}</th>
              ))}
              <th className="px-3 py-2 text-left border-b">Status</th>
            </tr>
          </thead>
          <tbody>
            {previewData.map((row, idx) => {
              const fullRow = parsedData[idx];
              return (
                <tr key={idx} className={fullRow?.isDuplicate ? 'bg-amber-50' : fullRow?.errors.length ? 'bg-red-50' : ''}>
                  <td className="px-3 py-2 border-b">{idx + 2}</td>
                  {[...requiredFields, ...optionalFields].map(field => (
                    <td key={field} className="px-3 py-2 border-b">{row[field] || '-'}</td>
                  ))}
                  <td className="px-3 py-2 border-b">
                    {fullRow?.isDuplicate ? (
                      <span className="text-amber-600">Duplikat</span>
                    ) : fullRow?.errors.length ? (
                      <span className="text-red-600">{fullRow.errors.length} error</span>
                    ) : (
                      <span className="text-green-600">OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {parsedData.length > 10 && (
          <p className="text-xs text-gray-500 mt-2">Menampilkan 10 dari {parsedData.length} baris</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setStep('select')}
          className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          &larr; Kembali
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Batal
          </button>
          <button
            onClick={handleImport}
            disabled={parsedData.filter(r => !r.isDuplicate && r.errors.length === 0).length === 0}
            className="px-6 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import {parsedData.filter(r => !r.isDuplicate && r.errors.length === 0).length} Data
          </button>
        </div>
      </div>
    </div>
  );

  const renderImportingStep = () => (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4">Mengimport Data...</h2>
      
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Progress</span>
          <span className="text-sm font-medium">{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-primary-600 h-3 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <p className="text-sm text-gray-500 text-center">
        Mohon tunggu, sedang memproses data...
      </p>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4">Import {moduleName} Selesai</h2>

      {importResult?.success ? (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium">Berhasil mengimport {importResult.importedCount} baris</p>
              <p className="text-sm">{importResult.message}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium">{importResult?.message}</p>
          </div>
        </div>
      )}

      {/* Error log download */}
      {importResult?.errors && importResult.errors.length > 0 && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{importResult.errors.length} baris gagal diimport</p>
              <p className="text-xs text-gray-500">Download error log untuk melihat detail kesalahan</p>
            </div>
            <button
              onClick={handleDownloadErrorLog}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Error Log
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          onClick={handleClose}
          className="px-6 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-lg text-sm font-medium"
        >
          Tutup
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-800">Import Excel - {moduleName}</h2>
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-64px)]">
          {step === 'select' && renderSelectStep()}
          {step === 'preview' && renderPreviewStep()}
          {step === 'importing' && renderImportingStep()}
          {step === 'complete' && renderCompleteStep()}
        </div>
      </div>
    </div>
  );
};

export default ExcelImportModal;
