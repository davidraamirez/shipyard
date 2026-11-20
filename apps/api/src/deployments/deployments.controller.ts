import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  NotFoundException,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { DeploymentsService } from './deployments.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/current-user.decorator.js';
import { CreateDeploymentDto } from './dto/create-deployment.dto.js';

@Controller('deployments')
@UseGuards(JwtAuthGuard)
export class DeploymentsController {
  constructor(
    private readonly deploymentsService: DeploymentsService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateDeploymentDto,
  ) {
    return this.deploymentsService.enqueue(
      user.userId,
      body.projectId,
    );
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const deployment = await this.deploymentsService.findOne(
      id,
      user.userId,
    );

    if (!deployment) {
      throw new NotFoundException('Deployment no encontrado');
    }

    return deployment;
  }

  @Get('project/:projectId')
  findByProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.deploymentsService.findByProject(
      projectId,
      user.userId,
    );
  }

  @Post(':id/retry')
  async retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deploymentsService.retry(
      id,
      user.userId,
    );
  }

  
  @Get(':id/logs')
  findLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deploymentsService.findLogs(
      id,
      user.userId,
    );
  }

}
