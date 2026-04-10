import React, { useState, useEffect, useCallback } from 'react';
import OfflineBanner from '../components/OfflineBanner';

interface GudangTransaction {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: 'Gudang Masuk' | 'Gudang Keluar';
  amount: number;
  description: string;
  coa_id: string | null;
  aspek_kerja_id: string | null;
  blok_id: string | null;
  item_name: string | null;
  item_unit: string | null;
  status: 'Pending Approval 1' | 'Pending Approval 2' | 'Fully Approved' | 'Rejected';
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface COA {
  id: string;
  kode: string;
  nama: string;
}

interface AspekKerja {
  id: string;
  kode: string;
  nama: string;
}

interface Blok {
  id: string;
  kode_blok: string;
  nama: string;
}

interface CurrentUser {
  id: string;
  username: string;
  full_name: string;
  role: string;
}

interface GudangFormPageProps {
  transaction?: GudangTransaction | null;
  onSave: () => void;
  onCancel: () => void;
  currentUser?: CurrentUser | null;
  isGuest?: boolean;
}

const GudangFormPage: React.FC<GudangFormPageProps> = ({ transaction, onSave, onCancel, currentUser }) => {
  const isEdit = !!transaction;
  const [transactionType, setTransactionType] = useState<'Gudang Masuk' | 'Gudang Keluar'>(
    transaction?.transaction_type || 'Gudang Masuk'
  );
  const [transactionDate, setTransactionDate] = useState(
    transaction?.transaction_date || new Date().toISOString().split('T')[0]
  );
  const [amount, setAmount] = useState(transaction?.amount?.toString() || '');
  const [description, setDescription] = useState(transaction?.description || '');
  const [coaId, setCoaId] = useState<string>(transaction?.coa_id || '');
  const [aspekKerjaId, setAspekKerjaId] = useState<string>(transaction?.aspek_kerja_id || '');
  const [blokId, setBlokId] = useState<string>(transaction?.blok_id || '');
  const [itemName, setItemName] = useState(transaction?.item_name || '');
  const [itemUnit, setItemUnit] = useState(transaction?.item_unit || '');

  const [coaList, setCoaList] = useState<COA[]>([]);
  const [aspekKerjaList, setAspekKerjaList] = useState<AspekKerja[]>([]);
  const [blokList, setBlokList] = useState<Blok[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Load dropdown options
  const loadOptions = useCallback(async () => {
    if (window.electronAPI) {
      const [coa, aspek, blok] = await Promise.all([
        window.electronAPI.getGudangActiveCOA(),
        window.electronAPI.getGudangActiveAspekKerja(),
        window.electronAPI.getGudangActiveBlok(),
      ]);
      setCoaList(coa);
      setAspekKerjaList(aspek);
      setBlokList(blok);
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!transactionDate) {
      newErrors.transactionDate = 'Tanggal harus diisi';
    }

    if (!amount || amount.trim() === '') {
      newErrors.amount = 'Jumlah harus diisi';
    } else {
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        newErrors.amount = 'Jumlah harus angka positif';
      }
    }

    if (!itemName || itemName.trim() === '') {
      newErrors.itemName = 'Nama barang harus diisi';
    }

    if (!currentUser) {
      newErrors.general = 'User tidak ditemukan. Silakan login ulang.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (!validate()) return;
    if (!window.electronAPI || !currentUser) return;

    setIsSubmitting(true);

    try {
      const numAmount = parseFloat(amount);

      if (isEdit) {
        // Update existing transaction (local-first with sync queue)
        const result = await window.electronAPI.localFirstUpdateGudangTransaction(
          transaction.id,
          {
            transaction_date: transactionDate,
            amount: numAmount,
            description,
            coa_id: coaId || null,
            aspek_kerja_id: aspekKerjaId || null,
            blok_id: blokId || null,
            item_name: itemName || null,
            item_unit: itemUnit || null,
          },
          currentUser.id
        );

        if (result.success) {
          setSubmitSuccess('Transaksi berhasil diupdate');
          setTimeout(() => onSave(), 1500);
        } else {
          setSubmitError(result.message);
        }
      } else {
        // Create new transaction (local-first with sync queue)
        const result = await window.electronAPI.localFirstCreateGudangTransaction({
          transaction_type: transactionType,
          transaction_date: transactionDate,
          amount: numAmount,
          description,
          coa_id: coaId || null,
          aspek_kerja_id: aspekKerjaId || null,
          blok_id: blokId || null,
          item_name: itemName || null,
          item_unit: itemUnit || null,
          created_by: currentUser.id,
        });

        if (result.success) {
          setSubmitSuccess('Transaksi berhasil ditambahkan');
          setTimeout(() => onSave(), 1500);
        } else {
          setSubmitError(result.message);
        }
      }
    } catch (error) {
      console.error('[GUDANG] Submit error:', error);
      setSubmitError('Terjadi kesalahan saat menyimpan transaksi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return new Intl.NumberFormat('id-ID').format(num);
  };

  const resetForm = () => {
    setTransactionType('Gudang Masuk');
    setTransactionDate(new Date().toISOString().split('T')[0]);
    setAmount('');
    setDescription('');
    setCoaId('');
    setAspekKerjaId('');
    setBlokId('');
    setItemName('');
    setItemUnit('');
    setErrors({});
    setSubmitError('');
    setSubmitSuccess('');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              {isEdit ? 'Edit Transaksi Gudang' : 'Tambah Transaksi Gudang'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {isEdit 
                ? `Edit transaksi ${transaction?.transaction_number}` 
                : 'Tambah transaksi gudang masuk atau gudang keluar'}
            </p>
          </div>
          <button
            onClick={() => { resetForm(); onCancel(); }}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Batal
          </button>
        </div>
      </div>

      {/* Offline Banner */}
      <OfflineBanner />

      {/* Form */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg shadow max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Error/Success Messages */}
            {submitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {submitError}
              </div>
            )}
            {submitSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                {submitSuccess}
              </div>
            )}

            {/* Transaction Type - only for new transactions */}
            {!isEdit && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Jenis Transaksi <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setTransactionType('Gudang Masuk')}
                    className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      transactionType === 'Gudang Masuk'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                      </svg>
                      Gudang Masuk
                    </div>
                    <p className="text-xs mt-1 text-gray-500">Barang masuk gudang</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransactionType('Gudang Keluar')}
                    className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      transactionType === 'Gudang Keluar'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                      </svg>
                      Gudang Keluar
                    </div>
                    <p className="text-xs mt-1 text-gray-500">Barang keluar gudang</p>
                  </button>
                </div>
              </div>
            )}

            {/* Transaction Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tanggal Transaksi <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                  errors.transactionDate ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.transactionDate && (
                <p className="mt-1 text-xs text-red-500">{errors.transactionDate}</p>
              )}
            </div>

            {/* Item Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nama Barang <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                  errors.itemName ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Contoh: CPO, Kernel, TBS, Pupuk, dll"
              />
              {errors.itemName && (
                <p className="mt-1 text-xs text-red-500">{errors.itemName}</p>
              )}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Jumlah <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500">Rp</span>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => {
                    // Allow only numbers and dots
                    const val = e.target.value.replace(/[^0-9.]/g, '');
                    setAmount(val);
                  }}
                  onBlur={() => {
                    // Format on blur
                    if (amount) {
                      setAmount(parseFloat(amount).toString());
                    }
                  }}
                  className={`w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                    errors.amount ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0"
                />
              </div>
              {amount && !errors.amount && (
                <p className="mt-1 text-xs text-gray-500">
                  Terbilang: {formatCurrency(amount)}
                </p>
              )}
              {errors.amount && (
                <p className="mt-1 text-xs text-red-500">{errors.amount}</p>
              )}
            </div>

            {/* Item Unit */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unit
              </label>
              <input
                type="text"
                value={itemUnit}
                onChange={(e) => setItemUnit(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Contoh: Kg, Ton, Sack, dll"
              />
            </div>

            {/* COA */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                COA (Chart of Accounts)
              </label>
              <select
                value={coaId}
                onChange={(e) => setCoaId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">-- Pilih COA --</option>
                {coaList.map((coa) => (
                  <option key={coa.id} value={coa.id}>
                    {coa.kode} - {coa.nama}
                  </option>
                ))}
              </select>
            </div>

            {/* Aspek Kerja */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Aspek Kerja
              </label>
              <select
                value={aspekKerjaId}
                onChange={(e) => setAspekKerjaId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">-- Pilih Aspek Kerja --</option>
                {aspekKerjaList.map((ak) => (
                  <option key={ak.id} value={ak.id}>
                    {ak.kode} - {ak.nama}
                  </option>
                ))}
              </select>
            </div>

            {/* Blok */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Blok
              </label>
              <select
                value={blokId}
                onChange={(e) => setBlokId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">-- Pilih Blok --</option>
                {blokList.map((blok) => (
                  <option key={blok.id} value={blok.id}>
                    {blok.kode_blok} - {blok.nama}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Keterangan
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                rows={3}
                placeholder="Masukkan keterangan transaksi..."
              />
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm text-blue-800 font-medium">Informasi</p>
                  <ul className="text-xs text-blue-600 mt-1 space-y-1">
                    <li>• Transaksi baru akan berstatus &quot;Pending Approval 1&quot;</li>
                    <li>• Memerlukan 2 approver berbeda untuk status &quot;Fully Approved&quot;</li>
                    <li>• Transaksi belum di-approve tidak mempengaruhi stock gudang</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => { resetForm(); onCancel(); }}
                className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
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
                    {isEdit ? 'Update Transaksi' : 'Simpan Transaksi'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default GudangFormPage;
