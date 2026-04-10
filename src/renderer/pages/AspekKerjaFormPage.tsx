import React, { useState, useEffect } from 'react';
import OfflineBanner from '../components/OfflineBanner';

interface AspekKerja {
  id: string;
  kode: string;
  nama: string;
  coa_id: string | null;
  jenis: string;
  status_aktif: number;
  created_at: string;
  updated_at: string;
}

interface COA {
  id: string;
  kode: string;
  nama: string;
  tipe: string;
  parent_id: string | null;
  status_aktif: number;
}

interface AspekKerjaFormPageProps {
  aspekKerja?: AspekKerja | null;
  onSave: () => void;
  onCancel: () => void;
  isGuest?: boolean;
}

const JENIS_OPTIONS = ['Debit', 'Kredit'];

const AspekKerjaFormPage: React.FC<AspekKerjaFormPageProps> = ({ aspekKerja, onSave, onCancel, isGuest = false }) => {
  const [kode, setKode] = useState('');
  const [nama, setNama] = useState('');
  const [coaId, setCoaId] = useState<string | null>(null);
  const [jenis, setJenis] = useState('Debit');
  const [statusAktif, setStatusAktif] = useState(1);
  const [availableCOA, setAvailableCOA] = useState<COA[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const isEditMode = !!aspekKerja;

  // Load available COA options
  useEffect(() => {
    const loadCOA = async () => {
      if (window.electronAPI) {
        const coa = await window.electronAPI.getActiveCOA();
        setAvailableCOA(coa);
      }
    };
    loadCOA();
  }, []);

  // Initialize form with existing data for edit mode
  useEffect(() => {
    if (aspekKerja) {
      setKode(aspekKerja.kode);
      setNama(aspekKerja.nama);
      setCoaId(aspekKerja.coa_id);
      setJenis(aspekKerja.jenis);
      setStatusAktif(aspekKerja.status_aktif);
    }
  }, [aspekKerja]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Kode validation
    if (!kode.trim()) {
      newErrors.kode = 'Kode harus diisi';
    }

    // Nama validation
    if (!nama.trim()) {
      newErrors.nama = 'Nama harus diisi';
    }

    // Jenis validation
    if (!JENIS_OPTIONS.includes(jenis)) {
      newErrors.jenis = 'Jenis tidak valid';
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

      if (isEditMode && aspekKerja) {
        // Update existing Aspek Kerja
        result = await window.electronAPI.updateAspekKerja(
          aspekKerja.id,
          nama.trim(),
          coaId,
          jenis,
          statusAktif
        );
      } else {
        // Create new Aspek Kerja
        result = await window.electronAPI.createAspekKerja(
          kode.trim(),
          nama.trim(),
          coaId,
          jenis,
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
      console.error('[AspekKerja Form] Submit error:', error);
      setSubmitError('Terjadi kesalahan saat menyimpan data');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckDuplicateKode = async () => {
    if (!kode.trim() || !window.electronAPI) return;

    const existing = await window.electronAPI.getAspekKerjaByKode(kode.trim());
    if (existing && (!isEditMode || existing.id !== aspekKerja?.id)) {
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
    setCoaId(null);
    setJenis('Debit');
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
                {isEditMode ? 'Edit Aspek Kerja' : 'Tambah Aspek Kerja Baru'}
              </h1>
            </div>
            <p className="text-sm text-gray-500 ml-8">
              {isEditMode ? `Mengedit data Aspek Kerja: ${aspekKerja?.kode}` : 'Masukkan data Aspek Kerja baru'}
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
              Aspek Kerja berhasil {isEditMode ? 'diupdate' : 'ditambahkan'}!
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
                  Kode Aspek Kerja <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={kode}
                  onChange={(e) => setKode(e.target.value)}
                  onBlur={handleCheckDuplicateKode}
                  disabled={isEditMode || isGuest}
                  placeholder="Contoh: AK-001, AK-002"
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
                  Nama Aspek Kerja <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  disabled={isGuest}
                  placeholder="Contoh: Pengumpulan TBS, Pengiriman CPO"
                  className={`w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${
                    errors.nama ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.nama && (
                  <p className="mt-1 text-xs text-red-500">{errors.nama}</p>
                )}
              </div>

              {/* COA Hubungan */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  COA Hubungan
                </label>
                <select
                  value={coaId || ''}
                  onChange={(e) => setCoaId(e.target.value || null)}
                  disabled={isGuest}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">-- Tidak Ada COA --</option>
                  {availableCOA.map((coa) => (
                    <option key={coa.id} value={coa.id}>
                      {coa.kode} - {coa.nama} ({coa.tipe})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-400">
                  Pilih COA yang terkait dengan aspek kerja ini. Kosongkan jika tidak ada COA terkait.
                </p>
              </div>

              {/* Jenis */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jenis <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-4">
                  {JENIS_OPTIONS.map((option) => (
                    <label
                      key={option}
                      className={`flex items-center gap-2 px-4 py-3 border rounded-lg cursor-pointer transition-colors ${
                        jenis === option
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-300 hover:bg-gray-50'
                      } ${isGuest ? 'cursor-not-allowed pointer-events-none' : ''}`}
                    >
                      <input
                        type="radio"
                        name="jenis"
                        value={option}
                        checked={jenis === option}
                        onChange={() => setJenis(option)}
                        disabled={isGuest}
                        className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500 disabled:cursor-not-allowed"
                      />
                      <span className="text-sm font-medium text-gray-700">{option}</span>
                    </label>
                  ))}
                </div>
                {errors.jenis && (
                  <p className="mt-1 text-xs text-red-500">{errors.jenis}</p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  Debit untuk transaksi yang menambah nilai, Kredit untuk transaksi yang mengurangi nilai.
                </p>
              </div>

              {/* Status Aktif */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <div className="flex items-center gap-4">
                  <label className={`flex items-center gap-2 ${isGuest ? 'cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}>
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
                  <label className={`flex items-center gap-2 ${isGuest ? 'cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}>
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
                  Aspek Kerja nonaktif tidak akan muncul di dropdown saat membuat transaksi.
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

export default AspekKerjaFormPage;
