import React, { useState, useEffect } from 'react';
import OfflineBanner from '../components/OfflineBanner';

interface Blok {
  id: string;
  kode_blok: string;
  nama: string;
  tahun_tanam: number;
  luas: number;
  status: string;
  keterangan: string | null;
  pokok: number | null;       // NEW
  sph: number | null;         // NEW
  bulan_tanam: string | null;  // NEW
  status_tanaman_2025: string | null; // Status for year 2025
  status_tanaman_2026: string | null; // Status for year 2026
  status_tanaman_2027: string | null; // Status for year 2027
  created_at: string;
  updated_at: string;
}

interface BlokFormPageProps {
  blok?: Blok | null;
  onSave: () => void;
  onCancel: () => void;
  isGuest?: boolean;
}

const STATUS_OPTIONS = [
  { value: 'TM', label: 'TM - Tanaman Menghasilkan' },
  { value: 'TBM-0', label: 'TBM-0 - Lahan sudah selesai dibuka, ditanami kacangan penutup tanah dan kelapa sawit sudah ditanam' },
  { value: 'TBM-1', label: 'TBM-1 - Usia 0-12 Bulan' },
  { value: 'TBM-2', label: 'TBM-2 - Usia 13-24 Bulan' },
  { value: 'TBM-3', label: 'TBM-3 - Usia 25-30 Bulan' },
];

const BlokFormPage: React.FC<BlokFormPageProps> = ({ blok, onSave, onCancel, isGuest = false }) => {
  const [kodeBlok, setKodeBlok] = useState('');
  const [nama, setNama] = useState('');
  const [tahunTanam, setTahunTanam] = useState<number>(new Date().getFullYear());
  const [luas, setLuas] = useState<string>('');
  const [status, setStatus] = useState<string>('TM');
  const [keterangan, setKeterangan] = useState<string>('');
  // New fields
  const [pokok, setPokok] = useState<string>('');
  const [sph, setSph] = useState<string>('');
  const [bulanTanam, setBulanTanam] = useState<string>('');
  const [statusTanaman2025, setStatusTanaman2025] = useState<string>('TM');
  const [statusTanaman2026, setStatusTanaman2026] = useState<string>('TM');
  const [statusTanaman2027, setStatusTanaman2027] = useState<string>('TM');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const isEditMode = !!blok;
  const currentYear = new Date().getFullYear();

  // Initialize form with existing data for edit mode
  useEffect(() => {
    if (blok) {
      setKodeBlok(blok.kode_blok);
      setNama(blok.nama);
      setTahunTanam(blok.tahun_tanam);
      setLuas(blok.luas.toString());
      setStatus(blok.status);
      setKeterangan(blok.keterangan || '');
      // New fields
      setPokok(blok.pokok?.toString() || '');
      setSph(blok.sph?.toString() || '');
      setBulanTanam(blok.bulan_tanam || '');
      setStatusTanaman2025(blok.status_tanaman_2025 || 'TM');
      setStatusTanaman2026(blok.status_tanaman_2026 || 'TM');
      setStatusTanaman2027(blok.status_tanaman_2027 || 'TM');
    }
  }, [blok]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Kode Blok validation
    if (!kodeBlok.trim()) {
      newErrors.kodeBlok = 'Kode Blok harus diisi';
    } else if (!/^[A-Za-z0-9-]+$/.test(kodeBlok.trim())) {
      newErrors.kodeBlok = 'Kode Blok hanya boleh berisi huruf, angka, dan tanda hubung';
    }

    // Nama validation
    if (!nama.trim()) {
      newErrors.nama = 'Nama harus diisi';
    }

    // Tahun Tanam validation (1900 to current year + 1)
    if (!tahunTanam) {
      newErrors.tahunTanam = 'Tahun Tanam harus diisi';
    } else if (tahunTanam < 1900 || tahunTanam > currentYear + 1) {
      newErrors.tahunTanam = `Tahun Tanam harus antara 1900 dan ${currentYear + 1}`;
    }

    // Luas validation (must be positive number)
    const luasNum = parseFloat(luas);
    if (!luas.trim()) {
      newErrors.luas = 'Luas harus diisi';
    } else if (isNaN(luasNum)) {
      newErrors.luas = 'Luas harus berupa angka';
    } else if (luasNum <= 0) {
      newErrors.luas = 'Luas harus lebih dari 0';
    }

    // Status validation
    if (!STATUS_OPTIONS.find((o) => o.value === status)) {
      newErrors.status = 'Status tidak valid';
    }

    // Status Tanaman validation (NEW)
    if (!STATUS_OPTIONS.find((o) => o.value === statusTanaman2025)) {
      newErrors.statusTanaman2025 = 'Status Tanaman 2025 tidak valid';
    }
    if (!STATUS_OPTIONS.find((o) => o.value === statusTanaman2026)) {
      newErrors.statusTanaman2026 = 'Status Tanaman 2026 tidak valid';
    }
    if (!STATUS_OPTIONS.find((o) => o.value === statusTanaman2027)) {
      newErrors.statusTanaman2027 = 'Status Tanaman 2027 tidak valid';
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
      const luasNum = parseFloat(luas);
      const pokokNum = pokok ? parseInt(pokok) : null;
      const sphNum = sph ? parseFloat(sph) : null;
      const result = await window.electronAPI.localFirstCreateBlok(
        kodeBlok.trim(),
        nama.trim(),
        tahunTanam,
        luasNum,
        status,
        keterangan.trim() || null,
        pokokNum,      // NEW
        sphNum,        // NEW
        bulanTanam.trim() || null,  // NEW
        statusTanaman2025,  // NEW
        statusTanaman2026,  // NEW
        statusTanaman2027   // NEW
      );

      if (result.success) {
        setSubmitSuccess(true);
        setTimeout(() => {
          onSave();
        }, 1000);
      } else {
        setSubmitError(result.message);
      }
    } catch (error) {
      console.error('[Blok Form] Submit error:', error);
      setSubmitError('Terjadi kesalahan saat menyimpan data');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    if (!window.electronAPI || !blok) return;

    setIsSubmitting(true);
    setSubmitError('');
    setSubmitSuccess(false);

    try {
      const luasNum = parseFloat(luas);
      const pokokNum = pokok ? parseInt(pokok) : null;
      const sphNum = sph ? parseFloat(sph) : null;
      const result = await window.electronAPI.localFirstUpdateBlok(
        blok.id,
        nama.trim(),
        tahunTanam,
        luasNum,
        status,
        keterangan.trim() || null,
        pokokNum,      // NEW
        sphNum,        // NEW
        bulanTanam.trim() || null,  // NEW
        statusTanaman2025,  // NEW
        statusTanaman2026,  // NEW
        statusTanaman2027   // NEW
      );

      if (result.success) {
        setSubmitSuccess(true);
        setTimeout(() => {
          onSave();
        }, 1000);
      } else {
        setSubmitError(result.message);
      }
    } catch (error) {
      console.error('[Blok Form] Update error:', error);
      setSubmitError('Terjadi kesalahan saat menyimpan data');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckDuplicateKode = async () => {
    if (!kodeBlok.trim() || !window.electronAPI) return;

    const existing = await window.electronAPI.getBlokByKode(kodeBlok.trim());
    if (existing && (!isEditMode || existing.id !== blok?.id)) {
      setErrors((prev) => ({
        ...prev,
        kodeBlok: 'Kode Blok sudah ada',
      }));
    } else {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.kodeBlok;
        return newErrors;
      });
    }
  };

  const handleLuasChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string or valid decimal numbers
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setLuas(value);
      // Clear error when user starts typing valid input
      if (errors.luas && (value !== '' && !isNaN(parseFloat(value)))) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors.luas;
          return newErrors;
        });
      }
    }
  };

  const resetForm = () => {
    setKodeBlok('');
    setNama('');
    setTahunTanam(new Date().getFullYear());
    setLuas('');
    setStatus('TM');
    setKeterangan('');
    setPokok('');
    setSph('');
    setBulanTanam('');
    setStatusTanaman2025('TM');
    setStatusTanaman2026('TM');
    setStatusTanaman2027('TM');
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
                {isEditMode ? 'Edit Blok' : 'Tambah Blok Baru'}
              </h1>
            </div>
            <p className="text-sm text-gray-500 ml-8">
              {isEditMode ? `Mengedit data Blok: ${blok?.kode_blok}` : 'Masukkan data Blok baru'}
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
              Blok berhasil {isEditMode ? 'diupdate' : 'ditambahkan'}!
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

          <form onSubmit={isEditMode ? handleUpdate : handleSubmit} className="bg-white rounded-lg shadow">
            <div className="p-6 space-y-6">
              {/* Kode Blok */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kode Blok <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={kodeBlok}
                  onChange={(e) => setKodeBlok(e.target.value)}
                  onBlur={handleCheckDuplicateKode}
                  disabled={isEditMode}
                  placeholder="Contoh: BLK-001, BLOK-A1"
                  className={`w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${
                    errors.kodeBlok ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.kodeBlok && (
                  <p className="mt-1 text-xs text-red-500">{errors.kodeBlok}</p>
                )}
                {isEditMode && (
                  <p className="mt-1 text-xs text-gray-400">Kode tidak dapat diubah saat edit</p>
                )}
              </div>

              {/* Nama */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Blok <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder="Contoh: Blok A1, Sektor Utara"
                  className={`w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                    errors.nama ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.nama && (
                  <p className="mt-1 text-xs text-red-500">{errors.nama}</p>
                )}
              </div>

              {/* Tahun Tanam */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tahun Tanam <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={tahunTanam}
                  onChange={(e) => setTahunTanam(parseInt(e.target.value) || 0)}
                  min={1900}
                  max={currentYear + 1}
                  placeholder={`1900 - ${currentYear + 1}`}
                  className={`w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                    errors.tahunTanam ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.tahunTanam && (
                  <p className="mt-1 text-xs text-red-500">{errors.tahunTanam}</p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  Masukkan tahun antara 1900 dan {currentYear + 1}
                </p>
              </div>

              {/* Luas */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Luas (Ha) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={luas}
                    onChange={handleLuasChange}
                    placeholder="Contoh: 25.50"
                    className={`w-full px-4 py-2 pr-12 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                      errors.luas ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-sm text-gray-500">
                    Ha
                  </span>
                </div>
                {errors.luas && (
                  <p className="mt-1 text-xs text-red-500">{errors.luas}</p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  Masukkan luas dalam hektar (Ha). Contoh: 25.50
                </p>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {STATUS_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-center justify-center px-4 py-3 border rounded-lg cursor-pointer transition-colors ${
                        status === option.value
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="status"
                        value={option.value}
                        checked={status === option.value}
                        onChange={() => setStatus(option.value)}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium text-gray-700">{option.label}</span>
                    </label>
                  ))}
                </div>
                {errors.status && (
                  <p className="mt-1 text-xs text-red-500">{errors.status}</p>
                )}
              </div>

              {/* Pokok */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pokok
                </label>
                <input
                  type="number"
                  value={pokok}
                  onChange={(e) => setPokok(e.target.value)}
                  placeholder="Contoh: 500"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Jumlah pokok tanaman. Kosongkan jika tidak ada.
                </p>
              </div>

              {/* SPH */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SPH
                </label>
                <input
                  type="text"
                  value={sph}
                  onChange={(e) => setSph(e.target.value)}
                  placeholder="Contoh: 136"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Jumlah tanaman per hektar. Kosongkan jika tidak ada.
                </p>
              </div>

              {/* Bulan Tanam */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bulan Tanam
                </label>
                <input
                  type="text"
                  value={bulanTanam}
                  onChange={(e) => setBulanTanam(e.target.value)}
                  placeholder="Contoh: Januari 2024"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Bulan dan tahun tanam. Kosongkan jika tidak ada.
                </p>
              </div>

              {/* Status Tanaman 2025 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status Tanaman 2025 <span className="text-red-500">*</span>
                </label>
                <select
                  value={statusTanaman2025}
                  onChange={(e) => setStatusTanaman2025(e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                    errors.statusTanaman2025 ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {errors.statusTanaman2025 && (
                  <p className="mt-1 text-xs text-red-500">{errors.statusTanaman2025}</p>
                )}
              </div>

              {/* Status Tanaman 2026 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status Tanaman 2026 <span className="text-red-500">*</span>
                </label>
                <select
                  value={statusTanaman2026}
                  onChange={(e) => setStatusTanaman2026(e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                    errors.statusTanaman2026 ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {errors.statusTanaman2026 && (
                  <p className="mt-1 text-xs text-red-500">{errors.statusTanaman2026}</p>
                )}
              </div>

              {/* Status Tanaman 2027 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status Tanaman 2027 <span className="text-red-500">*</span>
                </label>
                <select
                  value={statusTanaman2027}
                  onChange={(e) => setStatusTanaman2027(e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                    errors.statusTanaman2027 ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {errors.statusTanaman2027 && (
                  <p className="mt-1 text-xs text-red-500">{errors.statusTanaman2027}</p>
                )}
              </div>

              {/* Keterangan */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Keterangan
                </label>
                <textarea
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  rows={3}
                  placeholder="Contoh: Lokasi di kompleks A, sektor 1"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Keterangan opsional. Kosongkan jika tidak ada.
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

export default BlokFormPage;
