import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DEPLOYMENTS_QUEUE } from '@shipyard/shared';
import { PrismaService } from '../prisma/prisma.service.js';

type DependencyStatus = 'up' | 'down';

const HEALTH_CHECK_KEY = 'shipyard:health';
const REDIS_TIMEOUT_MS = 2_000;

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(DEPLOYMENTS_QUEUE)
    private readonly deploymentsQueue: Queue,
  ) {}

  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const result = {
      status: database === 'up' && redis === 'up' ? 'ok' : 'error',
      database,
      redis,
    };

    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }

    return result;
  }

  private async checkDatabase(): Promise<DependencyStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }

  // BullMQ 6's generic client has no PING: we check the connection
  // status and do a cheap read with a timeout, because ioredis
  // queues commands while reconnecting and the request could hang.
  private async checkRedis(): Promise<DependencyStatus> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const client = await this.deploymentsQueue.getBackend().client;

      if (client.status !== 'ready') {
        return 'down';
      }

      await Promise.race([
        client.get(HEALTH_CHECK_KEY),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Redis health check timeout')),
            REDIS_TIMEOUT_MS,
          );
        }),
      ]);

      return 'up';
    } catch {
      return 'down';
    } finally {
      clearTimeout(timeout);
    }
  }
}
