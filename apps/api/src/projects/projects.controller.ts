import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';

import { UpdateProjectDto } from './dto/update-project.dto.js';
import { ProjectsService } from './projects.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import type { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
  };
}

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.projectsService.findAll(request.user.userId);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateProjectDto,
  ) {
    return this.projectsService.create(
      request.user.userId,
      body,
    );
  }

  @Get(':id')
  async findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const project = await this.projectsService.findOne(
      id,
      request.user.userId,
    );

    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    return project;
  }

  @Patch(':id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateProjectDto,
  ) {
    const project = await this.projectsService.update(
      id,
      request.user.userId,
      body
    );

    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    return project;
  }

  
  @Delete(':id')
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const result = await this.projectsService.remove(
      id,
      request.user.userId,
    );

    if (!result) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    return result;
  }



}