import React, { useState, useEffect } from 'react';
import OfflineBanner from '../components/OfflineBanner';

interface COA {
  id: string;
  kode: string;
  nama: string;
  tipe: string;
  parent_id: string | null;
  status_aktif: number;
  created_at: string;
  updated_at: string;
}

interface COAFormPageProps {
  coa?: COA | null;
  onSave: () => void;
  onCancel: () => void;
  isGuest?: boolean;
}

const TIPE_OPTIONS = ['Aktiva', 'Passiva', 'Modal', 'Pendapatan', 'Beban'];

const COAFormPage: React.FC<COAFormPageProps> = ({ coa, onSave, onCancel, isGuest = false }) => {
  const [kode, setKode] = useState('');
  const [nama, setNama] = useState('');
  const [tipe, setTipe] = useState('Aktiva');
  const [parentId, setParentId] = useState<string | null>(null);
  const [statusAktif, setStatusAktif] = useState(1);
  const [availableParents, setAvailableParents] = useState<COA[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const isEditMode = !!coa;

  // Load available parent COA options
  useEffect(() => {
    const loadParents = async () => {
      if (window.electronAPI) {
        const allCOA = await window.electronAPI.getAllCOA();
        // Filter out current COA and its descendants to prevent circular reference
        const filteredParents = allCOA.filter((c: COA) => {
          if (isEditMode && coa) {
            return c.id !== coa.id;
          }
          return true;
        });
        setAvailableParents(filteredParents);
      }
    };
    loadParents();
  }, [coa, isEditMode]);

  // Initialize form with existing data for edit mode
  useEffect(() => {
    if (coa) {
      setKode(coa.kode);
      setNama(coa.nama);
      setTipe(coa.tipe);
      setParentId(coa.parent_id);
      setStatusAktif(coa.status_aktif);
    }
  }, [coa]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Kode validation - accepts numeric or alphanumeric with hyphens (e.g., '100', '11-11-001', '12-30-002-01')
    if (!kode.trim()) {
      newErrors.kode = 'Kode harus diisi';
    } else if (!/^[0-9]+(-[0-9]+)*$/.test(kode.trim())) {
      newErrors.kode = 'Kode format tidak valid';
    }

    // Nama validation
    if (!nama.trim()) {
      newErrors.nama = 'Nama harus diisi';
    }

    // Tipe validation
    if (!TIPE_OPTIONS.includes(tipe)) {
      newErrors.tipe = 'Tipe tidak valid';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    if (!window.electronAPI) return;

    setIsSubmitting(true);
    setSubmitError('');
    setSubmitSuccess(false);

    try {
      let result;

      if (isEditMode && coa) {
        // Update existing COA (local-first with sync queue)
        result = await window.electronAPI.localFirstUpdateCOA(
          coa.id,
          nama.trim(),
          tipe,
          parentId,
          statusAktif
        );
      } else {
        // Create new COA (local-first with sync queue)
        result = await window.electronAPI.localFirstCreateCOA(
          kode.trim(),
          nama.trim(),
          tipe,
          parentId,
          statusAktif
        );
      }

      if (result.success) {
        setSubmitSuccess(true);
        setTimeout(() => {
          onSave();
        }, 1000);
      } else {
        setSubmitError(result.message);
      }
    } catch (error) {
      console.error('[COA Form] Submit error:', error);
      setSubmitError('Terjadi kesalahan saat menyimpan data');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckDuplicateKode = async () => {
    if (!kode.trim() || !window.electronAPI) return;

    const existing = await window.electronAPI.getCOAByKode(kode.trim());
    if (existing && (!isEditMode || existing.id !== coa?.id)) {
      setErrors((prev) => ({
        ...prev,
        kode: 'Kode sudah ada',
      }));
    } else {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.kode;
        return newErrors;
      });
    }
  };

  const resetForm = () => {
    setKode('');
    setNama('');
    setTipe('Aktiva');
    setParentId(null);
    setStatusAktif(1);
    setErrors({});
    setSubmitError('');
    setSubmitSuccess(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <button
                onClick={() => { resetForm(); onCancel(); }}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-gray-800">
                {isEditMode ? 'Edit COA' : 'Tambah COA Baru'}
              </h1>
            </div>
            <p className="text-sm text-gray-500 ml-8">
              {isEditMode ? `Mengedit data COA: ${coa?.kode}` : 'Masukkan data COA baru'}
            </p>
          </div>
        </div>
      </div>

      {/* Offline Banner */}
      <OfflineBanner />

      {/* Form */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* Success message */}
          {submitSuccess && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              COA berhasil {isEditMode ? 'diupdate' : 'ditambahkan'}!
            </div>
          )}

          {/* Error message */}
          {submitError && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {submitError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow">
            <div className="p-6 space-y-6">
              {/* Kode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kode COA <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={kode}
                  onChange={(e) => setKode(e.target.value)}
                  onBlur={handleCheckDuplicateKode}
                  disabled={isEditMode || isGuest}
                  placeholder="Contoh: 100, 11-11-001, 12-30-002-01"
                  className={`w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${
                    errors.kode ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.kode && (
                  <p className="mt-1 text-xs text-red-500">{errors.kode}</p>
                )}
                {isEditMode && (
                  <p className="mt-1 text-xs text-gray-400">Kode tidak dapat diubah saat edit</p>
                )}
              </div>

              {/* Nama */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama COA <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  disabled={isGuest}
                  placeholder="Contoh: Kas, Bank BCA, Pendapatan K CPO"
                  className={`w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${
                    errors.nama ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.nama && (
                  <p className="mt-1 text-xs text-red-500">{errors.nama}</p>
                )}
              </div>

              {/* Tipe */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipe <span className="text-red-500">*</span>
                </label>
                <select
                  value={tipe}
                  onChange={(e) => setTipe(e.target.value)}
                  disabled={isGuest}
                  className={`w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${
                    errors.tipe ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  {TIPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                {errors.tipe && (
                  <p className="mt-1 text-xs text-red-500">{errors.tipe}</p>
                )}
              </div>

              {/* Parent COA */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Parent COA
                </label>
                <select
                  value={parentId || ''}
                  onChange={(e) => setParentId(e.target.value || null)}
                  disabled={isGuest}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">-- Tidak Ada Parent --</option>
                  {availableParents.map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {parent.kode} - {parent.nama}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-400">
                  Pilih parent COA untuk membuat hierarki. Kosongkan jika ini adalah akun utama.
                </p>
              </div>

              {/* Status Aktif */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <div className="flex items-center gap-4">
                  <label className={`flex items-center gap-2 ${isGuest ? 'cursor-not-allowed' : 'cursor-pointer'} pointer-events-none`}>
                    <input
                      type="radio"
                      name="status"
                      value="1"
                      checked={statusAktif === 1}
                      onChange={() => setStatusAktif(1)}
                      disabled={isGuest}
                      className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm text-gray-700">Aktif</span>
                  </label>
                  <label className={`flex items-center gap-2 ${isGuest ? 'cursor-not-allowed' : 'cursor-pointer'} pointer-events-none`}>
                    <input
                      type="radio"
                      name="status"
                      value="0"
                      checked={statusAktif === 0}
                      onChange={() => setStatusAktif(0)}
                      disabled={isGuest}
                      className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm text-gray-700">Nonaktif</span>
                  </label>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  COA nonaktif tidak akan muncul di dropdown saat membuat transaksi.
                </p>
              </div>
            </div>

            {/* Form Actions */}
            {!isGuest && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3 rounded-b-lg">
                <button
                  type="button"
                  onClick={() => { resetForm(); onCancel(); }}
                  className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm bg-primary-700 hover:bg-primary-800 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Simpan
                    </>
                  )}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default COAFormPage;
