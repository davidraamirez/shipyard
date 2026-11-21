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

const MAX_LOGS_PER_PAGE = 1000;

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
      throw new NotFoundException('Project not found');
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
        message: 'Deployment queued',
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
      throw new NotFoundException('Deployment not found');
    }

    if (deployment.status !== 'FAILED') {
      throw new BadRequestException(
        'Only failed deployments can be retried',
      );
    }

    // Check and update in a single operation: if two retries arrive at
    // the same time, only one moves from FAILED to QUEUED and queues the job.
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
      throw new ConflictException('The deployment is already being retried');
    }

    const job = await this.queueDeployment(
      deployment.id,
      deployment.projectId,
      deployment.project.repositoryUrl,
    );

    return {
      message: 'Deployment queued again',
      deploymentId: deployment.id,
      jobId: job.id,
      status: 'QUEUED',
    };
  }

  // Queues the job; if Redis fails, leaves the deployment FAILED so it
  // doesn't stay QUEUED forever, and rethrows the original error.
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
          `Could not mark deployment ${deploymentId} as FAILED:`,
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
      throw new NotFoundException('Project not found');
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

  
  async findLogs(id: string, userId: string, after?: string) {
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
      throw new NotFoundException('Deployment not found');
    }

    if (after) {
      // The cursor must be a log of this same deployment.
      const cursor = await this.prisma.deploymentLog.findFirst({
        where: { id: after, deploymentId: deployment.id },
        select: { id: true },
      });

      if (!cursor) {
        throw new BadRequestException('Invalid logs cursor');
      }
    }

    return this.prisma.deploymentLog.findMany({
      where: {
        deploymentId: deployment.id,
      },
      // Several logs can share a millisecond: the id breaks ties.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      take: MAX_LOGS_PER_PAGE,
    });
  }
}
