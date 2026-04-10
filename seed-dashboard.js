(async () => {
  const api = window.electronAPI;
  const results = [];
  
  const kasTx = await api.createKasTransaction({
    transaction_type: 'Kas Masuk',
    transaction_date: '2026-04-08',
    amount: 1500000,
    description: 'Test Kas transaction for dashboard',
    coa_id: null,
    aspek_kerja_id: null,
    blok_id: null,
    created_by: 'admin'
  });
  results.push({ module: 'kas', result: kasTx });
  
  const bankTx = await api.createBankTransaction({
    transaction_type: 'Bank Masuk',
    transaction_date: '2026-04-08',
    amount: 2500000,
    description: 'Test Bank transaction for dashboard',
    coa_id: null,
    aspek_kerja_id: null,
    blok_id: null,
    bank_account: 'BCA',
    created_by: 'admin'
  });
  results.push({ module: 'bank', result: bankTx });
  
  const gudangTx = await api.createGudangTransaction({
    transaction_type: 'Gudang Masuk',
    transaction_date: '2026-04-08',
    amount: 500000,
    description: 'Test Gudang transaction for dashboard',
    coa_id: null,
    aspek_kerja_id: null,
    blok_id: null,
    item_name: 'Pupuk',
    item_unit: 'kg',
    created_by: 'admin'
  });
  results.push({ module: 'gudang', result: gudangTx });
  
  return JSON.stringify(results);
})()
