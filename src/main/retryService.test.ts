/**
 * Unit tests for Retry Service
 * 
 * These tests verify the retry mechanism with exponential backoff:
 * - Error classification (retryable vs non-retryable)
 * - Exponential backoff calculation
 * - Retry state tracking
 * - Max retries enforcement
 */

import * as retryService from './retryService';

describe('RetryService', () => {
  beforeEach(() => {
    // Reset config to defaults before each test
    retryService.setConfig({
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 300000,
      multiplier: 2,
      jitterFactor: 0,
    });
    
    // Clear all retry states
    retryService.clearAllRetryStates();
  });

  afterEach(() => {
    // Cleanup
    retryService.destroy();
  });

  describe('Error Classification', () => {
    describe('classifyError', () => {
      test('classifies 401 as non-retryable auth error', () => {
        const result = retryService.classifyError('Unauthorized', 401);
        
        expect(result.canRetry).toBe(false);
        expect(result.isRetryable).toBe(false);
        expect(result.errorType).toBe('auth');
        expect(result.suggestion).toBe('Authentication failed. Please log in again.');
      });

      test('classifies 403 as non-retryable forbidden error', () => {
        const result = retryService.classifyError('Forbidden', 403);
        
        expect(result.canRetry).toBe(false);
        expect(result.isRetryable).toBe(false);
        expect(result.errorType).toBe('forbidden');
        expect(result.suggestion).toBe('Access denied. Check permissions.');
      });

      test('classifies 400 as non-retryable validation error', () => {
        const result = retryService.classifyError('Bad Request', 400);
        
        expect(result.canRetry).toBe(false);
        expect(result.isRetryable).toBe(false);
        expect(result.errorType).toBe('validation');
        expect(result.suggestion).toBe('Validation error. Check your data.');
      });

      test('classifies 404 as non-retryable not_found error', () => {
        const result = retryService.classifyError('Not Found', 404);
        
        expect(result.canRetry).toBe(false);
        expect(result.isRetryable).toBe(false);
        expect(result.errorType).toBe('not_found');
      });

      test('classifies 409 as retryable conflict error', () => {
        const result = retryService.classifyError('Conflict', 409);
        
        expect(result.canRetry).toBe(true);
        expect(result.isRetryable).toBe(true);
        expect(result.errorType).toBe('conflict');
      });

      test('classifies 500 as retryable server error', () => {
        const result = retryService.classifyError('Internal Server Error', 500);
        
        expect(result.canRetry).toBe(true);
        expect(result.isRetryable).toBe(true);
        expect(result.errorType).toBe('server');
        expect(result.suggestion).toBe('Server error. Will retry.');
      });

      test('classifies 502 as retryable server error', () => {
        const result = retryService.classifyError('Bad Gateway', 502);
        
        expect(result.canRetry).toBe(true);
        expect(result.isRetryable).toBe(true);
        expect(result.errorType).toBe('server');
      });

      test('classifies 503 as retryable server error', () => {
        const result = retryService.classifyError('Service Unavailable', 503);
        
        expect(result.canRetry).toBe(true);
        expect(result.isRetryable).toBe(true);
        expect(result.errorType).toBe('server');
      });

      test('classifies 504 as retryable timeout error', () => {
        const result = retryService.classifyError('Gateway Timeout', 504);
        
        expect(result.canRetry).toBe(true);
        expect(result.isRetryable).toBe(true);
        expect(result.errorType).toBe('timeout');
        expect(result.suggestion).toBe('Request timed out. Will retry.');
      });

      test('classifies network errors as retryable', () => {
        const result = retryService.classifyError('ECONNRESET', undefined);
        
        expect(result.canRetry).toBe(true);
        expect(result.isRetryable).toBe(true);
        expect(result.errorType).toBe('network');
      });

      test('classifies timeout errors as retryable', () => {
        const result = retryService.classifyError('Request timed out', undefined);
        
        expect(result.canRetry).toBe(true);
        expect(result.isRetryable).toBe(true);
        expect(result.errorType).toBe('timeout');
      });

      test('handles Error objects', () => {
        const error = new Error('Network connection lost');
        const result = retryService.classifyError(error, undefined);
        
        expect(result.errorMessage).toBe('Network connection lost');
        expect(result.errorType).toBe('network');
        expect(result.canRetry).toBe(true);
      });

      test('handles object with message property', () => {
        const error = { message: 'Authentication token expired', code: 'AUTH_ERROR' };
        const result = retryService.classifyError(error, undefined);
        
        expect(result.errorMessage).toBe('Authentication token expired');
        expect(result.errorType).toBe('auth');
        expect(result.canRetry).toBe(false);
      });
    });
  });

  describe('Exponential Backoff', () => {
    describe('calculateNextRetryDelay', () => {
      test('calculates correct delay for attempt 0', () => {
        const delay = retryService.calculateNextRetryDelay(0);
        // baseDelayMs * multiplier^0 = 1000 * 1 = 1000
        expect(delay).toBe(1000);
      });

      test('calculates correct delay for attempt 1', () => {
        const delay = retryService.calculateNextRetryDelay(1);
        // baseDelayMs * multiplier^1 = 1000 * 2 = 2000
        expect(delay).toBe(2000);
      });

      test('calculates correct delay for attempt 2', () => {
        const delay = retryService.calculateNextRetryDelay(2);
        // baseDelayMs * multiplier^2 = 1000 * 4 = 4000
        expect(delay).toBe(4000);
      });

      test('calculates correct delay for attempt 3', () => {
        const delay = retryService.calculateNextRetryDelay(3);
        // baseDelayMs * multiplier^3 = 1000 * 8 = 8000
        expect(delay).toBe(8000);
      });

      test('calculates correct delay for attempt 4', () => {
        const delay = retryService.calculateNextRetryDelay(4);
        // baseDelayMs * multiplier^4 = 1000 * 16 = 16000
        expect(delay).toBe(16000);
      });

      test('caps delay at maxDelayMs', () => {
        // With maxDelayMs = 300000 (5 min), attempt 10 should be capped
        retryService.setConfig({ maxDelayMs: 300000 });
        
        const delay = retryService.calculateNextRetryDelay(10);
        // 1000 * 2^10 = 1024000, but capped at 300000
        expect(delay).toBe(300000);
      });

      test('handles negative attempt as 0', () => {
        const delay = retryService.calculateNextRetryDelay(-1);
        expect(delay).toBe(1000); // Same as attempt 0
      });

      test('respects jitter factor', () => {
        retryService.setConfig({ jitterFactor: 0.2 }); // 20% jitter
        
        // With jitter, delays should vary
        const delays = new Set<number>();
        for (let i = 0; i < 10; i++) {
          delays.add(retryService.calculateNextRetryDelay(0));
        }
        
        // Should have multiple values due to jitter
        expect(delays.size).toBeGreaterThan(1);
      });
    });

    describe('getRetrySequence', () => {
      test('returns sequence matching exponential backoff pattern', () => {
        retryService.setConfig({ jitterFactor: 0 }); // No jitter for predictable results
        
        const sequence = retryService.getRetrySequence();
        
        // Should have maxRetries items
        expect(sequence).toHaveLength(5);
        
        // Check exponential pattern: 1s, 2s, 4s, 8s, 16s
        expect(sequence[0]).toBe(1000);
        expect(sequence[1]).toBe(2000);
        expect(sequence[2]).toBe(4000);
        expect(sequence[3]).toBe(8000);
        expect(sequence[4]).toBe(16000);
      });
    });

    describe('formatDelay', () => {
      test('formats milliseconds', () => {
        expect(retryService.formatDelay(500)).toBe('500ms');
      });

      test('formats seconds', () => {
        expect(retryService.formatDelay(1500)).toBe('1.5s');
        expect(retryService.formatDelay(2000)).toBe('2.0s');
      });

      test('formats minutes and seconds', () => {
        expect(retryService.formatDelay(65000)).toBe('1m 5s');
        expect(retryService.formatDelay(125000)).toBe('2m 5s');
      });

      test('formats hours and minutes', () => {
        expect(retryService.formatDelay(3600000)).toBe('1h 0m');
        expect(retryService.formatDelay(3660000)).toBe('1h 1m');
      });
    });
  });

  describe('Retry State Management', () => {
    describe('canRetry', () => {
      test('returns true when under max retries', () => {
        const result = retryService.canRetry('item-1', 2);
        expect(result).toBe(true);
      });

      test('returns false when at max retries', () => {
        const result = retryService.canRetry('item-1', 5);
        expect(result).toBe(false);
      });

      test('returns false when over max retries', () => {
        const result = retryService.canRetry('item-1', 10);
        expect(result).toBe(false);
      });
    });

    describe('markForRetry', () => {
      test('marks item for retry with correct delay', () => {
        const result = retryService.markForRetry('item-1', 'Network error', undefined);
        
        expect(result.canRetry).toBe(true);
        expect(result.nextDelayMs).toBe(1000); // First retry: 1s
        expect(result.nextRetryAt).toBeDefined();
      });

      test('returns canRetry=false for non-retryable errors', () => {
        const result = retryService.markForRetry('item-1', 'Unauthorized', 401);
        
        expect(result.canRetry).toBe(false);
      });

      test('increments attempt count', () => {
        retryService.markForRetry('item-1', 'Network error', undefined);
        
        const state = retryService.getRetryState('item-1');
        expect(state?.attempt).toBe(1);
      });

      test('stores error information', () => {
        retryService.markForRetry('item-1', 'Connection reset', undefined);
        
        const state = retryService.getRetryState('item-1');
        expect(state?.lastError).toBe('Connection reset');
        expect(state?.lastErrorType).toBe('network');
      });
    });

    describe('markRetrySuccess', () => {
      test('updates state to success', () => {
        retryService.markForRetry('item-1', 'Network error', undefined);
        retryService.markRetrySuccess('item-1');
        
        const state = retryService.getRetryState('item-1');
        expect(state?.status).toBe('success');
      });
    });

    describe('markRetryExhausted', () => {
      test('updates state to failed', () => {
        retryService.markForRetry('item-1', 'Network error', undefined);
        retryService.markRetryExhausted('item-1', 'Max retries reached');
        
        const state = retryService.getRetryState('item-1');
        expect(state?.status).toBe('failed');
        expect(state?.lastError).toBe('Max retries reached');
      });
    });

    describe('getRetryState', () => {
      test('returns null for unknown item', () => {
        const state = retryService.getRetryState('unknown-item');
        expect(state).toBeNull();
      });

      test('returns state for known item', () => {
        retryService.markForRetry('item-1', 'Error', undefined);
        
        const state = retryService.getRetryState('item-1');
        expect(state).not.toBeNull();
        expect(state?.itemId).toBe('item-1');
      });
    });

    describe('getAllRetryStates', () => {
      test('returns empty array initially', () => {
        const states = retryService.getAllRetryStates();
        expect(states).toHaveLength(0);
      });

      test('returns all tracked states', () => {
        retryService.markForRetry('item-1', 'Error 1', undefined);
        retryService.markForRetry('item-2', 'Error 2', undefined);
        
        const states = retryService.getAllRetryStates();
        expect(states).toHaveLength(2);
      });
    });

    describe('getRetryStateCounts', () => {
      test('returns zero counts initially', () => {
        const counts = retryService.getRetryStateCounts();
        
        expect(counts.pending).toBe(0);
        expect(counts.retrying).toBe(0);
        expect(counts.failed).toBe(0);
        expect(counts.success).toBe(0);
      });

      test('counts items by status', () => {
        retryService.markForRetry('item-1', 'Error', undefined);
        retryService.markForRetry('item-2', 'Error', undefined);
        retryService.markRetrySuccess('item-1');
        
        const counts = retryService.getRetryStateCounts();
        
        expect(counts.pending).toBe(1);
        expect(counts.success).toBe(1);
      });
    });
  });

  describe('Configuration', () => {
    describe('setConfig', () => {
      test('updates max retries', () => {
        retryService.setConfig({ maxRetries: 10 });
        
        const config = retryService.getConfig();
        expect(config.maxRetries).toBe(10);
      });

      test('updates base delay', () => {
        retryService.setConfig({ baseDelayMs: 500 });
        
        const config = retryService.getConfig();
        expect(config.baseDelayMs).toBe(500);
      });

      test('updates max delay', () => {
        retryService.setConfig({ maxDelayMs: 600000 }); // 10 minutes
        
        const config = retryService.getConfig();
        expect(config.maxDelayMs).toBe(600000);
      });

      test('updates multiplier', () => {
        retryService.setConfig({ multiplier: 3 });
        
        const config = retryService.getConfig();
        expect(config.multiplier).toBe(3);
      });
    });

    describe('getConfig', () => {
      test('returns current configuration', () => {
        const config = retryService.getConfig();
        
        expect(config).toHaveProperty('maxRetries');
        expect(config).toHaveProperty('baseDelayMs');
        expect(config).toHaveProperty('maxDelayMs');
        expect(config).toHaveProperty('multiplier');
        expect(config).toHaveProperty('jitterFactor');
      });
    });
  });

  describe('processFailedSync', () => {
    test('schedules retry for retryable errors', async () => {
      const callback = async () => {
        // Callback will be called later via setTimeout
        // We just verify retry is scheduled, not that callback is called
      };

      const result = retryService.processFailedSync(
        'item-1',
        'kas',
        'create',
        'record-1',
        'Network error',
        undefined,
        callback
      );

      expect(result.shouldRetry).toBe(true);
      expect(result.delayMs).toBe(1000); // First retry: 1s
    });

    test('does not schedule retry for non-retryable errors', () => {
      const callback = async () => {};

      const result = retryService.processFailedSync(
        'item-1',
        'kas',
        'create',
        'record-1',
        'Unauthorized',
        401,
        callback
      );

      expect(result.shouldRetry).toBe(false);
      expect(result.delayMs).toBeNull();
    });

    test('does not schedule retry when max retries reached', () => {
      // Set max retries to 1 for easier testing
      retryService.setConfig({ maxRetries: 1 });
      
      const callback = async () => {};

      // First failure
      retryService.processFailedSync(
        'item-1',
        'kas',
        'create',
        'record-1',
        'Network error',
        undefined,
        callback
      );

      // Second failure should not retry
      const result = retryService.processFailedSync(
        'item-1',
        'kas',
        'create',
        'record-1',
        'Network error',
        undefined,
        callback
      );

      expect(result.shouldRetry).toBe(false);
    });
  });

  describe('Retry Summary', () => {
    describe('getRetrySummary', () => {
      test('returns zeros initially', () => {
        const summary = retryService.getRetrySummary();
        
        expect(summary.totalRetries).toBe(0);
        expect(summary.pendingRetries).toBe(0);
        expect(summary.activeRetries).toBe(0);
        expect(summary.failedItems).toBe(0);
        expect(summary.maxRetriesReached).toBe(0);
        expect(summary.retrySequence).toHaveLength(5);
      });
    });
  });

  describe('UI Status', () => {
    describe('getRetryStatusForUI', () => {
      test('returns null for unknown item', () => {
        const status = retryService.getRetryStatusForUI('unknown', 'kas', 'record-1');
        expect(status).toBeNull();
      });

      test('returns correct status for retrying item', () => {
        retryService.markForRetry('item-1', 'Network error', undefined);
        
        const status = retryService.getRetryStatusForUI('item-1', 'kas', 'record-1');
        
        expect(status).not.toBeNull();
        expect(status?.itemId).toBe('item-1');
        expect(status?.attempt).toBe(1);
        expect(status?.maxRetries).toBe(5);
        expect(status?.progress).toBe('Attempt 1 of 5');
        expect(status?.statusColor).toBe('yellow');
      });
    });
  });
});

describe('RetrySequence', () => {
  test('exponential backoff follows correct sequence', () => {
    retryService.setConfig({
      maxRetries: 5,
      baseDelayMs: 1000,
      multiplier: 2,
      jitterFactor: 0,
    });

    const sequence = retryService.getRetrySequence();
    
    // Sequence should be: 1s, 2s, 4s, 8s, 16s
    expect(sequence[0]).toBe(1000);   // 1s
    expect(sequence[1]).toBe(2000);   // 2s
    expect(sequence[2]).toBe(4000);   // 4s
    expect(sequence[3]).toBe(8000);   // 8s
    expect(sequence[4]).toBe(16000);  // 16s
  });
});
