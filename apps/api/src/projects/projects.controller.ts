import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Delete,
  UseGuards,
} from '@nestjs/common';

import { UpdateProjectDto } from './dto/update-project.dto.js';
import { ProjectsService } from './projects.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/current-user.decorator.js';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.findAll(user.userId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateProjectDto,
  ) {
    return this.projectsService.create(
      user.userId,
      body,
    );
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const project = await this.projectsService.findOne(
      id,
      user.userId,
    );

    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    return project;
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProjectDto,
  ) {
    const project = await this.projectsService.update(
      id,
      user.userId,
      body
    );

    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    return project;
  }

  
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.projectsService.remove(
      id,
      user.userId,
    );

    if (!result) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    return result;
  }



}