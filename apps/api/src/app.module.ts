import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ConfigModule } from '@nestjs/config';
import { DeploymentsModule } from './deployments/deployments.module.js';
import { BullModule } from '@nestjs/bullmq';
import { HealthModule } from './health/health.module.js';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD,
      },
    }),
    PrismaModule,
    ProjectsModule,
    AuthModule,
    DeploymentsModule,
    HealthModule,
  ],
})
export class AppModule {}