import { ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const prismaMock = {
    $queryRaw: vi.fn(),
  };

  const redisClientMock = {
    status: 'ready',
    get: vi.fn(),
  };

  const queueMock = {
    getBackend: () => ({ client: Promise.resolve(redisClientMock) }),
  };

  let controller: HealthController;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redisClientMock.status = 'ready';
    redisClientMock.get.mockResolvedValue(null);

    controller = new HealthController(
      prismaMock as never,
      queueMock as never,
    );
  });

  it('returns ok when PostgreSQL and Redis are available', async () => {
    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      database: 'up',
      redis: 'up',
    });
  });

  it('returns 503 when PostgreSQL is unavailable', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const error = await controller.check().catch((caught) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getResponse()).toEqual({
      status: 'error',
      database: 'down',
      redis: 'up',
    });
  });

  it('returns 503 when Redis is unavailable', async () => {
    redisClientMock.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const error = await controller.check().catch((caught) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getResponse()).toEqual({
      status: 'error',
      database: 'up',
      redis: 'down',
    });
  });

  it('returns 503 without querying Redis if the connection is not ready', async () => {
    redisClientMock.status = 'reconnecting';

    const error = await controller.check().catch((caught) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getResponse()).toMatchObject({ redis: 'down' });
    expect(redisClientMock.get).not.toHaveBeenCalled();
  });

  it('returns 503 if Redis does not answer in time', async () => {
    vi.useFakeTimers();
    redisClientMock.get.mockReturnValueOnce(new Promise(() => {}));

    try {
      const result = controller.check().catch((caught) => caught);
      await vi.advanceTimersByTimeAsync(2_000);
      const error = await result;

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.getResponse()).toMatchObject({ redis: 'down' });
    } finally {
      vi.useRealTimers();
    }
  });
});
