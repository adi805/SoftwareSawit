import React, { useState, useEffect, useCallback } from 'react';

/**
 * Conflict Resolution Dialog Component (VAL-UI-007)
 * 
 * Modal dialog that queries pending conflicts from sync_db and presents
 * local/remote/merge options to user.
 */

export interface ConflictRecord {
  id: string;
  module: string;
  recordId: string;
  conflictType: 'edit_edit' | 'delete_edit' | 'edit_delete';
  localTimestamp: string;
  remoteTimestamp: string;
  localData: Record<string, unknown>;
  remoteData: Record<string, unknown>;
  needsManualResolution: boolean;
  createdAt: string;
}

interface ConflictResolutionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onResolved: (conflictId: string, resolution: 'local' | 'remote' | 'merged') => void;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a value for display in the diff view
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(kosong)';
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
  if (typeof value === 'number') return value.toLocaleString('id-ID');
  if (typeof value === 'string') return value || '(kosong)';
  return JSON.stringify(value);
}

/**
 * Get human-readable conflict type label
 */
function getConflictTypeLabel(type: string): string {
  switch (type) {
    case 'edit_edit': return 'Edit-Edit Conflict';
    case 'delete_edit': return 'Delete-Edit Conflict';
    case 'edit_delete': return 'Edit-Delete Conflict';
    default: return 'Unknown Conflict';
  }
}

/**
 * Get module display name
 */
function getModuleLabel(module: string): string {
  const labels: Record<string, string> = {
    'coa': 'COA (Chart of Accounts)',
    'aspek_kerja': 'Aspek Kerja',
    'blok': 'Blok',
    'kas': 'Kas',
    'bank': 'Bank',
    'gudang': 'Gudang',
  };
  return labels[module] || module;
}

/**
 * ConflictResolutionDialog Component
 */
const ConflictResolutionDialog: React.FC<ConflictResolutionDialogProps> = ({
  isOpen,
  onClose,
  onResolved,
}) => {
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [selectedConflict, setSelectedConflict] = useState<ConflictRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMergeEditor, setShowMergeEditor] = useState(false);
  const [mergedData, setMergedData] = useState<Record<string, unknown>>({});

  // Load pending conflicts when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadPendingConflicts();
    }
  }, [isOpen]);

  const loadPendingConflicts = async () => {
    if (!window.electronAPI) {
      setError('Electron API not available');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get pending conflicts that need manual resolution
      const pendingConflicts = await window.electronAPI.getPendingSyncConflicts();
      setConflicts(pendingConflicts);
      
      // Auto-select first conflict if available
      if (pendingConflicts.length > 0 && !selectedConflict) {
        setSelectedConflict(pendingConflicts[0]);
        setMergedData(mergeDefaultData(pendingConflicts[0].localData, pendingConflicts[0].remoteData));
      }
    } catch (err) {
      console.error('[ConflictResolution] Failed to load conflicts:', err);
      setError('Gagal memuat konflik. Silakan coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate default merged data (prefer local values)
  const mergeDefaultData = (local: Record<string, unknown>, remote: Record<string, unknown>): Record<string, unknown> => {
    const merged: Record<string, unknown> = {};
    const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
    
    for (const key of allKeys) {
      // Skip metadata fields
      if (isMetadataField(key)) continue;
      
      // Prefer local value if available
      merged[key] = local[key] !== undefined ? local[key] : remote[key];
    }
    
    return merged;
  };

  // Check if field is metadata
  const isMetadataField = (field: string): boolean => {
    const metadataFields = [
      'id', '_id', 'sync_status', 'sync_timestamp', 'modified_at',
      'created_at', 'updated_at', 'device_id', 'modified_by', 'version', 'etag',
      '_conflictResolved', '_fieldConflicts', '_mergedAt',
    ];
    return metadataFields.includes(field.toLowerCase());
  };

  // Get conflicting fields between local and remote
  const getConflictingFields = useCallback((): string[] => {
    if (!selectedConflict) return [];
    
    const local = selectedConflict.localData;
    const remote = selectedConflict.remoteData;
    const conflictingFields: string[] = [];
    
    const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
    for (const key of allKeys) {
      if (isMetadataField(key)) continue;
      
      const localValue = JSON.stringify(local[key]);
      const remoteValue = JSON.stringify(remote[key]);
      
      if (localValue !== remoteValue) {
        conflictingFields.push(key);
      }
    }
    
    return conflictingFields;
  }, [selectedConflict]);

  // Get all business fields (excluding metadata)
  const getBusinessFields = useCallback((): string[] => {
    if (!selectedConflict) return [];
    
    const local = selectedConflict.localData;
    const remote = selectedConflict.remoteData;
    const fields: string[] = [];
    
    const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
    for (const key of allKeys) {
      if (!isMetadataField(key)) {
        fields.push(key);
      }
    }
    
    return fields.sort();
  }, [selectedConflict]);

  // Resolve conflict with selected strategy
  const handleResolve = async (resolution: 'local' | 'remote' | 'merged') => {
    if (!selectedConflict || !window.electronAPI) return;

    setIsResolving(true);
    setError(null);

    try {
      const resolvedData = resolution === 'merged' ? mergedData : undefined;
      const result = await window.electronAPI.resolveSyncConflict(
        selectedConflict.id,
        resolution,
        resolvedData
      );

      if (result.success) {
        onResolved(selectedConflict.id, resolution);
        
        // Remove resolved conflict from list
        const remainingConflicts = conflicts.filter(c => c.id !== selectedConflict.id);
        setConflicts(remainingConflicts);
        
        // Select next conflict or close dialog
        if (remainingConflicts.length > 0) {
          setSelectedConflict(remainingConflicts[0]);
          setMergedData(mergeDefaultData(remainingConflicts[0].localData, remainingConflicts[0].localData));
          setShowMergeEditor(false);
        } else {
          setSelectedConflict(null);
          onClose();
        }
      } else {
        setError(result.message || 'Gagal menyelesaikan konflik');
      }
    } catch (err) {
      console.error('[ConflictResolution] Failed to resolve conflict:', err);
      setError('Terjadi kesalahan saat menyelesaikan konflik');
    } finally {
      setIsResolving(false);
    }
  };

  // Discard conflict (mark as resolved with no action)
  const handleDiscard = async () => {
    if (!selectedConflict || !window.electronAPI) return;

    setIsResolving(true);
    setError(null);

    try {
      const result = await window.electronAPI.discardSyncConflict(selectedConflict.id);

      if (result.success) {
        // Remove discarded conflict from list
        const remainingConflicts = conflicts.filter(c => c.id !== selectedConflict.id);
        setConflicts(remainingConflicts);
        
        // Select next conflict or close dialog
        if (remainingConflicts.length > 0) {
          setSelectedConflict(remainingConflicts[0]);
        } else {
          setSelectedConflict(null);
          onClose();
        }
      } else {
        setError(result.message || 'Gagal menghapus konflik');
      }
    } catch (err) {
      console.error('[ConflictResolution] Failed to discard conflict:', err);
      setError('Terjadi kesalahan saat menghapus konflik');
    } finally {
      setIsResolving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Resolution Konflik Sinkronisasi</h2>
              <p className="text-sm text-gray-600">
                {conflicts.length} konflik membutuhkan resolusi manual
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Conflict List Sidebar */}
          <div className="w-64 border-r border-gray-200 bg-gray-50 overflow-y-auto">
            <div className="p-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Daftar Konflik
              </h3>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="w-6 h-6 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              ) : conflicts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <svg className="w-12 h-12 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm">Tidak ada konflik</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {conflicts.map((conflict) => (
                    <button
                      key={conflict.id}
                      onClick={() => {
                        setSelectedConflict(conflict);
                        setMergedData(mergeDefaultData(conflict.localData, conflict.remoteData));
                        setShowMergeEditor(false);
                      }}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedConflict?.id === conflict.id
                          ? 'bg-amber-100 border border-amber-300'
                          : 'bg-white border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                          {getModuleLabel(conflict.module)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-800 truncate">
                        ID: {conflict.recordId}
                      </p>
                      <p className="text-xs text-gray-500">
                        {getConflictTypeLabel(conflict.conflictType)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Conflict Detail View */}
          <div className="flex-1 overflow-y-auto">
            {error && (
              <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              </div>
            )}

            {!selectedConflict ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p>Pilih konflik dari daftar untuk melihat detail</p>
                </div>
              </div>
            ) : showMergeEditor ? (
              /* Merge Editor View */
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Merge Data - {selectedConflict.recordId}
                  </h3>
                  <button
                    onClick={() => setShowMergeEditor(false)}
                    className="text-sm text-gray-600 hover:text-gray-800 flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Kembali ke Detail
                  </button>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-blue-800">
                    <strong>Tip:</strong> Pilih nilai yang ingin disimpan untuk setiap kolom.
                    Nilai yang berkonflik ditandai dengan warna kuning.
                  </p>
                </div>

                <div className="space-y-3">
                  {getBusinessFields().map((field) => {
                    const isConflicting = getConflictingFields().includes(field);
                    const localVal = selectedConflict.localData[field];
                    const remoteVal = selectedConflict.remoteData[field];
                    const currentVal = mergedData[field];

                    return (
                      <div key={field} className={`p-3 rounded-lg border ${
                        isConflicting ? 'bg-yellow-50 border-yellow-300' : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-gray-700">
                            {field}
                            {isConflicting && (
                              <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded">
                                Konflik
                              </span>
                            )}
                          </label>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2">
                          {/* Local Value */}
                          <button
                            onClick={() => setMergedData(prev => ({ ...prev, [field]: localVal }))}
                            className={`p-2 rounded text-sm text-left transition-colors ${
                              JSON.stringify(currentVal) === JSON.stringify(localVal)
                                ? 'bg-green-100 border-2 border-green-400 text-green-800'
                                : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <div className="text-xs text-gray-500 mb-1">Lokal</div>
                            <div className="font-medium truncate">{formatValue(localVal)}</div>
                          </button>

                          {/* Remote Value */}
                          <button
                            onClick={() => setMergedData(prev => ({ ...prev, [field]: remoteVal }))}
                            className={`p-2 rounded text-sm text-left transition-colors ${
                              JSON.stringify(currentVal) === JSON.stringify(remoteVal)
                                ? 'bg-blue-100 border-2 border-blue-400 text-blue-800'
                                : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <div className="text-xs text-gray-500 mb-1">Remote</div>
                            <div className="font-medium truncate">{formatValue(remoteVal)}</div>
                          </button>

                          {/* Current/Merged Value */}
                          <div className={`p-2 rounded text-sm ${
                            isConflicting ? 'bg-yellow-100 border-2 border-yellow-400' : 'bg-white border border-gray-300'
                          }`}>
                            <div className="text-xs text-gray-500 mb-1">Hasil Merge</div>
                            <div className="font-medium text-gray-800 truncate">{formatValue(currentVal)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => setShowMergeEditor(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => handleResolve('merged')}
                    disabled={isResolving}
                    className="px-6 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isResolving ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Simpan Merge
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Conflict Detail View */
              <div className="p-6">
                {/* Conflict Info */}
                <div className="flex items-center gap-4 mb-6 pb-4 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-amber-100 text-amber-800 text-sm font-medium rounded-full">
                      {getConflictTypeLabel(selectedConflict.conflictType)}
                    </span>
                    <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm font-medium rounded-full">
                      {getModuleLabel(selectedConflict.module)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    Terdeteksi: {formatTimestamp(selectedConflict.createdAt)}
                  </div>
                </div>

                {/* Timestamps */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Versi Lokal
                    </h4>
                    <p className="text-xs text-green-600 mb-1">
                      Record ID: {selectedConflict.recordId}
                    </p>
                    <p className="text-xs text-green-600">
                      Diubah: {formatTimestamp(selectedConflict.localTimestamp)}
                    </p>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Versi Remote
                    </h4>
                    <p className="text-xs text-blue-600 mb-1">
                      Record ID: {selectedConflict.recordId}
                    </p>
                    <p className="text-xs text-blue-600">
                      Diubah: {formatTimestamp(selectedConflict.remoteTimestamp)}
                    </p>
                  </div>
                </div>

                {/* Data Comparison */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Perbandingan Data</h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-600 w-1/4">Kolom</th>
                          <th className="px-4 py-2 text-left font-medium text-green-700 bg-green-50">Nilai Lokal</th>
                          <th className="px-4 py-2 text-left font-medium text-blue-700 bg-blue-50">Nilai Remote</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {getBusinessFields().map((field) => {
                          const isConflicting = getConflictingFields().includes(field);
                          const localVal = selectedConflict.localData[field];
                          const remoteVal = selectedConflict.remoteData[field];

                          return (
                            <tr key={field} className={isConflicting ? 'bg-yellow-50' : ''}>
                              <td className="px-4 py-2 font-medium text-gray-700">
                                {field}
                                {isConflicting && (
                                  <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded">
                                    Konflik
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-green-800 bg-green-50/50">
                                {formatValue(localVal)}
                              </td>
                              <td className="px-4 py-2 text-blue-800 bg-blue-50/50">
                                {formatValue(remoteVal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleDiscard}
                      disabled={isResolving}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Abaikan Konflik
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleResolve('remote')}
                      disabled={isResolving}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Gunakan Remote
                    </button>
                    <button
                      onClick={() => handleResolve('local')}
                      disabled={isResolving}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Gunakan Lokal
                    </button>
                    <button
                      onClick={() => setShowMergeEditor(true)}
                      disabled={isResolving}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                      Merge Manual
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConflictResolutionDialog;
