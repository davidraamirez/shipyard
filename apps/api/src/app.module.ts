import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ConfigModule } from '@nestjs/config';


@Module({
  imports: [PrismaModule, ProjectsModule, AuthModule, ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}