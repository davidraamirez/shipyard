import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DEPLOYMENTS_QUEUE } from '@shipyard/shared';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    BullModule.registerQueue({
      name: DEPLOYMENTS_QUEUE,
    }),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
