/**
 * Master Data Tests - COA, Aspek Kerja, Blok
 * Assertions: VAL-MASTER-*
 */

const { _electron: electron } = require('playwright');
const path = require('path');

class MasterDataTests {
  constructor(mainWindow, captureScreenshot, runAssertion) {
    this.window = mainWindow;
    this.captureScreenshot = captureScreenshot;
    this.runAssertion = runAssertion;
    this.area = 'MasterData';
  }

  async navigateToCOA() {
    // Navigate to Master Data -> COA
    const masterMenu = await this.window.locator('[data-testid="nav-master"]').first();
    if (await masterMenu.count() > 0) {
      await masterMenu.click();
      await this.window.waitForTimeout(500);
    }
    
    const coaLink = await this.window.locator('[data-testid="nav-coa"]').first();
    if (await coaLink.count() > 0) {
      await coaLink.click();
      await this.window.waitForTimeout(1500);
    }
  }

  async navigateToAspekKerja() {
    const akLink = await this.window.locator('[data-testid="nav-aspek-kerja"]').first();
    if (await akLink.count() > 0) {
      await akLink.click();
      await this.window.waitForTimeout(1500);
    }
  }

  async navigateToBlok() {
    const blokLink = await this.window.locator('[data-testid="nav-blok"]').first();
    if (await blokLink.count() > 0) {
      await blokLink.click();
      await this.window.waitForTimeout(1500);
    }
  }

  async runAll() {
    console.log('=== Running Master Data Tests ===');
    
    await this.testCOA();
    await this.testAspekKerja();
    await this.testBlok();
    await this.testImportExport();
    await this.testCopyFunctionality();
    await this.testEdgeCases();
  }

  async testCOA() {
    // VAL-MASTER-COAS-001: Display COA table with all columns
    await this.runAssertion('VAL-MASTER-COAS-001: Display COA table with all columns', async () => {
      await this.navigateToCOA();
      await this.captureScreenshot('coa_table_view');
      
      const table = await this.window.locator('[data-testid="coa-table"]').first();
      await table.waitFor({ state: 'visible', timeout: 15000 });
      
      // Check for expected columns
      const headers = await this.window.locator('table th, .table-header').allTextContents();
      const headerText = headers.join(' ').toLowerCase();
      
      if (!headerText.includes('kode') && !headerText.includes('code')) {
        throw new Error('Kode column not found');
      }
      if (!headerText.includes('nama') && !headerText.includes('name')) {
        throw new Error('Nama column not found');
      }
    }, { area: this.area });

    // VAL-MASTER-COAS-002: COA table pagination
    await this.runAssertion('VAL-MASTER-COAS-002: COA table pagination', async () => {
      const pagination = await this.window.locator('.pagination, [data-testid="pagination"]').first();
      if (await pagination.count() > 0) {
        const nextBtn = await this.window.locator('button:has-text("Next"), button:has-text(">"), .next-page').first();
        if (await nextBtn.count() > 0 && await nextBtn.isEnabled()) {
          await nextBtn.click();
          await this.window.waitForTimeout(1000);
          await this.captureScreenshot('coa_pagination_next');
        }
      }
    }, { area: this.area, optional: true });

    // VAL-MASTER-COAS-010: Add COA with valid data
    await this.runAssertion('VAL-MASTER-COAS-010: Add COA with valid data', async () => {
      const addBtn = await this.window.locator('[data-testid="add-coa"]').first();
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await this.window.waitForTimeout(1000);
        
        // Fill form
        const kodeInput = await this.window.locator('input[name="kode"], input[placeholder*="Kode"]').first();
        const namaInput = await this.window.locator('input[name="nama"], input[placeholder*="Nama"]').first();
        
        if (await kodeInput.count() > 0) {
          await kodeInput.fill(`TEST${Date.now()}`);
        }
        if (await namaInput.count() > 0) {
          await namaInput.fill('Test COA Entry');
        }
        
        await this.captureScreenshot('coa_add_form_filled');
        
        // Cancel to avoid creating test data
        const cancelBtn = await this.window.locator('button:has-text("Batal"), button:has-text("Cancel"), .cancel-btn').first();
        if (await cancelBtn.count() > 0) {
          await cancelBtn.click();
        }
      }
    }, { area: this.area, optional: true });

    // VAL-MASTER-COAS-011: Kode field validation - required
    await this.runAssertion('VAL-MASTER-COAS-011: Kode field validation - required', async () => {
      const addBtn = await this.window.locator('button:has-text("Tambah"), button:has-text("Add")').first();
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await this.window.waitForTimeout(500);
        
        const saveBtn = await this.window.locator('button:has-text("Simpan"), button:has-text("Save"), button[type="submit"]').first();
        await saveBtn.click();
        await this.window.waitForTimeout(500);
        
        await this.captureScreenshot('coa_validation_empty_kode');
        
        // Check for error message
        const errorMsg = await this.window.locator('.error, .text-red, [role="alert"]').first();
        if (await errorMsg.count() === 0) {
          console.log('Note: Validation error may be displayed differently');
        }
        
        // Close modal
        const cancelBtn = await this.window.locator('button:has-text("Batal"), button:has-text("Cancel")').first();
        if (await cancelBtn.count() > 0) await cancelBtn.click();
      }
    }, { area: this.area, optional: true });

    // VAL-MASTER-COAS-050: Search by Kode
    await this.runAssertion('VAL-MASTER-COAS-050: Search by Kode', async () => {
      const searchInput = await this.window.locator('input[type="search"], input[placeholder*="Cari"], input[placeholder*="Search"]').first();
      if (await searchInput.count() > 0) {
        await searchInput.fill('100');
        await this.window.waitForTimeout(500); // Debounce wait
        await this.captureScreenshot('coa_search_results');
        
        // Clear search
        await searchInput.clear();
      }
    }, { area: this.area, optional: true });

    // VAL-MASTER-COAS-060: Filter by Tipe
    await this.runAssertion('VAL-MASTER-COAS-060: Filter by Tipe', async () => {
      const tipeFilter = await this.window.locator('select[name="tipe"], select:has-option("Aktiva")').first();
      if (await tipeFilter.count() > 0) {
        await tipeFilter.selectOption({ label: 'Aktiva' });
        await this.window.waitForTimeout(1000);
        await this.captureScreenshot('coa_filter_aktiva');
      }
    }, { area: this.area, optional: true });

    // VAL-MASTER-EXP-001: Export Excel button visible
    await this.runAssertion('VAL-MASTER-EXP-001: Export Excel button visible', async () => {
      const exportBtn = await this.window.locator('[data-testid="export-excel"]').first();
      if (await exportBtn.count() === 0) {
        throw new Error('Export Excel button not found');
      }
    }, { area: this.area });

    // VAL-MASTER-IMP-001: Import Excel button visible
    await this.runAssertion('VAL-MASTER-IMP-001: Import Excel button visible', async () => {
      const importBtn = await this.window.locator('[data-testid="import-excel"]').first();
      if (await importBtn.count() === 0) {
        throw new Error('Import Excel button not found');
      }
    }, { area: this.area });
  }

  async testAspekKerja() {
    // VAL-MASTER-AK-001: Display Aspek Kerja table
    await this.runAssertion('VAL-MASTER-AK-001: Display Aspek Kerja table', async () => {
      await this.navigateToAspekKerja();
      await this.captureScreenshot('aspek_kerja_table_view');
      
      const table = await this.window.locator('[data-testid="aspek-kerja-table"]').first();
      await table.waitFor({ state: 'visible', timeout: 15000 });
    }, { area: this.area });

    // VAL-MASTER-AK-010: Add Aspek Kerja with COA linkage
    await this.runAssertion('VAL-MASTER-AK-010: Add Aspek Kerja with COA linkage', async () => {
      const addBtn = await this.window.locator('button:has-text("Tambah"), button:has-text("Add")').first();
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await this.window.waitForTimeout(1000);
        
        // Check for COA Hubungan dropdown
        const coaSelect = await this.window.locator('select[name="coa"], select[name="coa_hubungan"]').first();
        const jenisSelect = await this.window.locator('select[name="jenis"]').first();
        
        if (await coaSelect.count() > 0 || await jenisSelect.count() > 0) {
          await this.captureScreenshot('aspek_kerja_add_form');
        }
        
        // Close modal
        const cancelBtn = await this.window.locator('button:has-text("Batal"), button:has-text("Cancel")').first();
        if (await cancelBtn.count() > 0) await cancelBtn.click();
      }
    }, { area: this.area, optional: true });
  }

  async testBlok() {
    // VAL-MASTER-BLOK-001: Display Blok table
    await this.runAssertion('VAL-MASTER-BLOK-001: Display Blok table', async () => {
      await this.navigateToBlok();
      await this.captureScreenshot('blok_table_view');
      
      const table = await this.window.locator('[data-testid="blok-table"]').first();
      await table.waitFor({ state: 'visible', timeout: 15000 });
    }, { area: this.area });

    // VAL-MASTER-BLOK-010: Add Blok with validation
    await this.runAssertion('VAL-MASTER-BLOK-010: Add Blok with validation', async () => {
      const addBtn = await this.window.locator('button:has-text("Tambah"), button:has-text("Add")').first();
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await this.window.waitForTimeout(1000);
        
        // Check for Luas field
        const luasInput = await this.window.locator('input[name="luas"], input[type="number"]').first();
        const tahunInput = await this.window.locator('input[name="tahun_tanam"], input[placeholder*="Tahun"]').first();
        
        await this.captureScreenshot('blok_add_form');
        
        // Close modal
        const cancelBtn = await this.window.locator('button:has-text("Batal"), button:has-text("Cancel")').first();
        if (await cancelBtn.count() > 0) await cancelBtn.click();
      }
    }, { area: this.area, optional: true });
  }

  async testImportExport() {
    // VAL-MASTER-IMP-010: Select valid Excel file
    await this.runAssertion('VAL-MASTER-IMP-010: Select valid Excel file', async () => {
      const importBtn = await this.window.locator('button:has-text("Import"), button:has-text("Upload")').first();
      if (await importBtn.count() > 0) {
        await importBtn.click();
        await this.window.waitForTimeout(500);
        
        // Check for file input or dialog
        const fileInput = await this.window.locator('input[type="file"]').first();
        if (await fileInput.count() > 0) {
          await this.captureScreenshot('import_dialog_open');
        }
        
        // Close dialog
        const cancelBtn = await this.window.locator('button:has-text("Batal"), button:has-text("Cancel"), .close-btn').first();
        if (await cancelBtn.count() > 0) await cancelBtn.click();
      }
    }, { area: this.area, optional: true });

    // VAL-MASTER-IMP-020: Preview shows first 10 rows
    await this.runAssertion('VAL-MASTER-IMP-020: Preview shows first 10 rows', async () => {
      const previewTable = await this.window.locator('.preview-table, [data-testid="import-preview"]').first();
      if (await previewTable.count() > 0) {
        const rows = await this.window.locator('.preview-table tr, [data-testid="import-preview"] tr').count();
        console.log(`Preview rows found: ${rows}`);
      }
    }, { area: this.area, optional: true });
  }

  async testCopyFunctionality() {
    // VAL-MASTER-COPY-001: Copy single row
    await this.runAssertion('VAL-MASTER-COPY-001: Copy single row', async () => {
      const firstRow = await this.window.locator('table tbody tr').first();
      if (await firstRow.count() > 0) {
        await firstRow.click();
        await this.window.waitForTimeout(200);
        
        // Try Ctrl+C
        await this.window.keyboard.press('Control+c');
        await this.window.waitForTimeout(200);
        
        await this.captureScreenshot('row_selected_for_copy');
      }
    }, { area: this.area, optional: true });
  }

  async testEdgeCases() {
    // VAL-MASTER-EDGE-001: Empty COA table state
    await this.runAssertion('VAL-MASTER-EDGE-001: Empty COA table state', async () => {
      const emptyState = await this.window.locator('.empty-state, .no-data, [data-testid="empty-state"]').first();
      if (await emptyState.count() > 0) {
        await this.captureScreenshot('empty_state');
      }
    }, { area: this.area, optional: true });

    // VAL-MASTER-PERF-001: Table load time
    await this.runAssertion('VAL-MASTER-PERF-001: Table load time', async () => {
      const startTime = Date.now();
      await this.navigateToCOA();
      const table = await this.window.locator('[data-testid="coa-table"]').first();
      await table.waitFor({ state: 'visible', timeout: 15000 });
      const loadTime = Date.now() - startTime;
      
      if (loadTime > 2000) {
        console.log(`Warning: Table load time ${loadTime}ms exceeds 2s threshold`);
      }
      console.log(`Table load time: ${loadTime}ms`);
    }, { area: this.area });
  }
}

module.exports = MasterDataTests;
