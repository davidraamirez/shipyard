import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.project.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  create(data: {
    name: string;
    repositoryUrl: string;
    userId: string;
  }) {
    return this.prisma.project.create({
      data: {
        name: data.name,
        repositoryUrl: data.repositoryUrl,
        userId: data.userId,
      },
    });
  }

  findOne(id: string) {
    return this.prisma.project.findUnique({
      where: { id },
      include: {
        deployments: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });
  }

  update(
    id: string,
    data: {
      name?: string;
      repositoryUrl?: string;
    },
  ) {
    return this.prisma.project.update({
      where: { id },
      data,
    });
  }

  remove(id: string) {
    return this.prisma.project.delete({
      where: { id },
    });
  }

}