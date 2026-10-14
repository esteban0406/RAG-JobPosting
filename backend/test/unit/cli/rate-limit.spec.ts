import { Logger } from '@nestjs/common';
import { retryRateLimited } from '../../../src/cli/rate-limit.js';

const logger = { warn: jest.fn() } as unknown as Logger;

describe('retryRateLimited', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('waits out a 429 and runs the call again', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce('ok');

    const result = retryRateLimited(fn, logger);
    await jest.advanceTimersByTimeAsync(60_000);

    await expect(result).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('rethrows other errors at once', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(retryRateLimited(fn, logger)).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
