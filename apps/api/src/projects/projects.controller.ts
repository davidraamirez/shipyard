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
} from '@nestjs/common';

import { UpdateProjectDto } from './dto/update-project.dto.js';
import { ProjectsService } from './projects.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @Post()
  create(@Body() body: CreateProjectDto) {
    return this.projectsService.create(body);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const project = await this.projectsService.findOne(id);

    if (!project) {
        throw new NotFoundException('Proyecto no encontrado');
    }

    return project;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateProjectDto,
  ) {
    try {
      return await this.projectsService.update(id, body);
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'PrismaClientKnownRequestError' &&
        'code' in error &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Proyecto no encontrado');
      }

      throw error;
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      return await this.projectsService.remove(id);
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'PrismaClientKnownRequestError' &&
        'code' in error &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Proyecto no encontrado');
      }

      throw error;
    }
  }


}