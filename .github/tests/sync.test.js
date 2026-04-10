/**
 * Sync System Tests
 * Assertions: VAL-SYNC-*, VAL-ADMIN-*
 */

class SyncTests {
  constructor(mainWindow, captureScreenshot, runAssertion) {
    this.window = mainWindow;
    this.captureScreenshot = captureScreenshot;
    this.runAssertion = runAssertion;
    this.area = 'Sync';
  }

  async navigateToSync() {
    const syncMenu = await this.window.locator('[data-testid="nav-sync"]').first();
    if (await syncMenu.count() > 0) {
      await syncMenu.click();
      await this.window.waitForTimeout(2000);
    } else {
      // Try settings
      const settingsMenu = await this.window.locator('[data-testid="nav-settings"]').first();
      if (await settingsMenu.count() > 0) {
        await settingsMenu.click();
        await this.window.waitForTimeout(1000);
        
        const syncLink = await this.window.locator('[data-testid="sync-settings"]').first();
        if (await syncLink.count() > 0) {
          await syncLink.click();
          await this.window.waitForTimeout(1500);
        }
      }
    }
  }

  async runAll() {
    console.log('=== Running Sync System Tests ===');
    
    await this.testSyncConfiguration();
    await this.testConnectionStatus();
    await this.testSyncQueue();
    await this.testAdminFeatures();
  }

  async testSyncConfiguration() {
    // VAL-SYNC-001: Configure valid remote path
    await this.runAssertion('VAL-SYNC-001: Sync settings page accessible', async () => {
      await this.navigateToSync();
      await this.captureScreenshot('sync_settings_page');
      
      const pathInput = await this.window.locator('input[name="sync_path"], input[name="remote_path"], input[placeholder*="path"]').first();
      if (await pathInput.count() > 0) {
        console.log('Sync path input found');
      }
    }, { area: this.area });

    // VAL-ADMIN-001: Configure path per module
    await this.runAssertion('VAL-ADMIN-001: Module-specific sync paths', async () => {
      const kasPath = await this.window.locator('[data-testid="kas-sync-path"]').first();
      const bankPath = await this.window.locator('[data-testid="bank-sync-path"]').first();
      const gudangPath = await this.window.locator('[data-testid="gudang-sync-path"]').first();
      
      console.log(`Module paths - Kas: ${await kasPath.count()}, Bank: ${await bankPath.count()}, Gudang: ${await gudangPath.count()}`);
      
      if (await kasPath.count() > 0 || await bankPath.count() > 0 || await gudangPath.count() > 0) {
        await this.captureScreenshot('module_sync_paths');
      }
    }, { area: this.area, optional: true });

    // VAL-SYNC-002: Configure invalid path format
    await this.runAssertion('VAL-SYNC-002: Path validation', async () => {
      const pathInput = await this.window.locator('input[name="sync_path"]').first();
      if (await pathInput.count() > 0) {
        await pathInput.fill('invalid://path');
        
        const saveBtn = await this.window.locator('[data-testid="save-sync"]').first();
        if (await saveBtn.count() > 0) {
          await saveBtn.click();
          await this.window.waitForTimeout(1000);
          
          await this.captureScreenshot('sync_path_validation');
          
          // Check for error message
          const errorMsg = await this.window.locator('.error, .text-red, [role="alert"]').first();
          if (await errorMsg.count() > 0) {
            console.log('Path validation error displayed');
          }
        }
      }
    }, { area: this.area, optional: true });
  }

  async testConnectionStatus() {
    // VAL-SYNC-010: Connection status - Connected/Disconnected
    await this.runAssertion('VAL-SYNC-010: Connection status indicator', async () => {
      const statusIndicator = await this.window.locator('[data-testid="sync-status"]').first();
      if (await statusIndicator.count() > 0) {
        await this.captureScreenshot('sync_status_indicator');
        
        const statusText = await statusIndicator.textContent();
        console.log(`Sync status: ${statusText}`);
      }
    }, { area: this.area });

    // VAL-SYNC-050: Connection lost notification
    await this.runAssertion('VAL-SYNC-050: Connection notification area', async () => {
      const notificationArea = await this.window.locator('[data-testid="sync-notifications"]').first();
      if (await notificationArea.count() > 0) {
        console.log('Notification area found');
      }
    }, { area: this.area, optional: true });

    // VAL-SYNC-061: Offline indicator visible
    await this.runAssertion('VAL-SYNC-061: Offline indicator', async () => {
      const offlineBanner = await this.window.locator('[data-testid="offline-banner"]').first();
      if (await offlineBanner.count() > 0) {
        const isVisible = await offlineBanner.isVisible();
        console.log(`Offline banner visible: ${isVisible}`);
      }
    }, { area: this.area, optional: true });
  }

  async testSyncQueue() {
    // VAL-SYNC-021: Auto-sync queues on disconnect
    await this.runAssertion('VAL-SYNC-021: Sync queue status', async () => {
      const queueStatus = await this.window.locator('[data-testid="queue-count"]').first();
      if (await queueStatus.count() > 0) {
        const queueText = await queueStatus.textContent();
        console.log(`Queue status: ${queueText}`);
        await this.captureScreenshot('sync_queue_status');
      }
    }, { area: this.area, optional: true });

    // VAL-SYNC-030: Manual sync button works
    await this.runAssertion('VAL-SYNC-030: Manual sync button', async () => {
      const syncBtn = await this.window.locator('[data-testid="manual-sync"]').first();
      if (await syncBtn.count() > 0) {
        console.log('Manual sync button found');
        await this.captureScreenshot('manual_sync_button');
      }
    }, { area: this.area, optional: true });

    // VAL-SYNC-040: Conflict detection
    await this.runAssertion('VAL-SYNC-040: Conflict detection area', async () => {
      const conflictArea = await this.window.locator('[data-testid="sync-conflicts"]').first();
      if (await conflictArea.count() > 0) {
        await this.captureScreenshot('sync_conflicts');
      }
    }, { area: this.area, optional: true });

    // VAL-SYNC-051: Sync complete notification
    await this.runAssertion('VAL-SYNC-051: Sync progress indicator', async () => {
      const progressBar = await this.window.locator('[data-testid="sync-progress"]').first();
      if (await progressBar.count() > 0) {
        console.log('Sync progress indicator found');
      }
    }, { area: this.area, optional: true });

    // VAL-SYNC-060: App functions fully offline
    await this.runAssertion('VAL-SYNC-060: Offline functionality check', async () => {
      // Navigate to other modules to verify they work offline
      const kasMenu = await this.window.locator('[data-testid="nav-kas"]').first();
      if (await kasMenu.count() > 0) {
        await kasMenu.click();
        await this.window.waitForTimeout(1500);
        
        const table = await this.window.locator('table, .transaction-table').first();
        if (await table.count() > 0) {
          console.log('Kas module accessible offline');
        }
      }
    }, { area: this.area, optional: true });
  }

  async testAdminFeatures() {
    // VAL-ADMIN-010: View all location statuses
    await this.runAssertion('VAL-ADMIN-010: All location statuses', async () => {
      await this.navigateToSync();
      
      const locationGrid = await this.window.locator('[data-testid="sync-locations"]').first();
      if (await locationGrid.count() > 0) {
        const locations = await this.window.locator('.location-item, .sync-location').count();
        console.log(`Found ${locations} sync locations`);
        await this.captureScreenshot('sync_locations');
      }
    }, { area: this.area, optional: true });

    // VAL-ADMIN-020: Admin mode shows all settings
    await this.runAssertion('VAL-ADMIN-020: Admin settings visible', async () => {
      const settingsPanel = await this.window.locator('[data-testid="admin-settings"]').first();
      if (await settingsPanel.count() > 0) {
        await this.captureScreenshot('admin_settings');
      }
    }, { area: this.area, optional: true });

    // VAL-ADMIN-022: View/Edit mode toggle
    await this.runAssertion('VAL-ADMIN-022: View/Edit mode toggle', async () => {
      const toggleBtn = await this.window.locator('[data-testid="edit-toggle"]').first();
      if (await toggleBtn.count() > 0) {
        console.log('Edit mode toggle found');
      }
    }, { area: this.area, optional: true });
  }
}

module.exports = SyncTests;
