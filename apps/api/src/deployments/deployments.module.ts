import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DEPLOYMENTS_QUEUE } from '@shipyard/shared';
import { DeploymentsController } from './deployments.controller.js';
import { DeploymentsService } from './deployments.service.js';

@Module({
  imports: [
    BullModule.registerQueue({
      name: DEPLOYMENTS_QUEUE,
    }),
  ],
  controllers: [DeploymentsController],
  providers: [DeploymentsService],
  exports: [DeploymentsService],
})
export class DeploymentsModule {}