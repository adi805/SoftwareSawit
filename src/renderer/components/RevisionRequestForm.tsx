import React, { useState, useEffect, useCallback } from 'react';

export interface RevisionTransactionData {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: string;
  amount: number;
  description: string;
  coa_id: string | null;
  aspek_kerja_id: string | null;
  blok_id: string | null;
  // Module-specific fields
  bank_account?: string | null;
  item_name?: string | null;
  item_unit?: string | null;
  // Lookup fields
  coa_kode?: string;
  coa_nama?: string;
  aspek_kerja_kode?: string;
  aspek_kerja_nama?: string;
  blok_kode?: string;
  blok_nama?: string;
}

export interface RevisedField {
  field: string;
  label: string;
  originalValue: string;
  proposedValue: string;
  isChanged: boolean;
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

interface RevisionRequestFormProps {
  module: 'kas' | 'bank' | 'gudang';
  transaction: RevisionTransactionData;
  onSubmit: (revisionReason: string, proposedChanges: Partial<RevisionTransactionData>) => Promise<{ success: boolean; message: string }>;
  onCancel: () => void;
  isGuest?: boolean;
}

const RevisionRequestForm: React.FC<RevisionRequestFormProps> = ({
  module,
  transaction,
  onSubmit,
  onCancel,
  isGuest = false,
}) => {
  // Form state for proposed values
  const [transactionDate, setTransactionDate] = useState(transaction.transaction_date);
  const [transactionType, setTransactionType] = useState(transaction.transaction_type);
  const [amount, setAmount] = useState(transaction.amount.toString());
  const [description, setDescription] = useState(transaction.description);
  const [coaId, setCoaId] = useState<string>(transaction.coa_id || '');
  const [aspekKerjaId, setAspekKerjaId] = useState<string>(transaction.aspek_kerja_id || '');
  const [blokId, setBlokId] = useState<string>(transaction.blok_id || '');
  
  // Module-specific fields
  const [bankAccount, setBankAccount] = useState(transaction.bank_account || '');
  const [itemName, setItemName] = useState(transaction.item_name || '');
  const [itemUnit, setItemUnit] = useState(transaction.item_unit || '');

  // Dropdown options
  const [coaList, setCoaList] = useState<COA[]>([]);
  const [aspekKerjaList, setAspekKerjaList] = useState<AspekKerja[]>([]);
  const [blokList, setBlokList] = useState<Blok[]>([]);

  // Form state
  const [revisionReason, setRevisionReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Load dropdown options based on module
  const loadOptions = useCallback(async () => {
    if (!window.electronAPI) return;

    let coa: COA[], aspek: AspekKerja[], blok: Blok[];
    
    switch (module) {
      case 'kas':
        [coa, aspek, blok] = await Promise.all([
          window.electronAPI.getKasActiveCOA(),
          window.electronAPI.getKasActiveAspekKerja(),
          window.electronAPI.getKasActiveBlok(),
        ]);
        break;
      case 'bank':
        [coa, aspek, blok] = await Promise.all([
          window.electronAPI.getBankActiveCOA(),
          window.electronAPI.getBankActiveAspekKerja(),
          window.electronAPI.getBankActiveBlok(),
        ]);
        break;
      case 'gudang':
        [coa, aspek, blok] = await Promise.all([
          window.electronAPI.getGudangActiveCOA(),
          window.electronAPI.getGudangActiveAspekKerja(),
          window.electronAPI.getGudangActiveBlok(),
        ]);
        break;
    }

    setCoaList(coa);
    setAspekKerjaList(aspek);
    setBlokList(blok);
  }, [module]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  // Compute which fields have changed
  const getChangedFields = useCallback((): RevisedField[] => {
    const fields: RevisedField[] = [];

    // Transaction Date
    if (transactionDate !== transaction.transaction_date) {
      fields.push({
        field: 'transaction_date',
        label: 'Tanggal Transaksi',
        originalValue: transaction.transaction_date,
        proposedValue: transactionDate,
        isChanged: true,
      });
    }

    // Amount
    if (amount !== transaction.amount.toString()) {
      fields.push({
        field: 'amount',
        label: 'Jumlah',
        originalValue: formatCurrency(transaction.amount),
        proposedValue: formatCurrency(parseFloat(amount) || 0),
        isChanged: true,
      });
    }

    // Description
    if (description !== transaction.description) {
      fields.push({
        field: 'description',
        label: 'Keterangan',
        originalValue: transaction.description || '-',
        proposedValue: description || '-',
        isChanged: true,
      });
    }

    // COA
    if (coaId !== (transaction.coa_id || '')) {
      const originalCoa = coaList.find(c => c.id === transaction.coa_id);
      const proposedCoa = coaList.find(c => c.id === coaId);
      fields.push({
        field: 'coa_id',
        label: 'COA',
        originalValue: originalCoa ? `${originalCoa.kode} - ${originalCoa.nama}` : '-',
        proposedValue: proposedCoa ? `${proposedCoa.kode} - ${proposedCoa.nama}` : '-',
        isChanged: true,
      });
    }

    // Aspek Kerja
    if (aspekKerjaId !== (transaction.aspek_kerja_id || '')) {
      const originalAspek = aspekKerjaList.find(a => a.id === transaction.aspek_kerja_id);
      const proposedAspek = aspekKerjaList.find(a => a.id === aspekKerjaId);
      fields.push({
        field: 'aspek_kerja_id',
        label: 'Aspek Kerja',
        originalValue: originalAspek ? `${originalAspek.kode} - ${originalAspek.nama}` : '-',
        proposedValue: proposedAspek ? `${proposedAspek.kode} - ${proposedAspek.nama}` : '-',
        isChanged: true,
      });
    }

    // Blok
    if (blokId !== (transaction.blok_id || '')) {
      const originalBlok = blokList.find(b => b.id === transaction.blok_id);
      const proposedBlok = blokList.find(b => b.id === blokId);
      fields.push({
        field: 'blok_id',
        label: 'Blok',
        originalValue: originalBlok ? `${originalBlok.kode_blok} - ${originalBlok.nama}` : '-',
        proposedValue: proposedBlok ? `${proposedBlok.kode_blok} - ${proposedBlok.nama}` : '-',
        isChanged: true,
      });
    }

    // Module-specific fields
    if (module === 'bank' && bankAccount !== (transaction.bank_account || '')) {
      fields.push({
        field: 'bank_account',
        label: 'Bank Account',
        originalValue: transaction.bank_account || '-',
        proposedValue: bankAccount || '-',
        isChanged: true,
      });
    }

    if (module === 'gudang') {
      if (itemName !== (transaction.item_name || '')) {
        fields.push({
          field: 'item_name',
          label: 'Nama Item',
          originalValue: transaction.item_name || '-',
          proposedValue: itemName || '-',
          isChanged: true,
        });
      }
      if (itemUnit !== (transaction.item_unit || '')) {
        fields.push({
          field: 'item_unit',
          label: 'Unit',
          originalValue: transaction.item_unit || '-',
          proposedValue: itemUnit || '-',
          isChanged: true,
        });
      }
    }

    return fields;
  }, [
    transactionDate, transaction, amount, description, coaId, aspekKerjaId, blokId,
    bankAccount, itemName, itemUnit, module, coaList, aspekKerjaList, blokList
  ]);

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Revision reason is required
    if (!revisionReason.trim()) {
      newErrors.revisionReason = 'Alasan revisi harus diisi';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (!validate()) return;

    const changedFields = getChangedFields();
    if (changedFields.length === 0) {
      setSubmitError('Tidak ada perubahan yang diajukan');
      return;
    }

    setIsSubmitting(true);

    try {
      const proposedChanges: Partial<RevisionTransactionData> = {
        transaction_date: transactionDate,
        amount: parseFloat(amount) || 0,
        description,
        coa_id: coaId || null,
        aspek_kerja_id: aspekKerjaId || null,
        blok_id: blokId || null,
      };

      if (module === 'bank') {
        proposedChanges.bank_account = bankAccount || null;
      }

      if (module === 'gudang') {
        proposedChanges.item_name = itemName || null;
        proposedChanges.item_unit = itemUnit || null;
      }

      const result = await onSubmit(revisionReason.trim(), proposedChanges);

      if (result.success) {
        setSubmitSuccess('Permintaan revisi berhasil diajukan');
        setTimeout(() => onCancel(), 1500);
      } else {
        setSubmitError(result.message);
      }
    } catch (error) {
      console.error('[Revision] Submit error:', error);
      setSubmitError('Terjadi kesalahan saat mengajukan permintaan revisi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const changedFields = getChangedFields();
  const hasChanges = changedFields.length > 0;

  const getModuleLabel = () => {
    switch (module) {
      case 'kas': return 'Kas';
      case 'bank': return 'Bank';
      case 'gudang': return 'Gudang';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              Ajukan Revisi Transaksi
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {getModuleLabel()} — {transaction.transaction_number}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Batal
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto">
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

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm text-blue-800 font-medium">Informasi</p>
                <ul className="text-xs text-blue-600 mt-1 space-y-1">
                  <li>• Revisi hanya dapat diajukan untuk transaksi dengan status &quot;Fully Approved&quot;</li>
                  <li>• Revisi memerlukan persetujuan dari 2 approver</li>
                  <li>• Perubahan tidak berlaku langsung - harus melalui proses approval</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Diff View - Side by Side Comparison */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">Perbandingan Nilai</h2>
              <p className="text-sm text-gray-500">Bandingkan nilai lama dan baru di bawah ini</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-8">
                {/* Original Values */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
                    Nilai Lama (Saat Ini)
                  </h3>
                  <div className="space-y-3">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Tanggal</p>
                      <p className="text-sm font-medium text-gray-800">{transaction.transaction_date}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Jenis</p>
                      <p className="text-sm font-medium text-gray-800">{transaction.transaction_type}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Jumlah</p>
                      <p className="text-sm font-medium text-gray-800">{formatCurrency(transaction.amount)}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Keterangan</p>
                      <p className="text-sm font-medium text-gray-800">{transaction.description || '-'}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">COA</p>
                      <p className="text-sm font-medium text-gray-800">
                        {transaction.coa_kode ? `${transaction.coa_kode} - ${transaction.coa_nama}` : '-'}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Aspek Kerja</p>
                      <p className="text-sm font-medium text-gray-800">
                        {transaction.aspek_kerja_kode ? `${transaction.aspek_kerja_kode} - ${transaction.aspek_kerja_nama}` : '-'}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Blok</p>
                      <p className="text-sm font-medium text-gray-800">
                        {transaction.blok_kode ? `${transaction.blok_kode} - ${transaction.blok_nama}` : '-'}
                      </p>
                    </div>
                    {module === 'bank' && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">Bank Account</p>
                        <p className="text-sm font-medium text-gray-800">{transaction.bank_account || '-'}</p>
                      </div>
                    )}
                    {module === 'gudang' && (
                      <>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">Nama Item</p>
                          <p className="text-sm font-medium text-gray-800">{transaction.item_name || '-'}</p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">Unit</p>
                          <p className="text-sm font-medium text-gray-800">{transaction.item_unit || '-'}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Proposed Values */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
                    Nilai Baru (Yang Diusulkan)
                  </h3>
                  <div className="space-y-3">
                    <div className={`p-3 rounded-lg ${
                      transactionDate !== transaction.transaction_date 
                        ? 'bg-yellow-50 border border-yellow-300' 
                        : 'bg-gray-50'
                    }`}>
                      <p className="text-xs text-gray-500">Tanggal</p>
                      <input
                        type="date"
                        value={transactionDate}
                        onChange={(e) => setTransactionDate(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                      {transactionDate !== transaction.transaction_date && (
                        <p className="text-xs text-yellow-600 mt-1">← Berubah</p>
                      )}
                    </div>
                    <div className={`p-3 rounded-lg ${
                      transactionType !== transaction.transaction_type 
                        ? 'bg-yellow-50 border border-yellow-300' 
                        : 'bg-gray-50'
                    }`}>
                      <p className="text-xs text-gray-500">Jenis</p>
                      <select
                        value={transactionType}
                        onChange={(e) => setTransactionType(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      >
                        {module === 'kas' && (
                          <>
                            <option value="Kas Masuk">Kas Masuk</option>
                            <option value="Kas Keluar">Kas Keluar</option>
                          </>
                        )}
                        {module === 'bank' && (
                          <>
                            <option value="Bank Masuk">Bank Masuk</option>
                            <option value="Bank Keluar">Bank Keluar</option>
                          </>
                        )}
                        {module === 'gudang' && (
                          <>
                            <option value="Gudang Masuk">Gudang Masuk</option>
                            <option value="Gudang Keluar">Gudang Keluar</option>
                          </>
                        )}
                      </select>
                      {transactionType !== transaction.transaction_type && (
                        <p className="text-xs text-yellow-600 mt-1">← Berubah</p>
                      )}
                    </div>
                    <div className={`p-3 rounded-lg ${
                      amount !== transaction.amount.toString() 
                        ? 'bg-yellow-50 border border-yellow-300' 
                        : 'bg-gray-50'
                    }`}>
                      <p className="text-xs text-gray-500">Jumlah</p>
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">Rp</span>
                        <input
                          type="text"
                          value={amount}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            setAmount(val);
                          }}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          placeholder="0"
                        />
                      </div>
                      {amount !== transaction.amount.toString() && (
                        <p className="text-xs text-yellow-600 mt-1">← Berubah</p>
                      )}
                    </div>
                    <div className={`p-3 rounded-lg ${
                      description !== transaction.description 
                        ? 'bg-yellow-50 border border-yellow-300' 
                        : 'bg-gray-50'
                    }`}>
                      <p className="text-xs text-gray-500">Keterangan</p>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        rows={2}
                        placeholder="Masukkan keterangan..."
                      />
                      {description !== transaction.description && (
                        <p className="text-xs text-yellow-600 mt-1">← Berubah</p>
                      )}
                    </div>
                    <div className={`p-3 rounded-lg ${
                      coaId !== (transaction.coa_id || '') 
                        ? 'bg-yellow-50 border border-yellow-300' 
                        : 'bg-gray-50'
                    }`}>
                      <p className="text-xs text-gray-500">COA</p>
                      <select
                        value={coaId}
                        onChange={(e) => setCoaId(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      >
                        <option value="">-- Pilih COA --</option>
                        {coaList.map((coa) => (
                          <option key={coa.id} value={coa.id}>
                            {coa.kode} - {coa.nama}
                          </option>
                        ))}
                      </select>
                      {coaId !== (transaction.coa_id || '') && (
                        <p className="text-xs text-yellow-600 mt-1">← Berubah</p>
                      )}
                    </div>
                    <div className={`p-3 rounded-lg ${
                      aspekKerjaId !== (transaction.aspek_kerja_id || '') 
                        ? 'bg-yellow-50 border border-yellow-300' 
                        : 'bg-gray-50'
                    }`}>
                      <p className="text-xs text-gray-500">Aspek Kerja</p>
                      <select
                        value={aspekKerjaId}
                        onChange={(e) => setAspekKerjaId(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      >
                        <option value="">-- Pilih Aspek Kerja --</option>
                        {aspekKerjaList.map((ak) => (
                          <option key={ak.id} value={ak.id}>
                            {ak.kode} - {ak.nama}
                          </option>
                        ))}
                      </select>
                      {aspekKerjaId !== (transaction.aspek_kerja_id || '') && (
                        <p className="text-xs text-yellow-600 mt-1">← Berubah</p>
                      )}
                    </div>
                    <div className={`p-3 rounded-lg ${
                      blokId !== (transaction.blok_id || '') 
                        ? 'bg-yellow-50 border border-yellow-300' 
                        : 'bg-gray-50'
                    }`}>
                      <p className="text-xs text-gray-500">Blok</p>
                      <select
                        value={blokId}
                        onChange={(e) => setBlokId(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      >
                        <option value="">-- Pilih Blok --</option>
                        {blokList.map((blok) => (
                          <option key={blok.id} value={blok.id}>
                            {blok.kode_blok} - {blok.nama}
                          </option>
                        ))}
                      </select>
                      {blokId !== (transaction.blok_id || '') && (
                        <p className="text-xs text-yellow-600 mt-1">← Berubah</p>
                      )}
                    </div>
                    {module === 'bank' && (
                      <div className={`p-3 rounded-lg ${
                        bankAccount !== (transaction.bank_account || '') 
                          ? 'bg-yellow-50 border border-yellow-300' 
                          : 'bg-gray-50'
                      }`}>
                        <p className="text-xs text-gray-500">Bank Account</p>
                        <input
                          type="text"
                          value={bankAccount}
                          onChange={(e) => setBankAccount(e.target.value)}
                          className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          placeholder="Masukkan nomor rekening..."
                        />
                        {bankAccount !== (transaction.bank_account || '') && (
                          <p className="text-xs text-yellow-600 mt-1">← Berubah</p>
                        )}
                      </div>
                    )}
                    {module === 'gudang' && (
                      <>
                        <div className={`p-3 rounded-lg ${
                          itemName !== (transaction.item_name || '') 
                            ? 'bg-yellow-50 border border-yellow-300' 
                            : 'bg-gray-50'
                        }`}>
                          <p className="text-xs text-gray-500">Nama Item</p>
                          <input
                            type="text"
                            value={itemName}
                            onChange={(e) => setItemName(e.target.value)}
                            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            placeholder="Masukkan nama item..."
                          />
                          {itemName !== (transaction.item_name || '') && (
                            <p className="text-xs text-yellow-600 mt-1">← Berubah</p>
                          )}
                        </div>
                        <div className={`p-3 rounded-lg ${
                          itemUnit !== (transaction.item_unit || '') 
                            ? 'bg-yellow-50 border border-yellow-300' 
                            : 'bg-gray-50'
                        }`}>
                          <p className="text-xs text-gray-500">Unit</p>
                          <input
                            type="text"
                            value={itemUnit}
                            onChange={(e) => setItemUnit(e.target.value)}
                            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            placeholder="Masukkan unit..."
                          />
                          {itemUnit !== (transaction.item_unit || '') && (
                            <p className="text-xs text-yellow-600 mt-1">← Berubah</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Changed Fields Summary */}
          {hasChanges && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-medium text-yellow-800">
                  {changedFields.length} field(s) changed
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {changedFields.map((field) => (
                  <span
                    key={field.field}
                    className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded"
                  >
                    {field.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Revision Reason - Required */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Alasan Revisi <span className="text-red-500">*</span>
            </h3>
            <textarea
              value={revisionReason}
              onChange={(e) => setRevisionReason(e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                errors.revisionReason ? 'border-red-500' : 'border-gray-300'
              }`}
              rows={4}
              placeholder="Jelaskan alasan perubahan yang diajukan. Ini akan membantu approver dalam menilai revisi..."
              required
            />
            {errors.revisionReason && (
              <p className="mt-2 text-sm text-red-500">{errors.revisionReason}</p>
            )}
            <p className="mt-2 text-xs text-gray-500">
              Wajib diisi. Minimal beberapa karakter yang menjelaskan alasan revisi.
            </p>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isGuest}
              className="px-6 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Mengajukan...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Ajukan Revisi
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RevisionRequestForm;
