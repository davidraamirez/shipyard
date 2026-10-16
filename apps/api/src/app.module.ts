import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ConfigModule } from '@nestjs/config';
import { DeploymentsModule } from './deployments/deployments.module.js';
import { BullModule } from '@nestjs/bullmq';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        host: '127.0.0.1',
        port: 6379,
      },
    }),
    PrismaModule,
    ProjectsModule,
    AuthModule,
    DeploymentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}