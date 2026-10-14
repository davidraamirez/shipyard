import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.project.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  create(
    userId: string, 
    data: CreateProjectDto
  ) {
    return this.prisma.project.create({
      data: {
        name: data.name,
        repositoryUrl: data.repositoryUrl,
        userId,
      },
    });
  }

  findOne(id: string, userId: string) {
    return this.prisma.project.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        deployments: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });
  }

  
  async update(
    id: string,
    userId: string,
    data: UpdateProjectDto,
  ) {
    const result = await this.prisma.project.updateMany({
      where: {
        id,
        userId,
      },
      data,
    });

    if (result.count === 0) {
      return null;
    }

    return this.prisma.project.findFirst({
      where: {
        id,
        userId,
      },
    });
  }


  async remove(id: string, userId: string) {
    const result = await this.prisma.project.deleteMany({
      where: {
        id,
        userId,
      },
    });

    if (result.count === 0) {
      return null;
    }

    return { deleted: true };
  }

}