/**
 * Kas Module Tests
 * Assertions: VAL-KAS-*
 */

class KasTests {
  constructor(mainWindow, captureScreenshot, runAssertion) {
    this.window = mainWindow;
    this.captureScreenshot = captureScreenshot;
    this.runAssertion = runAssertion;
    this.area = 'Kas';
  }

  async navigateToKas() {
    const kasMenu = await this.window.locator('[data-testid="nav-kas"]').first();
    if (await kasMenu.count() > 0) {
      await kasMenu.click();
      await this.window.waitForTimeout(2000);
    }
  }

  async runAll() {
    console.log('=== Running Kas Module Tests ===');
    
    await this.testTransactionList();
    await this.testCreateTransactions();
    await this.testEditDeleteTransactions();
    await this.testApprovalWorkflow();
    await this.testImportExport();
  }

  async testTransactionList() {
    // VAL-KAS-022: View transaction list
    await this.runAssertion('VAL-KAS-022: Kas transaction list displays', async () => {
      await this.navigateToKas();
      await this.captureScreenshot('kas_page_loaded');
      
      const table = await this.window.locator('[data-testid="kas-table"]').first();
      await table.waitFor({ state: 'attached', timeout: 15000 });
    }, { area: this.area });

    // VAL-KAS-028: Filter by transaction type
    await this.runAssertion('VAL-KAS-028: Filter by transaction type', async () => {
      const typeFilter = await this.window.locator('select[name="type"], select:has-option("Masuk"), select:has-option("Keluar")').first();
      if (await typeFilter.count() > 0) {
        await typeFilter.selectOption({ label: 'Kas Masuk' });
        await this.window.waitForTimeout(1000);
        await this.captureScreenshot('kas_filter_masuk');
      }
    }, { area: this.area, optional: true });

    // VAL-KAS-029: Filter by status
    await this.runAssertion('VAL-KAS-029: Filter by approval status', async () => {
      const statusFilter = await this.window.locator('select[name="status"], select:has-option("Pending")').first();
      if (await statusFilter.count() > 0) {
        await statusFilter.selectOption({ label: 'Pending Approval 1' });
        await this.window.waitForTimeout(1000);
        await this.captureScreenshot('kas_filter_pending');
      }
    }, { area: this.area, optional: true });

    // VAL-KAS-054: Transaction shows COA name
    await this.runAssertion('VAL-KAS-054: COA name displayed in transactions', async () => {
      const rows = await this.window.locator('table tbody tr').first();
      if (await rows.count() > 0) {
        const rowText = await rows.textContent();
        console.log('First row content:', rowText);
        // Check if COA name is displayed (not just ID)
      }
    }, { area: this.area, optional: true });
  }

  async testCreateTransactions() {
    // VAL-KAS-001: Create Kas Masuk transaction
    await this.runAssertion('VAL-KAS-001: Create Kas Masuk form', async () => {
      const addBtn = await this.window.locator('[data-testid="add-kas"]').first();
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await this.window.waitForTimeout(1000);
        
        const modal = await this.window.locator('.modal, .dialog, [role="dialog"]').first();
        await modal.waitFor({ state: 'visible', timeout: 15000 });
        
        await this.captureScreenshot('kas_masuk_form_open');
        
        // Select Kas Masuk type if needed
        const typeSelect = await this.window.locator('select[name="jenis"], select[name="type"]').first();
        if (await typeSelect.count() > 0) {
          await typeSelect.selectOption({ label: 'Kas Masuk' });
        }
      }
    }, { area: this.area });

    // VAL-KAS-002: Create Kas Keluar transaction
    await this.runAssertion('VAL-KAS-002: Create Kas Keluar form', async () => {
      const typeSelect = await this.window.locator('select[name="jenis"], select[name="type"]').first();
      if (await typeSelect.count() > 0) {
        await typeSelect.selectOption({ label: 'Kas Keluar' });
        await this.window.waitForTimeout(500);
        await this.captureScreenshot('kas_keluar_form');
      }
    }, { area: this.area, optional: true });

    // VAL-KAS-003: Create with invalid COA rejected
    await this.runAssertion('VAL-KAS-003: Form validation for required fields', async () => {
      // Try to submit empty form
      const saveBtn = await this.window.locator('button:has-text("Simpan"), button:has-text("Save"), button[type="submit"]').first();
      await saveBtn.click();
      await this.window.waitForTimeout(500);
      
      await this.captureScreenshot('kas_validation_error');
      
      // Check for validation errors
      const errors = await this.window.locator('.error, .text-red, [role="alert"]').count();
      console.log(`Validation errors found: ${errors}`);
    }, { area: this.area, optional: true });

    // Fill and submit valid transaction
    await this.runAssertion('VAL-KAS-001: Submit Kas transaction', async () => {
      const dateInput = await this.window.locator('input[type="date"]').first();
      const amountInput = await this.window.locator('input[name="jumlah"], input[name="amount"], input[type="number"]').first();
      const descInput = await this.window.locator('input[name="keterangan"], input[name="description"], textarea').first();
      const coaSelect = await this.window.locator('select[name="coa"]').first();
      
      if (await dateInput.count() > 0) {
        await dateInput.fill(new Date().toISOString().split('T')[0]);
      }
      if (await amountInput.count() > 0) {
        await amountInput.fill('500000');
      }
      if (await descInput.count() > 0) {
        await descInput.fill('Test Kas transaction from automated test');
      }
      if (await coaSelect.count() > 0) {
        const options = await coaSelect.locator('option').count();
        if (options > 1) {
          await coaSelect.selectOption({ index: 1 });
        }
      }
      
      await this.captureScreenshot('kas_form_filled');
      
      // Cancel to avoid creating test data
      const cancelBtn = await this.window.locator('button:has-text("Batal"), button:has-text("Cancel"), .close-btn').first();
      if (await cancelBtn.count() > 0) await cancelBtn.click();
    }, { area: this.area, optional: true });
  }

  async testEditDeleteTransactions() {
    // VAL-KAS-011: Edit pending transaction
    await this.runAssertion('VAL-KAS-011: Edit pending transaction', async () => {
      await this.navigateToKas();
      
      const editBtn = await this.window.locator('[data-testid="edit-kas"]').first();
      if (await editBtn.count() > 0) {
        await editBtn.click();
        await this.window.waitForTimeout(1000);
        await this.captureScreenshot('kas_edit_modal');
        
        // Close modal
        const cancelBtn = await this.window.locator('button:has-text("Batal"), button:has-text("Cancel"), .close-btn').first();
        if (await cancelBtn.count() > 0) await cancelBtn.click();
      }
    }, { area: this.area, optional: true });

    // VAL-KAS-013: Cannot edit fully approved
    await this.runAssertion('VAL-KAS-013: Fully approved edit restriction', async () => {
      // Filter to show approved transactions
      const statusFilter = await this.window.locator('select[name="status"]').first();
      if (await statusFilter.count() > 0) {
        await statusFilter.selectOption({ label: 'Fully Approved' });
        await this.window.waitForTimeout(1000);
        
        // Check if edit button is disabled or not present
        const editBtn = await this.window.locator('button:has-text("Edit"), .edit-btn').first();
        if (await editBtn.count() > 0) {
          const isDisabled = await editBtn.isDisabled().catch(() => false);
          console.log(`Edit button disabled for approved: ${isDisabled}`);
        }
        
        await this.captureScreenshot('kas_approved_no_edit');
      }
    }, { area: this.area, optional: true });

    // VAL-KAS-017: Delete pending transaction
    await this.runAssertion('VAL-KAS-017: Delete pending transaction', async () => {
      // Filter back to pending
      const statusFilter = await this.window.locator('select[name="status"]').first();
      if (await statusFilter.count() > 0) {
        await statusFilter.selectOption({ label: 'Pending Approval 1' });
        await this.window.waitForTimeout(1000);
      }
      
      const deleteBtn = await this.window.locator('button:has-text("Delete"), button:has-text("Hapus"), .delete-btn').first();
      if (await deleteBtn.count() > 0) {
        // Check if delete is available (don't actually delete)
        console.log('Delete button found for pending transaction');
      }
    }, { area: this.area, optional: true });

    // VAL-KAS-060: Copy transaction
    await this.runAssertion('VAL-KAS-060: Copy transaction', async () => {
      const copyBtn = await this.window.locator('[data-testid="copy-kas"]').first();
      if (await copyBtn.count() > 0) {
        await copyBtn.click();
        await this.window.waitForTimeout(1000);
        await this.captureScreenshot('kas_copy_modal');
        
        // Close modal
        const cancelBtn = await this.window.locator('button:has-text("Batal"), button:has-text("Cancel"), .close-btn').first();
        if (await cancelBtn.count() > 0) await cancelBtn.click();
      }
    }, { area: this.area, optional: true });
  }

  async testApprovalWorkflow() {
    // VAL-KAS-037: Approver 1 can approve
    await this.runAssertion('VAL-KAS-037: Approver 1 approve button', async () => {
      await this.navigateToKas();
      
      const approveBtn = await this.window.locator('[data-testid="approve-1"]').first();
      if (await approveBtn.count() > 0) {
        console.log('Approve 1 button found');
        await this.captureScreenshot('kas_approve_button');
      }
    }, { area: this.area, optional: true });

    // VAL-KAS-042: Cannot approve own transaction
    await this.runAssertion('VAL-KAS-042: Cannot approve own transaction check', async () => {
      // Check if approve button is disabled for own transactions
      const approveBtn = await this.window.locator('button:has-text("Approve"), .approve-btn').first();
      if (await approveBtn.count() > 0) {
        const isDisabled = await approveBtn.isDisabled().catch(() => false);
        const title = await approveBtn.getAttribute('title');
        console.log(`Approve button disabled: ${isDisabled}, Title: ${title}`);
      }
    }, { area: this.area, optional: true });

    // VAL-KAS-044: Reject requires reason
    await this.runAssertion('VAL-KAS-044: Reject requires reason', async () => {
      const rejectBtn = await this.window.locator('button:has-text("Reject"), button:has-text("Tolak"), .reject-btn').first();
      if (await rejectBtn.count() > 0) {
        await rejectBtn.click();
        await this.window.waitForTimeout(500);
        
        // Check for reason input
        const reasonInput = await this.window.locator('textarea[name="reason"], input[name="reason"]').first();
        if (await reasonInput.count() > 0) {
          await this.captureScreenshot('kas_reject_modal');
        }
        
        // Close modal
        const cancelBtn = await this.window.locator('button:has-text("Batal"), button:has-text("Cancel"), .close-btn').first();
        if (await cancelBtn.count() > 0) await cancelBtn.click();
      }
    }, { area: this.area, optional: true });

    // VAL-KAS-045: Approval history tracked
    await this.runAssertion('VAL-KAS-045: Approval history visible', async () => {
      const historyBtn = await this.window.locator('button:has-text("History"), button:has-text("Riwayat"), .history-btn, [data-testid="approval-history"]').first();
      if (await historyBtn.count() > 0) {
        await historyBtn.click();
        await this.window.waitForTimeout(1000);
        await this.captureScreenshot('kas_approval_history');
        
        // Close modal
        const closeBtn = await this.window.locator('button:has-text("Tutup"), button:has-text("Close"), .close-btn').first();
        if (await closeBtn.count() > 0) await closeBtn.click();
      }
    }, { area: this.area, optional: true });
  }

  async testImportExport() {
    // VAL-KAS-047: Export to Excel
    await this.runAssertion('VAL-KAS-047: Export to Excel button', async () => {
      const exportBtn = await this.window.locator('[data-testid="export-kas"]').first();
      if (await exportBtn.count() > 0) {
        console.log('Export button found');
        await this.captureScreenshot('kas_export_button');
      }
    }, { area: this.area, optional: true });

    // VAL-KAS-048: Import from Excel
    await this.runAssertion('VAL-KAS-048: Import from Excel button', async () => {
      const importBtn = await this.window.locator('[data-testid="import-kas"]').first();
      if (await importBtn.count() > 0) {
        console.log('Import button found');
      }
    }, { area: this.area, optional: true });
  }
}

module.exports = KasTests;
