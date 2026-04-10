/**
 * Retry Service for SoftwareSawit Sync
 * 
 * Implements retry mechanism with exponential backoff for failed sync operations:
 * - Exponential backoff: 1s, 2s, 4s, 8s, 16s... up to max 5 minutes
 * - Configurable max retry attempts (default: 5)
 * - Error classification: retryable vs non-retryable
 * - Non-retryable errors (auth 401/403, validation 400) fail immediately
 * - Retry state tracking for UI visibility
 * - Automatic scheduling of retries after failures
 * 
 * This service integrates with:
 * - syncQueueService: for tracking retry state per queue item
 * - batchSyncService: for retrying failed items
 * - autoSyncTimer: for scheduling automatic retries
 * - UI: for displaying retry state
 */

import log from 'electron-log';
import * as syncDb from './syncDatabase';

// ============ Types & Interfaces ============

export type RetryableErrorType = 
  | 'network'           // Network connectivity issues
  | 'timeout'           // Request timeout
  | 'server'            // Server errors (5xx)
  | 'conflict'          // Sync conflict
  | 'unknown';          // Unknown errors (assumed retryable)

export type NonRetryableErrorType =
  | 'auth'              // Authentication errors (401)
  | 'forbidden'         // Authorization errors (403)
  | 'validation'        // Validation errors (400)
  | 'not_found'         // Resource not found (404)
  | 'conflict_resolved' // Conflict already resolved
  | 'bad_request';      // Bad request (400)

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 5) */
  maxRetries: number;
  /** Base delay in ms for exponential backoff (default: 1000 = 1s) */
  baseDelayMs: number;
  /** Maximum delay in ms (default: 300000 = 5 minutes) */
  maxDelayMs: number;
  /** Multiplier for exponential backoff (default: 2) */
  multiplier: number;
  /** Jitter factor 0-1 to add randomness (default: 0.1 = 10%) */
  jitterFactor: number;
}

export interface RetryState {
  /** Queue item ID */
  itemId: string;
  /** Current attempt number (0 = initial attempt, 1 = first retry, etc.) */
  attempt: number;
  /** Next retry timestamp (ISO string) */
  nextRetryAt: string | null;
  /** Last error message */
  lastError: string | null;
  /** Last error type */
  lastErrorType: RetryableErrorType | NonRetryableErrorType | null;
  /** Whether the item is scheduled for retry */
  isScheduled: boolean;
  /** Scheduled retry timeout ID (if any) */
  scheduledTimeoutId: NodeJS.Timeout | null;
  /** Status: 'pending', 'retrying', 'failed', 'success' */
  status: 'pending' | 'retrying' | 'failed' | 'success';
  /** The actual delay used for the next retry in ms */
  nextDelayMs: number | null;
}

export interface RetryResult {
  /** Whether the operation can be retried */
  canRetry: boolean;
  /** Whether the error is retryable */
  isRetryable: boolean;
  /** Classification of the error */
  errorType: RetryableErrorType | NonRetryableErrorType;
  /** Human-readable error message */
  errorMessage: string;
  /** HTTP status code if available */
  statusCode?: number;
  /** Suggestion for user */
  suggestion?: string;
}

export interface ScheduledRetry {
  itemId: string;
  module: string;
  operation: string;
  recordId: string;
  scheduledFor: string;
  delayMs: number;
  attempt: number;
}

// ============ HTTP Status Code Ranges ============

const HTTP_AUTH_ERRORS = [401, 407];
const HTTP_FORBIDDEN_ERRORS = [403];
const HTTP_CLIENT_ERRORS = [400, 404, 409, 422, 428];
const HTTP_SERVER_ERRORS = [500, 502, 503, 504];
const HTTP_TIMEOUT_ERRORS = [408, 504];

// ============ Default Configuration ============

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelayMs: 1000,      // 1 second
  maxDelayMs: 300000,     // 5 minutes
  multiplier: 2,
  jitterFactor: 0.1,      // 10% jitter
};

// ============ State ============

let config: RetryConfig = { ...DEFAULT_CONFIG };

// Track active retry schedules
const activeSchedules: Map<string, NodeJS.Timeout> = new Map();

// Track retry states in memory (in addition to database persistence)
const retryStates: Map<string, RetryState> = new Map();

// Callback for when retry is scheduled
type RetryScheduledCallback = (retry: ScheduledRetry) => void;
type RetryExhaustedCallback = (itemId: string, finalError: string) => void;

let onRetryScheduled: RetryScheduledCallback | null = null;
let onRetryExhausted: RetryExhaustedCallback | null = null;

// ============ Core Functions ============

/**
 * Update retry configuration
 */
export function setConfig(newConfig: Partial<RetryConfig>): void {
  config = { ...config, ...newConfig };
  log.info('[RetryService] Configuration updated:', config);
}

/**
 * Get current configuration
 */
export function getConfig(): RetryConfig {
  return { ...config };
}

/**
 * Set callback for when retry is scheduled
 */
export function setOnRetryScheduled(callback: RetryScheduledCallback | null): void {
  onRetryScheduled = callback;
}

/**
 * Set callback for when all retries are exhausted
 */
export function setOnRetryExhausted(callback: RetryExhaustedCallback | null): void {
  onRetryExhausted = callback;
}

/**
 * Classify an error as retryable or non-retryable
 * 
 * @param error - Error message or object
 * @param statusCode - HTTP status code if available
 * @returns RetryResult with classification
 */
export function classifyError(error: unknown, statusCode?: number): RetryResult {
  let errorMessage = 'Unknown error';
  let errorType: RetryableErrorType | NonRetryableErrorType = 'unknown';
  let canRetry = true;
  let isRetryable = true;
  let suggestion = 'Will retry automatically';

  // Extract error message
  if (typeof error === 'string') {
    errorMessage = error;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  } else if (error && typeof error === 'object' && 'message' in error) {
    errorMessage = String((error as { message: unknown }).message);
  }

  // Classify based on HTTP status code
  if (statusCode) {
    if (HTTP_AUTH_ERRORS.includes(statusCode)) {
      errorType = 'auth';
      canRetry = false;
      isRetryable = false;
      suggestion = 'Authentication failed. Please log in again.';
    } else if (HTTP_FORBIDDEN_ERRORS.includes(statusCode)) {
      errorType = 'forbidden';
      canRetry = false;
      isRetryable = false;
      suggestion = 'Access denied. Check permissions.';
    } else if (HTTP_CLIENT_ERRORS.includes(statusCode)) {
      if (statusCode === 404) {
        errorType = 'not_found';
        canRetry = false;
        isRetryable = false;
        suggestion = 'Resource not found. Check your data.';
      } else if (statusCode === 409) {
        errorType = 'conflict';
        canRetry = true;
        isRetryable = true;
        suggestion = 'Conflict detected. Will retry.';
      } else {
        errorType = 'validation';
        canRetry = false;
        isRetryable = false;
        suggestion = 'Validation error. Check your data.';
      }
    } else if (HTTP_TIMEOUT_ERRORS.includes(statusCode)) {
      errorType = 'timeout';
      canRetry = true;
      isRetryable = true;
      suggestion = 'Request timed out. Will retry.';
    } else if (HTTP_SERVER_ERRORS.includes(statusCode)) {
      errorType = 'server';
      canRetry = true;
      isRetryable = true;
      suggestion = 'Server error. Will retry.';
    }
  }
  // Classify based on error message patterns (for network errors)
  else {
    const lowerMessage = errorMessage.toLowerCase();
    
    if (lowerMessage.includes('auth') || lowerMessage.includes('login') || lowerMessage.includes('token')) {
      errorType = 'auth';
      canRetry = false;
      isRetryable = false;
      suggestion = 'Authentication error. Please log in again.';
    } else if (lowerMessage.includes('permission') || lowerMessage.includes('forbidden') || lowerMessage.includes('access')) {
      errorType = 'forbidden';
      canRetry = false;
      isRetryable = false;
      suggestion = 'Access denied. Check permissions.';
    } else if (lowerMessage.includes('validation') || lowerMessage.includes('invalid') || lowerMessage.includes('bad request')) {
      errorType = 'validation';
      canRetry = false;
      isRetryable = false;
      suggestion = 'Validation error. Check your data.';
    } else if (lowerMessage.includes('network') || lowerMessage.includes('connection') || lowerMessage.includes('econnreset') || lowerMessage.includes('enetunreach') || lowerMessage.includes('enotfound')) {
      errorType = 'network';
      canRetry = true;
      isRetryable = true;
      suggestion = 'Network error. Will retry.';
    } else if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out') || lowerMessage.includes('etimedout')) {
      errorType = 'timeout';
      canRetry = true;
      isRetryable = true;
      suggestion = 'Request timed out. Will retry.';
    } else if (lowerMessage.includes('500') || lowerMessage.includes('502') || lowerMessage.includes('503') || lowerMessage.includes('server error')) {
      errorType = 'server';
      canRetry = true;
      isRetryable = true;
      suggestion = 'Server error. Will retry.';
    } else if (lowerMessage.includes('conflict') || lowerMessage.includes('already exists') || lowerMessage.includes('duplicate')) {
      errorType = 'conflict';
      canRetry = true;
      isRetryable = true;
      suggestion = 'Conflict detected. Will retry.';
    }
  }

  return {
    canRetry,
    isRetryable,
    errorType,
    errorMessage,
    statusCode,
    suggestion,
  };
}

/**
 * Calculate the next retry delay using exponential backoff with jitter
 * 
 * Formula: min(baseDelay * (multiplier ^ attempt), maxDelay) + jitter
 * 
 * @param attempt - Current attempt number (0-indexed)
 * @returns Delay in milliseconds
 */
export function calculateNextRetryDelay(attempt: number): number {
  if (attempt < 0) attempt = 0;
  
  // Calculate exponential delay
  const exponentialDelay = config.baseDelayMs * Math.pow(config.multiplier, attempt);
  
  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  
  // Add jitter to prevent thundering herd
  const jitter = Math.floor(cappedDelay * config.jitterFactor * Math.random());
  const finalDelay = cappedDelay + jitter;
  
  log.debug(`[RetryService] Calculated retry delay for attempt ${attempt}: ${finalDelay}ms (base: ${config.baseDelayMs}, exponential: ${exponentialDelay}, capped: ${cappedDelay})`);
  
  return finalDelay;
}

/**
 * Get human-readable delay string
 */
export function formatDelay(delayMs: number): string {
  if (delayMs < 1000) {
    return `${delayMs}ms`;
  } else if (delayMs < 60000) {
    return `${(delayMs / 1000).toFixed(1)}s`;
  } else if (delayMs < 3600000) {
    return `${Math.floor(delayMs / 60000)}m ${Math.floor((delayMs % 60000) / 1000)}s`;
  } else {
    return `${Math.floor(delayMs / 3600000)}h ${Math.floor((delayMs % 3600000) / 60000)}m`;
  }
}

/**
 * Get retry sequence for display purposes
 * Shows what the delays will be: [1s, 2s, 4s, 8s, 16s]
 */
export function getRetrySequence(): number[] {
  const sequence: number[] = [];
  for (let i = 0; i < config.maxRetries; i++) {
    sequence.push(calculateNextRetryDelay(i));
  }
  return sequence;
}

/**
 * Check if an item can be retried based on current attempt count
 */
export function canRetry(itemId: string, currentAttempts: number): boolean {
  if (currentAttempts >= config.maxRetries) {
    log.info(`[RetryService] Max retries (${config.maxRetries}) reached for item ${itemId}`);
    return false;
  }
  return true;
}

/**
 * Mark an item as needing retry and calculate next retry time
 */
export function markForRetry(
  itemId: string,
  error: unknown,
  statusCode?: number
): { canRetry: boolean; nextDelayMs: number; nextRetryAt: string } {
  const classification = classifyError(error, statusCode);
  
  log.info(`[RetryService] Marking item ${itemId} for retry:`, {
    errorType: classification.errorType,
    errorMessage: classification.errorMessage,
    canRetry: classification.canRetry,
  });
  
  // Get current attempt from database or memory
  const currentState = getRetryState(itemId);
  const currentAttempt = currentState?.attempt || 0;
  
  // Check if we can retry
  if (!classification.canRetry || !canRetry(itemId, currentAttempt)) {
    return {
      canRetry: false,
      nextDelayMs: 0,
      nextRetryAt: new Date().toISOString(),
    };
  }
  
  // Calculate next delay
  const nextDelayMs = calculateNextRetryDelay(currentAttempt);
  const nextRetryAt = new Date(Date.now() + nextDelayMs).toISOString();
  
  // Update retry state in memory
  const newState: RetryState = {
    itemId,
    attempt: currentAttempt + 1,
    nextRetryAt,
    lastError: classification.errorMessage,
    lastErrorType: classification.errorType,
    isScheduled: false,
    scheduledTimeoutId: null,
    status: 'pending',
    nextDelayMs,
  };
  
  retryStates.set(itemId, newState);
  
  return {
    canRetry: true,
    nextDelayMs,
    nextRetryAt,
  };
}

/**
 * Schedule a retry for an item
 * 
 * @param itemId - Queue item ID
 * @param module - Module name
 * @param operation - Operation type
 * @param recordId - Record ID
 * @param delayMs - Delay in milliseconds
 * @param retryCallback - Function to call when retry is triggered
 * @returns Scheduled retry info
 */
export function scheduleRetry(
  itemId: string,
  module: string,
  operation: string,
  recordId: string,
  delayMs: number,
  retryCallback: () => Promise<unknown>
): ScheduledRetry | null {
  // Cancel any existing schedule for this item
  cancelScheduledRetry(itemId);
  
  const attempt = (getRetryState(itemId)?.attempt || 0) + 1;
  const scheduledFor = new Date(Date.now() + delayMs).toISOString();
  
  log.info(`[RetryService] Scheduling retry for item ${itemId} in ${formatDelay(delayMs)} (attempt ${attempt}/${config.maxRetries})`);
  
  // Schedule the timeout
  const timeoutId = setTimeout(async () => {
    log.info(`[RetryService] Retry triggered for item ${itemId}`);
    
    // Update state
    const state = retryStates.get(itemId);
    if (state) {
      state.status = 'retrying';
      state.isScheduled = false;
      state.scheduledTimeoutId = null;
    }
    
    // Remove from active schedules
    activeSchedules.delete(itemId);
    
    try {
      // Execute the retry callback
      await retryCallback();
    } catch (error) {
      log.error(`[RetryService] Retry callback failed for item ${itemId}:`, error);
    }
  }, delayMs);
  
  // Store the schedule
  activeSchedules.set(itemId, timeoutId);
  
  // Update retry state
  const state = retryStates.get(itemId);
  if (state) {
    state.isScheduled = true;
    state.scheduledTimeoutId = timeoutId;
    state.status = 'pending';
  }
  
  // Notify via callback
  if (onRetryScheduled) {
    const scheduledRetry: ScheduledRetry = {
      itemId,
      module,
      operation,
      recordId,
      scheduledFor,
      delayMs,
      attempt,
    };
    onRetryScheduled(scheduledRetry);
  }
  
  return {
    itemId,
    module,
    operation,
    recordId,
    scheduledFor,
    delayMs,
    attempt,
  };
}

/**
 * Cancel a scheduled retry
 */
export function cancelScheduledRetry(itemId: string): boolean {
  const existingTimeout = activeSchedules.get(itemId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    activeSchedules.delete(itemId);
    log.info(`[RetryService] Cancelled scheduled retry for item ${itemId}`);
    
    // Update state
    const state = retryStates.get(itemId);
    if (state) {
      state.isScheduled = false;
      state.scheduledTimeoutId = null;
    }
    
    return true;
  }
  return false;
}

/**
 * Cancel all scheduled retries
 */
export function cancelAllScheduledRetries(): void {
  log.info(`[RetryService] Cancelling all ${activeSchedules.size} scheduled retries`);
  
  for (const [itemId, timeoutId] of activeSchedules) {
    clearTimeout(timeoutId);
    const state = retryStates.get(itemId);
    if (state) {
      state.isScheduled = false;
      state.scheduledTimeoutId = null;
    }
  }
  
  activeSchedules.clear();
}

/**
 * Get retry state for an item
 */
export function getRetryState(itemId: string): RetryState | null {
  return retryStates.get(itemId) || null;
}

/**
 * Get all retry states
 */
export function getAllRetryStates(): RetryState[] {
  return Array.from(retryStates.values());
}

/**
 * Get count of items in each retry state
 */
export function getRetryStateCounts(): Record<RetryState['status'], number> {
  const counts: Record<RetryState['status'], number> = {
    pending: 0,
    retrying: 0,
    failed: 0,
    success: 0,
  };
  
  for (const state of retryStates.values()) {
    counts[state.status]++;
  }
  
  return counts;
}

/**
 * Mark an item as successfully synced (retry succeeded)
 */
export function markRetrySuccess(itemId: string): void {
  cancelScheduledRetry(itemId);
  
  const state = retryStates.get(itemId);
  if (state) {
    state.status = 'success';
    state.isScheduled = false;
    state.nextRetryAt = null;
  }
  
  log.info(`[RetryService] Retry succeeded for item ${itemId}`);
}

/**
 * Mark an item as permanently failed (all retries exhausted)
 */
export function markRetryExhausted(itemId: string, finalError: string): void {
  cancelScheduledRetry(itemId);
  
  const state = retryStates.get(itemId);
  if (state) {
    state.status = 'failed';
    state.isScheduled = false;
    state.lastError = finalError;
    state.nextRetryAt = null;
  }
  
  log.warn(`[RetryService] All retries exhausted for item ${itemId}: ${finalError}`);
  
  // Notify via callback
  if (onRetryExhausted) {
    onRetryExhausted(itemId, finalError);
  }
}

/**
 * Clear retry state for an item (e.g., when manually retried)
 */
export function clearRetryState(itemId: string): void {
  cancelScheduledRetry(itemId);
  retryStates.delete(itemId);
  log.debug(`[RetryService] Cleared retry state for item ${itemId}`);
}

/**
 * Clear all retry states
 */
export function clearAllRetryStates(): void {
  cancelAllScheduledRetries();
  retryStates.clear();
  log.info('[RetryService] Cleared all retry states');
}

/**
 * Get items that need retry (scheduled for now or earlier)
 */
export function getItemsNeedingRetry(): string[] {
  const now = Date.now();
  const itemsToRetry: string[] = [];
  
  for (const [itemId, state] of retryStates) {
    if (state.isScheduled && state.nextRetryAt) {
      const retryTime = new Date(state.nextRetryAt).getTime();
      if (retryTime <= now) {
        itemsToRetry.push(itemId);
      }
    }
  }
  
  return itemsToRetry;
}

/**
 * Process a failed sync operation - determine if retry is needed
 * 
 * @param itemId - Queue item ID
 * @param module - Module name
 * @param operation - Operation type
 * @param recordId - Record ID
 * @param error - Error that occurred
 * @param statusCode - HTTP status code if available
 * @param retryCallback - Function to call when retry is triggered
 * @returns Object indicating what action to take
 */
export function processFailedSync(
  itemId: string,
  module: string,
  operation: string,
  recordId: string,
  error: unknown,
  statusCode: number | undefined,
  retryCallback: () => Promise<void>
): { shouldRetry: boolean; delayMs: number | null; message: string } {
  const classification = classifyError(error, statusCode);
  
  log.info(`[RetryService] Processing failed sync for ${module}/${operation}/${recordId}:`, {
    errorType: classification.errorType,
    canRetry: classification.canRetry,
    suggestion: classification.suggestion,
  });
  
  // If error is non-retryable, don't retry
  if (!classification.canRetry) {
    markRetryExhausted(itemId, classification.errorMessage);
    return {
      shouldRetry: false,
      delayMs: null,
      message: classification.suggestion || 'Error is not retryable',
    };
  }
  
  // Get current attempt
  const currentState = getRetryState(itemId);
  const currentAttempt = currentState?.attempt || 0;
  
  // Check if max retries reached
  if (currentAttempt >= config.maxRetries) {
    markRetryExhausted(itemId, `Max retries (${config.maxRetries}) reached. Last error: ${classification.errorMessage}`);
    return {
      shouldRetry: false,
      delayMs: null,
      message: `Max retries (${config.maxRetries}) reached. Operation marked as failed.`,
    };
  }
  
  // Calculate delay and schedule retry
  const delayMs = calculateNextRetryDelay(currentAttempt);
  const retryResult = markForRetry(itemId, error, statusCode);
  
  if (retryResult.canRetry) {
    scheduleRetry(itemId, module, operation, recordId, delayMs, retryCallback);
    
    return {
      shouldRetry: true,
      delayMs,
      message: `Will retry in ${formatDelay(delayMs)} (attempt ${currentAttempt + 1}/${config.maxRetries})`,
    };
  }
  
  return {
    shouldRetry: false,
    delayMs: null,
    message: 'Unable to schedule retry',
  };
}

// ============ Integration with Sync Queue ============

/**
 * Update sync queue item with retry information
 * This is called after processing a failed sync to update the queue
 */
export function updateQueueItemRetryInfo(
  itemId: string,
  attempts: number,
  errorMessage: string | null,
  nextRetryAt: string | null
): void {
  // Update in memory
  const state = retryStates.get(itemId);
  if (state) {
    state.attempt = attempts;
    state.lastError = errorMessage;
    state.nextRetryAt = nextRetryAt;
  } else if (nextRetryAt) {
    // Create new state
    retryStates.set(itemId, {
      itemId,
      attempt: attempts,
      nextRetryAt,
      lastError: errorMessage,
      lastErrorType: null,
      isScheduled: false,
      scheduledTimeoutId: null,
      status: 'pending',
      nextDelayMs: null,
    });
  }
  
  // Also update in database
  try {
    syncDb.updateSyncQueueItemStatus(itemId, 'failed', errorMessage ?? undefined);
  } catch (error) {
    log.warn(`[RetryService] Failed to update queue item status:`, error);
  }
}

// ============ UI Visibility ============

/**
 * Get retry status for UI display
 */
export interface RetryStatusForUI {
  itemId: string;
  module: string;
  recordId: string;
  attempt: number;
  maxRetries: number;
  lastError: string | null;
  nextRetryAt: string | null;
  canRetry: boolean;
  progress: string; // e.g., "Attempt 2 of 5"
  statusColor: string; // e.g., "yellow", "red", "green"
}

export function getRetryStatusForUI(
  itemId: string,
  module: string,
  recordId: string
): RetryStatusForUI | null {
  const state = retryStates.get(itemId);
  
  if (!state) {
    // Try to get from database
    const queueItem = syncDb.getSyncQueueItemById(itemId);
    if (queueItem) {
      return {
        itemId,
        module,
        recordId,
        attempt: queueItem.attempts,
        maxRetries: config.maxRetries,
        lastError: queueItem.lastError,
        nextRetryAt: null,
        canRetry: queueItem.attempts < config.maxRetries,
        progress: `Attempt ${queueItem.attempts + 1} of ${config.maxRetries}`,
        statusColor: 'yellow',
      };
    }
    return null;
  }
  
  let statusColor = 'yellow';
  if (state.status === 'success') {
    statusColor = 'green';
  } else if (state.status === 'failed') {
    statusColor = 'red';
  } else if (state.status === 'retrying') {
    statusColor = 'blue';
  }
  
  return {
    itemId,
    module,
    recordId,
    attempt: state.attempt,
    maxRetries: config.maxRetries,
    lastError: state.lastError,
    nextRetryAt: state.nextRetryAt,
    canRetry: state.attempt < config.maxRetries,
    progress: `Attempt ${state.attempt} of ${config.maxRetries}`,
    statusColor,
  };
}

/**
 * Get summary of retry status for display
 */
export function getRetrySummary(): {
  totalRetries: number;
  pendingRetries: number;
  activeRetries: number;
  failedItems: number;
  success: number;
  maxRetriesReached: number;
  retrySequence: number[];
} {
  let pendingRetries = 0;
  let activeRetries = 0;
  let failedItems = 0;
  let success = 0;
  
  for (const state of retryStates.values()) {
    switch (state.status) {
      case 'pending':
        pendingRetries++;
        break;
      case 'retrying':
        activeRetries++;
        break;
      case 'failed':
        failedItems++;
        break;
      case 'success':
        success++;
        break;
    }
  }
  
  return {
    totalRetries: retryStates.size,
    pendingRetries,
    activeRetries,
    failedItems,
    success,
    maxRetriesReached: failedItems,
    retrySequence: getRetrySequence(),
  };
}

// ============ Cleanup ============

/**
 * Cleanup function for shutdown
 */
export function destroy(): void {
  log.info('[RetryService] Destroying retry service');
  
  // Cancel all scheduled retries
  cancelAllScheduledRetries();
  
  // Clear all states
  retryStates.clear();
  
  // Reset callbacks
  onRetryScheduled = null;
  onRetryExhausted = null;
  
  log.info('[RetryService] Retry service destroyed');
}

// ============ Export ============

export default {
  // Configuration
  setConfig,
  getConfig,
  
  // Error classification
  classifyError,
  
  // Delay calculation
  calculateNextRetryDelay,
  formatDelay,
  getRetrySequence,
  
  // Retry management
  canRetry,
  markForRetry,
  markRetrySuccess,
  markRetryExhausted,
  
  // Scheduling
  scheduleRetry,
  cancelScheduledRetry,
  cancelAllScheduledRetries,
  
  // State
  getRetryState,
  getAllRetryStates,
  getRetryStateCounts,
  clearRetryState,
  clearAllRetryStates,
  getItemsNeedingRetry,
  
  // Integration
  processFailedSync,
  updateQueueItemRetryInfo,
  
  // UI
  getRetryStatusForUI,
  getRetrySummary,
  
  // Callbacks
  setOnRetryScheduled,
  setOnRetryExhausted,
  
  // Lifecycle
  destroy,
};
