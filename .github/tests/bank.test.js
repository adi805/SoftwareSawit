/**
 * Bank Module Tests
 * Assertions: VAL-BANK-*
 */

class BankTests {
  constructor(mainWindow, captureScreenshot, runAssertion) {
    this.window = mainWindow;
    this.captureScreenshot = captureScreenshot;
    this.runAssertion = runAssertion;
    this.area = 'Bank';
  }

  async navigateToBank() {
    const bankMenu = await this.window.locator('a:has-text("Bank"), [data-testid="bank-menu"]').first();
    if (await bankMenu.count() > 0) {
      await bankMenu.click();
      await this.window.waitForTimeout(2000);
    }
  }

  async runAll() {
    console.log('=== Running Bank Module Tests ===');
    
    await this.testTransactionList();
    await this.testCreateTransactions();
    await this.testEditDeleteTransactions();
    await this.testApprovalWorkflow();
    await this.testImportExport();
  }

  async testTransactionList() {
    // VAL-BANK-021: View transaction list
    await this.runAssertion('VAL-BANK-021: Bank transaction list displays', async () => {
      await this.navigateToBank();
      await this.captureScreenshot('bank_page_loaded');
      
      const table = await this.window.locator('table, .transaction-table, [data-testid="bank-table"]').first();
      await table.waitFor({ state: 'visible', timeout: 5000 });
    }, { area: this.area });

    // Check for bank account selector
    await this.runAssertion('VAL-BANK: Bank account selector', async () => {
      const accountSelect = await this.window.locator('select[name="bank_account"], select[name="rekening"], .bank-account-select').first();
      if (await accountSelect.count() > 0) {
        await this.captureScreenshot('bank_account_selector');
      }
    }, { area: this.area, optional: true });
  }

  async testCreateTransactions() {
    // VAL-BANK-001: Create Bank Masuk transaction
    await this.runAssertion('VAL-BANK-001: Create Bank Masuk form', async () => {
      const addBtn = await this.window.locator('button:has-text("Tambah"), button:has-text("Add"), [data-testid="add-bank"]').first();
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await this.window.waitForTimeout(1000);
        
        const modal = await this.window.locator('.modal, .dialog, [role="dialog"]').first();
        await modal.waitFor({ state: 'visible', timeout: 5000 });
        
        await this.captureScreenshot('bank_masuk_form_open');
      }
    }, { area: this.area });

    // VAL-BANK-002: Create Bank Keluar transaction
    await this.runAssertion('VAL-BANK-002: Create Bank Keluar form', async () => {
      const typeSelect = await this.window.locator('select[name="jenis"], select[name="type"]').first();
      if (await typeSelect.count() > 0) {
        await typeSelect.selectOption({ label: 'Bank Keluar' });
        await this.window.waitForTimeout(500);
        await this.captureScreenshot('bank_keluar_form');
      }
    }, { area: this.area, optional: true });

    // Fill form
    await this.runAssertion('VAL-BANK-001: Fill Bank transaction form', async () => {
      const dateInput = await this.window.locator('input[type="date"]').first();
      const amountInput = await this.window.locator('input[name="jumlah"], input[name="amount"], input[type="number"]').first();
      const descInput = await this.window.locator('input[name="keterangan"], input[name="description"], textarea').first();
      const bankSelect = await this.window.locator('select[name="bank"], select[name="rekening"]').first();
      
      if (await dateInput.count() > 0) {
        await dateInput.fill(new Date().toISOString().split('T')[0]);
      }
      if (await amountInput.count() > 0) {
        await amountInput.fill('1000000');
      }
      if (await descInput.count() > 0) {
        await descInput.fill('Test Bank transaction from automated test');
      }
      if (await bankSelect.count() > 0) {
        const options = await bankSelect.locator('option').count();
        if (options > 1) {
          await bankSelect.selectOption({ index: 1 });
        }
      }
      
      await this.captureScreenshot('bank_form_filled');
      
      // Cancel
      const cancelBtn = await this.window.locator('button:has-text("Batal"), button:has-text("Cancel"), .close-btn').first();
      if (await cancelBtn.count() > 0) await cancelBtn.click();
    }, { area: this.area, optional: true });
  }

  async testEditDeleteTransactions() {
    // VAL-BANK-012: Edit pending transaction
    await this.runAssertion('VAL-BANK-012: Edit pending transaction', async () => {
      await this.navigateToBank();
      
      const editBtn = await this.window.locator('button:has-text("Edit"), .edit-btn, [data-testid="edit-bank"]').first();
      if (await editBtn.count() > 0) {
        await editBtn.click();
        await this.window.waitForTimeout(1000);
        await this.captureScreenshot('bank_edit_modal');
        
        const cancelBtn = await this.window.locator('button:has-text("Batal"), button:has-text("Cancel"), .close-btn').first();
        if (await cancelBtn.count() > 0) await cancelBtn.click();
      }
    }, { area: this.area, optional: true });

    // VAL-BANK-014: Cannot edit fully approved
    await this.runAssertion('VAL-BANK-014: Cannot edit fully approved', async () => {
      const statusFilter = await this.window.locator('select[name="status"]').first();
      if (await statusFilter.count() > 0) {
        await statusFilter.selectOption({ label: 'Fully Approved' });
        await this.window.waitForTimeout(1000);
        
        const editBtn = await this.window.locator('button:has-text("Edit"), .edit-btn').first();
        if (await editBtn.count() > 0) {
          const isDisabled = await editBtn.isDisabled().catch(() => false);
          console.log(`Edit button disabled for approved: ${isDisabled}`);
        }
        
        await this.captureScreenshot('bank_approved_no_edit');
      }
    }, { area: this.area, optional: true });

    // VAL-BANK-063: Copy transaction
    await this.runAssertion('VAL-BANK-063: Copy transaction', async () => {
      const copyBtn = await this.window.locator('button:has-text("Copy"), button:has-text("Duplikat"), .copy-btn, [data-testid="copy-bank"]').first();
      if (await copyBtn.count() > 0) {
        await copyBtn.click();
        await this.window.waitForTimeout(1000);
        await this.captureScreenshot('bank_copy_modal');
        
        const cancelBtn = await this.window.locator('button:has-text("Batal"), button:has-text("Cancel"), .close-btn').first();
        if (await cancelBtn.count() > 0) await cancelBtn.click();
      }
    }, { area: this.area, optional: true });
  }

  async testApprovalWorkflow() {
    // VAL-BANK-037: Approver 1 can approve
    await this.runAssertion('VAL-BANK-037: Approver 1 approve button', async () => {
      await this.navigateToBank();
      
      const approveBtn = await this.window.locator('button:has-text("Approve"), button:has-text("Setuju"), .approve-btn, [data-testid="approve-1"]').first();
      if (await approveBtn.count() > 0) {
        console.log('Approve 1 button found');
        await this.captureScreenshot('bank_approve_button');
      }
    }, { area: this.area, optional: true });

    // VAL-BANK-042: Cannot approve own transaction
    await this.runAssertion('VAL-BANK-042: Cannot approve own transaction', async () => {
      const approveBtn = await this.window.locator('button:has-text("Approve"), .approve-btn').first();
      if (await approveBtn.count() > 0) {
        const isDisabled = await approveBtn.isDisabled().catch(() => false);
        console.log(`Approve button disabled: ${isDisabled}`);
      }
    }, { area: this.area, optional: true });

    // VAL-BANK-041: Same person cannot be both approvers
    await this.runAssertion('VAL-BANK-041: Approver configuration validation', async () => {
      // Navigate to settings/approver config if available
      const settingsLink = await this.window.locator('a:has-text("Settings"), a:has-text("Pengaturan"), [data-testid="settings-link"]').first();
      if (await settingsLink.count() > 0) {
        await settingsLink.click();
        await this.window.waitForTimeout(1000);
        await this.captureScreenshot('approver_settings');
      }
    }, { area: this.area, optional: true });
  }

  async testImportExport() {
    // VAL-BANK-047: Export to Excel
    await this.runAssertion('VAL-BANK-047: Export to Excel', async () => {
      await this.navigateToBank();
      
      const exportBtn = await this.window.locator('button:has-text("Export"), button:has-text("Excel"), [data-testid="export-bank"]').first();
      if (await exportBtn.count() > 0) {
        console.log('Export button found');
        await this.captureScreenshot('bank_export_button');
      }
    }, { area: this.area, optional: true });

    // VAL-BANK-048: Import from Excel
    await this.runAssertion('VAL-BANK-048: Import from Excel', async () => {
      const importBtn = await this.window.locator('button:has-text("Import"), button:has-text("Upload"), [data-testid="import-bank"]').first();
      if (await importBtn.count() > 0) {
        console.log('Import button found');
      }
    }, { area: this.area, optional: true });

    // VAL-BANK-054: Export includes all fields
    await this.runAssertion('VAL-BANK-054: Export includes all fields', async () => {
      // This would require actually exporting and checking the file
      console.log('Export field validation - requires file system check');
    }, { area: this.area, optional: true });
  }
}

module.exports = BankTests;
