"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setConfig = setConfig;
exports.getConfig = getConfig;
exports.setOnRetryScheduled = setOnRetryScheduled;
exports.setOnRetryExhausted = setOnRetryExhausted;
exports.classifyError = classifyError;
exports.calculateNextRetryDelay = calculateNextRetryDelay;
exports.formatDelay = formatDelay;
exports.getRetrySequence = getRetrySequence;
exports.canRetry = canRetry;
exports.markForRetry = markForRetry;
exports.scheduleRetry = scheduleRetry;
exports.cancelScheduledRetry = cancelScheduledRetry;
exports.cancelAllScheduledRetries = cancelAllScheduledRetries;
exports.getRetryState = getRetryState;
exports.getAllRetryStates = getAllRetryStates;
exports.getRetryStateCounts = getRetryStateCounts;
exports.markRetrySuccess = markRetrySuccess;
exports.markRetryExhausted = markRetryExhausted;
exports.clearRetryState = clearRetryState;
exports.clearAllRetryStates = clearAllRetryStates;
exports.getItemsNeedingRetry = getItemsNeedingRetry;
exports.processFailedSync = processFailedSync;
exports.updateQueueItemRetryInfo = updateQueueItemRetryInfo;
exports.getRetryStatusForUI = getRetryStatusForUI;
exports.getRetrySummary = getRetrySummary;
exports.destroy = destroy;
const electron_log_1 = __importDefault(require("electron-log"));
const syncDb = __importStar(require("./syncDatabase"));
// ============ HTTP Status Code Ranges ============
const HTTP_AUTH_ERRORS = [401, 407];
const HTTP_FORBIDDEN_ERRORS = [403];
const HTTP_CLIENT_ERRORS = [400, 404, 409, 422, 428];
const HTTP_SERVER_ERRORS = [500, 502, 503, 504];
const HTTP_TIMEOUT_ERRORS = [408, 504];
// ============ Default Configuration ============
const DEFAULT_CONFIG = {
    maxRetries: 5,
    baseDelayMs: 1000, // 1 second
    maxDelayMs: 300000, // 5 minutes
    multiplier: 2,
    jitterFactor: 0.1, // 10% jitter
};
// ============ State ============
let config = { ...DEFAULT_CONFIG };
// Track active retry schedules
const activeSchedules = new Map();
// Track retry states in memory (in addition to database persistence)
const retryStates = new Map();
let onRetryScheduled = null;
let onRetryExhausted = null;
// ============ Core Functions ============
/**
 * Update retry configuration
 */
function setConfig(newConfig) {
    config = { ...config, ...newConfig };
    electron_log_1.default.info('[RetryService] Configuration updated:', config);
}
/**
 * Get current configuration
 */
function getConfig() {
    return { ...config };
}
/**
 * Set callback for when retry is scheduled
 */
function setOnRetryScheduled(callback) {
    onRetryScheduled = callback;
}
/**
 * Set callback for when all retries are exhausted
 */
function setOnRetryExhausted(callback) {
    onRetryExhausted = callback;
}
/**
 * Classify an error as retryable or non-retryable
 *
 * @param error - Error message or object
 * @param statusCode - HTTP status code if available
 * @returns RetryResult with classification
 */
function classifyError(error, statusCode) {
    let errorMessage = 'Unknown error';
    let errorType = 'unknown';
    let canRetry = true;
    let isRetryable = true;
    let suggestion = 'Will retry automatically';
    // Extract error message
    if (typeof error === 'string') {
        errorMessage = error;
    }
    else if (error instanceof Error) {
        errorMessage = error.message;
    }
    else if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = String(error.message);
    }
    // Classify based on HTTP status code
    if (statusCode) {
        if (HTTP_AUTH_ERRORS.includes(statusCode)) {
            errorType = 'auth';
            canRetry = false;
            isRetryable = false;
            suggestion = 'Authentication failed. Please log in again.';
        }
        else if (HTTP_FORBIDDEN_ERRORS.includes(statusCode)) {
            errorType = 'forbidden';
            canRetry = false;
            isRetryable = false;
            suggestion = 'Access denied. Check permissions.';
        }
        else if (HTTP_CLIENT_ERRORS.includes(statusCode)) {
            if (statusCode === 404) {
                errorType = 'not_found';
                canRetry = false;
                isRetryable = false;
                suggestion = 'Resource not found. Check your data.';
            }
            else if (statusCode === 409) {
                errorType = 'conflict';
                canRetry = true;
                isRetryable = true;
                suggestion = 'Conflict detected. Will retry.';
            }
            else {
                errorType = 'validation';
                canRetry = false;
                isRetryable = false;
                suggestion = 'Validation error. Check your data.';
            }
        }
        else if (HTTP_TIMEOUT_ERRORS.includes(statusCode)) {
            errorType = 'timeout';
            canRetry = true;
            isRetryable = true;
            suggestion = 'Request timed out. Will retry.';
        }
        else if (HTTP_SERVER_ERRORS.includes(statusCode)) {
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
        }
        else if (lowerMessage.includes('permission') || lowerMessage.includes('forbidden') || lowerMessage.includes('access')) {
            errorType = 'forbidden';
            canRetry = false;
            isRetryable = false;
            suggestion = 'Access denied. Check permissions.';
        }
        else if (lowerMessage.includes('validation') || lowerMessage.includes('invalid') || lowerMessage.includes('bad request')) {
            errorType = 'validation';
            canRetry = false;
            isRetryable = false;
            suggestion = 'Validation error. Check your data.';
        }
        else if (lowerMessage.includes('network') || lowerMessage.includes('connection') || lowerMessage.includes('econnreset') || lowerMessage.includes('enetunreach') || lowerMessage.includes('enotfound')) {
            errorType = 'network';
            canRetry = true;
            isRetryable = true;
            suggestion = 'Network error. Will retry.';
        }
        else if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out') || lowerMessage.includes('etimedout')) {
            errorType = 'timeout';
            canRetry = true;
            isRetryable = true;
            suggestion = 'Request timed out. Will retry.';
        }
        else if (lowerMessage.includes('500') || lowerMessage.includes('502') || lowerMessage.includes('503') || lowerMessage.includes('server error')) {
            errorType = 'server';
            canRetry = true;
            isRetryable = true;
            suggestion = 'Server error. Will retry.';
        }
        else if (lowerMessage.includes('conflict') || lowerMessage.includes('already exists') || lowerMessage.includes('duplicate')) {
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
function calculateNextRetryDelay(attempt) {
    if (attempt < 0)
        attempt = 0;
    // Calculate exponential delay
    const exponentialDelay = config.baseDelayMs * Math.pow(config.multiplier, attempt);
    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
    // Add jitter to prevent thundering herd
    const jitter = Math.floor(cappedDelay * config.jitterFactor * Math.random());
    const finalDelay = cappedDelay + jitter;
    electron_log_1.default.debug(`[RetryService] Calculated retry delay for attempt ${attempt}: ${finalDelay}ms (base: ${config.baseDelayMs}, exponential: ${exponentialDelay}, capped: ${cappedDelay})`);
    return finalDelay;
}
/**
 * Get human-readable delay string
 */
function formatDelay(delayMs) {
    if (delayMs < 1000) {
        return `${delayMs}ms`;
    }
    else if (delayMs < 60000) {
        return `${(delayMs / 1000).toFixed(1)}s`;
    }
    else if (delayMs < 3600000) {
        return `${Math.floor(delayMs / 60000)}m ${Math.floor((delayMs % 60000) / 1000)}s`;
    }
    else {
        return `${Math.floor(delayMs / 3600000)}h ${Math.floor((delayMs % 3600000) / 60000)}m`;
    }
}
/**
 * Get retry sequence for display purposes
 * Shows what the delays will be: [1s, 2s, 4s, 8s, 16s]
 */
function getRetrySequence() {
    const sequence = [];
    for (let i = 0; i < config.maxRetries; i++) {
        sequence.push(calculateNextRetryDelay(i));
    }
    return sequence;
}
/**
 * Check if an item can be retried based on current attempt count
 */
function canRetry(itemId, currentAttempts) {
    if (currentAttempts >= config.maxRetries) {
        electron_log_1.default.info(`[RetryService] Max retries (${config.maxRetries}) reached for item ${itemId}`);
        return false;
    }
    return true;
}
/**
 * Mark an item as needing retry and calculate next retry time
 */
function markForRetry(itemId, error, statusCode) {
    const classification = classifyError(error, statusCode);
    electron_log_1.default.info(`[RetryService] Marking item ${itemId} for retry:`, {
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
    const newState = {
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
function scheduleRetry(itemId, module, operation, recordId, delayMs, retryCallback) {
    // Cancel any existing schedule for this item
    cancelScheduledRetry(itemId);
    const attempt = (getRetryState(itemId)?.attempt || 0) + 1;
    const scheduledFor = new Date(Date.now() + delayMs).toISOString();
    electron_log_1.default.info(`[RetryService] Scheduling retry for item ${itemId} in ${formatDelay(delayMs)} (attempt ${attempt}/${config.maxRetries})`);
    // Schedule the timeout
    const timeoutId = setTimeout(async () => {
        electron_log_1.default.info(`[RetryService] Retry triggered for item ${itemId}`);
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
        }
        catch (error) {
            electron_log_1.default.error(`[RetryService] Retry callback failed for item ${itemId}:`, error);
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
        const scheduledRetry = {
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
function cancelScheduledRetry(itemId) {
    const existingTimeout = activeSchedules.get(itemId);
    if (existingTimeout) {
        clearTimeout(existingTimeout);
        activeSchedules.delete(itemId);
        electron_log_1.default.info(`[RetryService] Cancelled scheduled retry for item ${itemId}`);
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
function cancelAllScheduledRetries() {
    electron_log_1.default.info(`[RetryService] Cancelling all ${activeSchedules.size} scheduled retries`);
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
function getRetryState(itemId) {
    return retryStates.get(itemId) || null;
}
/**
 * Get all retry states
 */
function getAllRetryStates() {
    return Array.from(retryStates.values());
}
/**
 * Get count of items in each retry state
 */
function getRetryStateCounts() {
    const counts = {
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
function markRetrySuccess(itemId) {
    cancelScheduledRetry(itemId);
    const state = retryStates.get(itemId);
    if (state) {
        state.status = 'success';
        state.isScheduled = false;
        state.nextRetryAt = null;
    }
    electron_log_1.default.info(`[RetryService] Retry succeeded for item ${itemId}`);
}
/**
 * Mark an item as permanently failed (all retries exhausted)
 */
function markRetryExhausted(itemId, finalError) {
    cancelScheduledRetry(itemId);
    const state = retryStates.get(itemId);
    if (state) {
        state.status = 'failed';
        state.isScheduled = false;
        state.lastError = finalError;
        state.nextRetryAt = null;
    }
    electron_log_1.default.warn(`[RetryService] All retries exhausted for item ${itemId}: ${finalError}`);
    // Notify via callback
    if (onRetryExhausted) {
        onRetryExhausted(itemId, finalError);
    }
}
/**
 * Clear retry state for an item (e.g., when manually retried)
 */
function clearRetryState(itemId) {
    cancelScheduledRetry(itemId);
    retryStates.delete(itemId);
    electron_log_1.default.debug(`[RetryService] Cleared retry state for item ${itemId}`);
}
/**
 * Clear all retry states
 */
function clearAllRetryStates() {
    cancelAllScheduledRetries();
    retryStates.clear();
    electron_log_1.default.info('[RetryService] Cleared all retry states');
}
/**
 * Get items that need retry (scheduled for now or earlier)
 */
function getItemsNeedingRetry() {
    const now = Date.now();
    const itemsToRetry = [];
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
function processFailedSync(itemId, module, operation, recordId, error, statusCode, retryCallback) {
    const classification = classifyError(error, statusCode);
    electron_log_1.default.info(`[RetryService] Processing failed sync for ${module}/${operation}/${recordId}:`, {
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
function updateQueueItemRetryInfo(itemId, attempts, errorMessage, nextRetryAt) {
    // Update in memory
    const state = retryStates.get(itemId);
    if (state) {
        state.attempt = attempts;
        state.lastError = errorMessage;
        state.nextRetryAt = nextRetryAt;
    }
    else if (nextRetryAt) {
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
    }
    catch (error) {
        electron_log_1.default.warn(`[RetryService] Failed to update queue item status:`, error);
    }
}
function getRetryStatusForUI(itemId, module, recordId) {
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
    }
    else if (state.status === 'failed') {
        statusColor = 'red';
    }
    else if (state.status === 'retrying') {
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
function getRetrySummary() {
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
function destroy() {
    electron_log_1.default.info('[RetryService] Destroying retry service');
    // Cancel all scheduled retries
    cancelAllScheduledRetries();
    // Clear all states
    retryStates.clear();
    // Reset callbacks
    onRetryScheduled = null;
    onRetryExhausted = null;
    electron_log_1.default.info('[RetryService] Retry service destroyed');
}
// ============ Export ============
exports.default = {
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
