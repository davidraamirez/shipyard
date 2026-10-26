import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DeploymentsService {
  constructor(
    @InjectQueue('deployments')
    private readonly deploymentsQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async enqueue(
    userId: string,
    projectId: string,
 ) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
      },
    });

    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    const deployment = await this.prisma.deployment.create({
        data: {
        projectId: project.id,
        status: 'QUEUED',
        },
    });

    let job 
    try {
      job = await this.deploymentsQueue.add('deploy-project', {
          deploymentId: deployment.id,
          projectId: project.id,
          repositoryUrl: project.repositoryUrl,
          requestedAt: new Date().toISOString(),
        }, 
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );
    } catch (error) {  
      try {
        await this.prisma.deployment.update({
          where: { id: deployment.id },
          data: { status: 'FAILED' },
        });
      } catch (databaseError) {
        console.error(
          `No se pudo actualizar el deployment ${deployment.id}:`,
          databaseError,
        );
      }

      throw error;
    }
    return {
        message: 'Deployment añadido a la cola',
        deploymentId: deployment.id,
        jobId: job.id,
        status: deployment.status,
    };
  }

  async retry(id: string, userId: string) {
    const deployment = await this.prisma.deployment.findFirst({
      where: {
        id,
        project: {
          userId,
        },
      },
      include: {
        project: true,
      },
    });

    if (!deployment) {
      throw new NotFoundException('Deployment no encontrado');
    }

    if (deployment.status !== 'FAILED') {
      throw new BadRequestException(
        'Solo se pueden reintentar deployments fallidos',
      );
    }

    await this.prisma.deployment.update({
      where: {
        id: deployment.id,
      },
      data: {
        status: 'QUEUED',
      },
    });

    let job;

    try {
      job = await this.deploymentsQueue.add('deploy-project', {
          deploymentId: deployment.id,
          projectId: deployment.projectId,
          repositoryUrl: deployment.project.repositoryUrl,
          requestedAt: new Date().toISOString(),
        }, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );
    } catch (error) {
      try {
        await this.prisma.deployment.update({
          where: { id: deployment.id },
          data: { status: 'FAILED' },
        });
      } catch (databaseError) {
        console.error(
          `No se pudo restaurar el estado del deployment ${deployment.id}:`,
          databaseError,
        );
      }

      throw error;
    }

    return {
      message: 'Deployment añadido de nuevo a la cola',
      deploymentId: deployment.id,
      jobId: job.id,
      status: 'QUEUED',
    };
  }
  async findOne(id: string, userId: string) {
    return this.prisma.deployment.findFirst({
      where: {
        id,
        project: {
          userId,
        },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            repositoryUrl: true,
          },
        },
      },
    });
  }
  

  async findByProject(projectId: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    return this.prisma.deployment.findMany({
      where: {
        projectId: project.id,
      },
      orderBy: {
        createdAt: 'desc',
     },
    });
  }

  
  async findLogs(id: string, userId: string) {
    const deployment = await this.prisma.deployment.findFirst({
      where: {
        id,
        project: {
          userId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!deployment) {
      throw new NotFoundException('Deployment no encontrado');
    }

    return this.prisma.deploymentLog.findMany({
      where: {
        deploymentId: deployment.id,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

}