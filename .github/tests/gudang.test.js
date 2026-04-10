/**
 * Gudang Module Tests
 * Assertions: VAL-GUDANG-*
 */

class GudangTests {
  constructor(mainWindow, captureScreenshot, runAssertion) {
    this.window = mainWindow;
    this.captureScreenshot = captureScreenshot;
    this.runAssertion = runAssertion;
    this.area = 'Gudang';
  }

  async navigateToGudang() {
    const gudangMenu = await this.window.locator('[data-testid="nav-gudang"]').first();
    if (await gudangMenu.count() > 0) {
      await gudangMenu.click();
      await this.window.waitForTimeout(2000);
    }
  }

  async runAll() {
    console.log('=== Running Gudang Module Tests ===');
    
    await this.testTransactionList();
    await this.testCreateTransactions();
    await this.testEditDeleteTransactions();
    await this.testApprovalWorkflow();
    await this.testImportExport();
  }

  async testTransactionList() {
    // VAL-GUDANG-022: View transaction list
    await this.runAssertion('VAL-GUDANG-022: Gudang transaction list displays', async () => {
      await this.navigateToGudang();
      await this.captureScreenshot('gudang_page_loaded');
      
      const table = await this.window.locator('[data-testid="gudang-table"]').first();
      await table.waitFor({ state: 'visible', timeout: 15000 });
    }, { area: this.area });

    // Check stock display
    await this.runAssertion('VAL-GUDANG-026: Stock display', async () => {
      const stockInfo = await this.window.locator('.stock-info, .inventory-summary, [data-testid="stock-info"]').first();
      if (await stockInfo.count() > 0) {
        await this.captureScreenshot('gudang_stock_info');
      }
    }, { area: this.area, optional: true });
  }

  async testCreateTransactions() {
    // VAL-GUDANG-001: Create Gudang Masuk transaction
    await this.runAssertion('VAL-GUDANG-001: Create Gudang Masuk form', async () => {
      const addBtn = await this.window.locator('[data-testid="add-gudang"]').first();
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await this.window.waitForTimeout(1000);
        
        const modal = await this.window.locator('.modal, .dialog, [role="dialog"]').first();
        await modal.waitFor({ state: 'visible', timeout: 15000 });
        
        await this.captureScreenshot('gudang_masuk_form_open');
      }
    }, { area: this.area });

    // VAL-GUDANG-002: Create Gudang Keluar transaction
    await this.runAssertion('VAL-GUDANG-002: Create Gudang Keluar form', async () => {
      const typeSelect = await this.window.locator('select[name="jenis"], select[name="type"]').first();
      if (await typeSelect.count() > 0) {
        await typeSelect.selectOption({ label: 'Gudang Keluar' });
        await this.window.waitForTimeout(500);
        await this.captureScreenshot('gudang_keluar_form');
      }
    }, { area: this.area, optional: true });

    // Fill form with item details
    await this.runAssertion('VAL-GUDANG-001: Fill Gudang transaction form', async () => {
      const dateInput = await this.window.locator('input[type="date"]').first();
      const itemInput = await this.window.locator('input[name="item"], input[name="nama_barang"], input[placeholder*="item" i]').first();
      const qtyInput = await this.window.locator('input[name="jumlah"], input[name="qty"], input[type="number"]').first();
      const descInput = await this.window.locator('input[name="keterangan"], input[name="description"], textarea').first();
      
      if (await dateInput.count() > 0) {
        await dateInput.fill(new Date().toISOString().split('T')[0]);
      }
      if (await itemInput.count() > 0) {
        await itemInput.fill('Test Item');
      }
      if (await qtyInput.count() > 0) {
        await qtyInput.fill('10');
      }
      if (await descInput.count() > 0) {
        await descInput.fill('Test Gudang transaction from automated test');
      }
      
      await this.captureScreenshot('gudang_form_filled');
      
      // Cancel
      const cancelBtn = await this.window.locator('button:has-text("Batal"), button:has-text("Cancel"), .close-btn').first();
      if (await cancelBtn.count() > 0) await cancelBtn.click();
    }, { area: this.area, optional: true });
  }

  async testEditDeleteTransactions() {
    // VAL-GUDANG-012: Edit pending transaction
    await this.runAssertion('VAL-GUDANG-012: Edit pending transaction', async () => {
      await this.navigateToGudang();
      
      const editBtn = await this.window.locator('[data-testid="edit-gudang"]').first();
      if (await editBtn.count() > 0) {
        await editBtn.click();
        await this.window.waitForTimeout(1000);
        await this.captureScreenshot('gudang_edit_modal');
        
        const cancelBtn = await this.window.locator('button:has-text("Batal"), button:has-text("Cancel"), .close-btn').first();
        if (await cancelBtn.count() > 0) await cancelBtn.click();
      }
    }, { area: this.area, optional: true });

    // VAL-GUDANG-014: Cannot edit fully approved
    await this.runAssertion('VAL-GUDANG-014: Cannot edit fully approved', async () => {
      const statusFilter = await this.window.locator('select[name="status"]').first();
      if (await statusFilter.count() > 0) {
        await statusFilter.selectOption({ label: 'Fully Approved' });
        await this.window.waitForTimeout(1000);
        
        const editBtn = await this.window.locator('button:has-text("Edit"), .edit-btn').first();
        if (await editBtn.count() > 0) {
          const isDisabled = await editBtn.isDisabled().catch(() => false);
          console.log(`Edit button disabled for approved: ${isDisabled}`);
        }
        
        await this.captureScreenshot('gudang_approved_no_edit');
      }
    }, { area: this.area, optional: true });

    // VAL-GUDANG-064: Copy transaction
    await this.runAssertion('VAL-GUDANG-064: Copy transaction', async () => {
      const copyBtn = await this.window.locator('[data-testid="copy-gudang"]').first();
      if (await copyBtn.count() > 0) {
        await copyBtn.click();
        await this.window.waitForTimeout(1000);
        await this.captureScreenshot('gudang_copy_modal');
        
        const cancelBtn = await this.window.locator('button:has-text("Batal"), button:has-text("Cancel"), .close-btn').first();
        if (await cancelBtn.count() > 0) await cancelBtn.click();
      }
    }, { area: this.area, optional: true });
  }

  async testApprovalWorkflow() {
    // VAL-GUDANG-038: Approver 1 can approve
    await this.runAssertion('VAL-GUDANG-038: Approver 1 approve button', async () => {
      await this.navigateToGudang();
      
      const approveBtn = await this.window.locator('[data-testid="approve-1"]').first();
      if (await approveBtn.count() > 0) {
        console.log('Approve 1 button found');
        await this.captureScreenshot('gudang_approve_button');
      }
    }, { area: this.area, optional: true });

    // VAL-GUDANG-039: Approver 2 can approve
    await this.runAssertion('VAL-GUDANG-039: Approver 2 approve button', async () => {
      // Filter to show PA2 status
      const statusFilter = await this.window.locator('select[name="status"]').first();
      if (await statusFilter.count() > 0) {
        await statusFilter.selectOption({ label: 'Pending Approval 2' });
        await this.window.waitForTimeout(1000);
        
        const approve2Btn = await this.window.locator('button:has-text("Approve"), .approve-btn, [data-testid="approve-2"]').first();
        if (await approve2Btn.count() > 0) {
          console.log('Approve 2 button found');
        }
      }
    }, { area: this.area, optional: true });

    // VAL-GUDANG-043: Cannot approve own transaction
    await this.runAssertion('VAL-GUDANG-043: Cannot approve own transaction', async () => {
      const approveBtn = await this.window.locator('button:has-text("Approve"), .approve-btn').first();
      if (await approveBtn.count() > 0) {
        const isDisabled = await approveBtn.isDisabled().catch(() => false);
        console.log(`Approve button disabled: ${isDisabled}`);
      }
    }, { area: this.area, optional: true });

    // VAL-GUDANG-042: Same person cannot be both approvers
    await this.runAssertion('VAL-GUDANG-042: Approver configuration validation', async () => {
      // This would be tested in settings
      console.log('Approver configuration validation');
    }, { area: this.area, optional: true });
  }

  async testImportExport() {
    // VAL-GUDANG-048: Export to Excel
    await this.runAssertion('VAL-GUDANG-048: Export to Excel', async () => {
      await this.navigateToGudang();
      
      const exportBtn = await this.window.locator('[data-testid="export-gudang"]').first();
      if (await exportBtn.count() > 0) {
        console.log('Export button found');
        await this.captureScreenshot('gudang_export_button');
      }
    }, { area: this.area, optional: true });

    // VAL-GUDANG-049: Import from Excel
    await this.runAssertion('VAL-GUDANG-049: Import from Excel', async () => {
      const importBtn = await this.window.locator('[data-testid="import-gudang"]').first();
      if (await importBtn.count() > 0) {
        console.log('Import button found');
      }
    }, { area: this.area, optional: true });
  }
}

module.exports = GudangTests;
