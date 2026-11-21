import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  DEPLOY_PROJECT_JOB,
  DEPLOYMENTS_QUEUE,
  type DeploymentJob,
} from '@shipyard/shared';
import { PrismaService } from '../prisma/prisma.service.js';

const DEPLOYMENT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
} as const;

@Injectable()
export class DeploymentsService {
  constructor(
    @InjectQueue(DEPLOYMENTS_QUEUE)
    private readonly deploymentsQueue: Queue<DeploymentJob>,
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

    const job = await this.queueDeployment(
      deployment.id,
      project.id,
      project.repositoryUrl,
    );

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

    // Comprobación y cambio en una sola operación: si llegan dos reintentos a
    // la vez, solo uno pasa de FAILED a QUEUED y encola el job.
    const { count } = await this.prisma.deployment.updateMany({
      where: {
        id: deployment.id,
        status: 'FAILED',
      },
      data: {
        status: 'QUEUED',
      },
    });

    if (count === 0) {
      throw new ConflictException('El deployment ya se está reintentando');
    }

    const job = await this.queueDeployment(
      deployment.id,
      deployment.projectId,
      deployment.project.repositoryUrl,
    );

    return {
      message: 'Deployment añadido de nuevo a la cola',
      deploymentId: deployment.id,
      jobId: job.id,
      status: 'QUEUED',
    };
  }

  // Encola el job; si Redis falla, deja el deployment en FAILED para que
  // no se quede en QUEUED para siempre, y propaga el error original.
  private async queueDeployment(
    deploymentId: string,
    projectId: string,
    repositoryUrl: string,
  ) {
    try {
      return await this.deploymentsQueue.add(
        DEPLOY_PROJECT_JOB,
        {
          deploymentId,
          projectId,
          repositoryUrl,
          requestedAt: new Date().toISOString(),
        },
        DEPLOYMENT_JOB_OPTIONS,
      );
    } catch (error) {
      try {
        await this.prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'FAILED' },
        });
      } catch (databaseError) {
        console.error(
          `No se pudo marcar como FAILED el deployment ${deploymentId}:`,
          databaseError,
        );
      }

      throw error;
    }
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