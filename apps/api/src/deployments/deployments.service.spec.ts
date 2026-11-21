import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

const mocks = vi.hoisted(() => ({
  project: {
    findFirst: vi.fn(),
  },
  deployment: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
  },
  deploymentLog: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  queueAdd: vi.fn(),
}));

vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

import { DeploymentsService } from './deployments.service.js';

describe('DeploymentsService', () => {
  let service: DeploymentsService;

  const prismaMock = {
    project: mocks.project,
    deployment: mocks.deployment,
    deploymentLog: mocks.deploymentLog,
  };

  const queueMock = {
    add: mocks.queueAdd,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deployment.updateMany.mockResolvedValue({ count: 1 });
    service = new DeploymentsService(queueMock as any, prismaMock as any);
  });

  describe('enqueue', () => {
    it('creates a deployment and queues it', async () => {
      mocks.project.findFirst.mockResolvedValue({
        id: 'project-1',
        repositoryUrl: 'https://github.com/example/shipyard',
      });
      mocks.deployment.create.mockResolvedValue({
        id: 'deployment-1',
        status: 'QUEUED',
      });
      mocks.queueAdd.mockResolvedValue({ id: 'job-1' });

      const result = await service.enqueue(
        'user-1',
        'project-1',
      );

      expect(result).toEqual({
        message: 'Deployment queued',
        deploymentId: 'deployment-1',
        jobId: 'job-1',
        status: 'QUEUED',
      });

      expect(mocks.project.findFirst).toHaveBeenCalledWith({
        where: { id: 'project-1', userId: 'user-1' },
      });

      expect(mocks.deployment.create).toHaveBeenCalledWith({
        data: {
          projectId: 'project-1',
          status: 'QUEUED',
        },
      });

      expect(mocks.queueAdd).toHaveBeenCalledWith(
        'deploy-project',
        expect.objectContaining({
          deploymentId: 'deployment-1',
          projectId: 'project-1',
          repositoryUrl: 'https://github.com/example/shipyard',
        }),
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );
    });

    it('rejects a project that does not belong to the user', async () => {
      mocks.project.findFirst.mockResolvedValue(null);

      await expect(
        service.enqueue('user-1', 'project-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mocks.deployment.create).not.toHaveBeenCalled();
      expect(mocks.queueAdd).not.toHaveBeenCalled();
    });

    
    it('marks the deployment as FAILED if Redis fails', async () => {
      const redisError = new Error('Redis unavailable');

      mocks.project.findFirst.mockResolvedValue({
        id: 'project-1',
        repositoryUrl: 'https://github.com/example/shipyard',
      });

      mocks.deployment.create.mockResolvedValue({
        id: 'deployment-1',
        status: 'QUEUED',
      });

      mocks.queueAdd.mockRejectedValue(redisError);
      mocks.deployment.update.mockResolvedValue({});

      await expect(
        service.enqueue('user-1', 'project-1'),
      ).rejects.toBe(redisError);

      expect(mocks.deployment.update).toHaveBeenCalledWith({
        where: { id: 'deployment-1' },
        data: { status: 'FAILED' },
      });
    });

    it('propagates the Redis error even if the FAILED update also fails', async () => {
      const redisError = new Error('Redis unavailable');
      const databaseError = new Error('PostgreSQL unavailable');

      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      try {
        mocks.project.findFirst.mockResolvedValue({
          id: 'project-1',
          repositoryUrl: 'https://github.com/example/shipyard',
        });

        mocks.deployment.create.mockResolvedValue({
          id: 'deployment-1',
          status: 'QUEUED',
        });

        mocks.queueAdd.mockRejectedValue(redisError);
        mocks.deployment.update.mockRejectedValue(databaseError);

        await expect(
          service.enqueue('user-1', 'project-1'),
        ).rejects.toBe(redisError);

        expect(mocks.deployment.update).toHaveBeenCalledWith({
          where: { id: 'deployment-1' },
          data: { status: 'FAILED' },
        });

        expect(consoleError).toHaveBeenCalledWith(
          expect.stringContaining('Could not mark deployment'),
          databaseError,
        );
      } finally {
        consoleError.mockRestore();
      }
    });

  });

  describe('retry', () => {
    it('retries a failed deployment', async () => {
      mocks.deployment.findFirst.mockResolvedValue({
        id: 'deployment-1',
        projectId: 'project-1',
        status: 'FAILED',
        project: {
          repositoryUrl: 'https://github.com/example/shipyard',
        },
      });
      mocks.deployment.update.mockResolvedValue({});
      mocks.queueAdd.mockResolvedValue({ id: 'job-2' });

      const result = await service.retry('deployment-1', 'user-1');

      expect(result).toEqual({
        message: 'Deployment queued again',
        deploymentId: 'deployment-1',
        jobId: 'job-2',
        status: 'QUEUED',
      });

      expect(mocks.deployment.updateMany).toHaveBeenCalledWith({
        where: { id: 'deployment-1', status: 'FAILED' },
        data: { status: 'QUEUED' },
      });

      expect(mocks.queueAdd).toHaveBeenCalledWith(
        'deploy-project',
        expect.objectContaining({
          deploymentId: 'deployment-1',
          projectId: 'project-1',
          repositoryUrl: 'https://github.com/example/shipyard',
        }),
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );
    });

    it('rejects a deployment that does not exist or belongs to another user', async () => {
      mocks.deployment.findFirst.mockResolvedValue(null);

      await expect(
        service.retry('deployment-1', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mocks.deployment.update).not.toHaveBeenCalled();
      expect(mocks.queueAdd).not.toHaveBeenCalled();
    });

    it('rejects the retry if the deployment has not failed', async () => {
      mocks.deployment.findFirst.mockResolvedValue({
        id: 'deployment-1',
        projectId: 'project-1',
        status: 'RUNNING',
        project: {
          repositoryUrl: 'https://github.com/example/shipyard',
        },
      });

      await expect(
        service.retry('deployment-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.deployment.update).not.toHaveBeenCalled();
      expect(mocks.queueAdd).not.toHaveBeenCalled();
    });
    
    it('rejects a second concurrent retry without queueing another job', async () => {
      mocks.deployment.findFirst.mockResolvedValue({
        id: 'deployment-1',
        projectId: 'project-1',
        status: 'FAILED',
        project: {
          repositoryUrl: 'https://github.com/example/shipyard',
        },
      });
      // Another retry already moved it to QUEUED between the read and the update.
      mocks.deployment.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.retry('deployment-1', 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(mocks.queueAdd).not.toHaveBeenCalled();
    });

    it('marks the deployment as FAILED if Redis fails while retrying', async () => {
      const redisError = new Error('Redis unavailable');

      mocks.deployment.findFirst.mockResolvedValue({
        id: 'deployment-1',
        projectId: 'project-1',
        status: 'FAILED',
        project: {
          repositoryUrl: 'https://github.com/example/shipyard',
        },
      });

      mocks.deployment.update.mockResolvedValue({});
      mocks.queueAdd.mockRejectedValue(redisError);

      await expect(
        service.retry('deployment-1', 'user-1'),
      ).rejects.toBe(redisError);

      expect(mocks.deployment.updateMany).toHaveBeenCalledWith({
        where: { id: 'deployment-1', status: 'FAILED' },
        data: { status: 'QUEUED' },
      });

      expect(mocks.deployment.update).toHaveBeenCalledWith({
        where: { id: 'deployment-1' },
        data: { status: 'FAILED' },
      });
    });

    it('propagates the Redis error even if the FAILED update fails while retrying', async () => {
      const redisError = new Error('Redis unavailable');
      const databaseError = new Error('PostgreSQL unavailable');

      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      try {
        mocks.deployment.findFirst.mockResolvedValue({
          id: 'deployment-1',
          projectId: 'project-1',
          status: 'FAILED',
          project: {
            repositoryUrl: 'https://github.com/example/shipyard',
          },
        });

        mocks.deployment.update.mockRejectedValueOnce(databaseError);

        mocks.queueAdd.mockRejectedValue(redisError);

        await expect(
          service.retry('deployment-1', 'user-1'),
        ).rejects.toBe(redisError);

        expect(mocks.deployment.updateMany).toHaveBeenCalledWith({
          where: { id: 'deployment-1', status: 'FAILED' },
          data: { status: 'QUEUED' },
        });

        expect(mocks.deployment.update).toHaveBeenCalledWith({
          where: { id: 'deployment-1' },
          data: { status: 'FAILED' },
        });

        expect(consoleError).toHaveBeenCalledWith(
          expect.stringContaining('Could not mark deployment'),
          databaseError,
        );
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  describe('findOne', () => {
    it('scopes the deployment lookup to the user', async () => {
      const deployment = { id: 'deployment-1', status: 'RUNNING' };
      mocks.deployment.findFirst.mockResolvedValue(deployment);

      await expect(
        service.findOne('deployment-1', 'user-1'),
      ).resolves.toEqual(deployment);

      expect(mocks.deployment.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'deployment-1',
          project: { userId: 'user-1' },
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
    });
  });

  describe('findByProject', () => {
    it('lists the project deployments', async () => {
      const deployments = [{ id: 'deployment-1', status: 'RUNNING' }];

      mocks.project.findFirst.mockResolvedValue({ id: 'project-1' });
      mocks.deployment.findMany.mockResolvedValue(deployments);

      await expect(
        service.findByProject('project-1', 'user-1'),
      ).resolves.toEqual(deployments);

      expect(mocks.deployment.findMany).toHaveBeenCalledWith({
        where: { projectId: 'project-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('rejects a project that does not belong to the user', async () => {
      mocks.project.findFirst.mockResolvedValue(null);

      await expect(
        service.findByProject('project-1', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mocks.deployment.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findLogs', () => {
    const deploymentId = '3f8a2b1c-4d5e-4f60-8a7b-9c0d1e2f3a4b';
    const cursorId = '5a8a2b1c-4d5e-4f60-8a7b-9c0d1e2f3a4b';

    beforeEach(() => {
      mocks.deployment.findFirst.mockResolvedValue({ id: deploymentId });
      mocks.deploymentLog.findMany.mockResolvedValue([]);
    });

    it('returns all logs in a stable order without a cursor', async () => {
      await service.findLogs(deploymentId, 'user-1');

      expect(mocks.deployment.findFirst).toHaveBeenCalledWith({
        where: { id: deploymentId, project: { userId: 'user-1' } },
        select: { id: true },
      });
      expect(mocks.deploymentLog.findMany).toHaveBeenCalledWith({
        where: { deploymentId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 1000,
      });
    });

    it('returns only the logs after the cursor', async () => {
      mocks.deploymentLog.findFirst.mockResolvedValue({ id: cursorId });

      await service.findLogs(deploymentId, 'user-1', cursorId);

      expect(mocks.deploymentLog.findFirst).toHaveBeenCalledWith({
        where: { id: cursorId, deploymentId },
        select: { id: true },
      });
      expect(mocks.deploymentLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: cursorId }, skip: 1 }),
      );
    });

    it('rejects a cursor from another deployment', async () => {
      mocks.deploymentLog.findFirst.mockResolvedValue(null);

      await expect(
        service.findLogs(deploymentId, 'user-1', cursorId),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.deploymentLog.findMany).not.toHaveBeenCalled();
    });

    it('returns 404 if the deployment belongs to another user', async () => {
      mocks.deployment.findFirst.mockResolvedValue(null);

      await expect(
        service.findLogs(deploymentId, 'user-2'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mocks.deploymentLog.findMany).not.toHaveBeenCalled();
    });
  });
});
