import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  NotFoundException,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { DeploymentsService } from './deployments.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
  };
}

@Controller('deployments')
@UseGuards(JwtAuthGuard)
export class DeploymentsController {
  constructor(
    private readonly deploymentsService: DeploymentsService,
  ) {}

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body()
    body: {
      projectId: string;
      repositoryUrl: string;
    },
  ) {
    return this.deploymentsService.enqueue(
      request.user.userId,
      body.projectId,
      body.repositoryUrl,
    );
  }

  @Get(':id')
  async findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const deployment = await this.deploymentsService.findOne(
      id,
      request.user.userId,
    );

    if (!deployment) {
      throw new NotFoundException('Deployment no encontrado');
    }

    return deployment;
  }

  @Get('project/:projectId')
  findByProject(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ) {
    return this.deploymentsService.findByProject(
      projectId,
      request.user.userId,
    );
  }

  @Post(':id/retry')
  async retry(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.deploymentsService.retry(
      id,
      request.user.userId,
    );
  }
}
