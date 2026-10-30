import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * NFR13: Retry failed requests up to 3 times with exponential backoff (1s, 2s, 4s).
 * Tests a retryWithBackoff utility and verifies transient errors surface "Retry" recovery.
 */

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

describe('retryWithBackoff (NFR13)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('succeeds immediately if the first attempt works', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const promise = retryWithBackoff(fn);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries up to 3 times before surfacing the error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('network timeout'));
    const promise = retryWithBackoff(fn).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('network timeout');
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('succeeds on the 2nd attempt after 1 retry', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValue('recovered');
    const promise = retryWithBackoff(fn);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('succeeds on the 3rd attempt after 2 retries', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockResolvedValue('third-time');
    const promise = retryWithBackoff(fn);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('third-time');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('applies exponential backoff delays: 1s, 2s, 4s', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const promise = retryWithBackoff(fn).catch(() => {});

    // After initial call, first delay is 1000ms
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);

    // Second delay is 2000ms
    await vi.advanceTimersByTimeAsync(1999);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(3);

    // Third delay is 4000ms
    await vi.advanceTimersByTimeAsync(3999);
    expect(fn).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(4);

    await promise;
  });

  it('surfaces a user-friendly error after all retries fail', async () => {
    const { classifyError, createUserFriendlyMessage } =
      await import('../../src/shared/types/domain/agent-error');
    const networkErr = new Error('network timeout');
    const fn = vi.fn().mockRejectedValue(networkErr);
    const promise = retryWithBackoff(fn).catch((e: unknown) => e);
    await vi.runAllTimersAsync();

    const err = await promise;
    const category = classifyError(err);
    const message = createUserFriendlyMessage(category);
    expect(category).toBe('network-error');
    expect(message).toMatch(/trouble reaching|try again/i);
  });
});
