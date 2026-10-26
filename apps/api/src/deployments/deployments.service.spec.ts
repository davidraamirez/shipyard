import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mocks = vi.hoisted(() => ({
  project: {
    findFirst: vi.fn(),
  },
  deployment: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
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
  };

  const queueMock = {
    add: mocks.queueAdd,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DeploymentsService(queueMock as any, prismaMock as any);
  });

  describe('enqueue', () => {
    it('debe crear un deployment y añadirlo a la cola', async () => {
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
        message: 'Deployment añadido a la cola',
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

    it('debe rechazar un proyecto que no pertenece al usuario', async () => {
      mocks.project.findFirst.mockResolvedValue(null);

      await expect(
        service.enqueue('user-1', 'project-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mocks.deployment.create).not.toHaveBeenCalled();
      expect(mocks.queueAdd).not.toHaveBeenCalled();
    });

    
    it('debe marcar como FAILED el deployment si Redis falla', async () => {
      const redisError = new Error('Redis no disponible');

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

    it('debe propagar el error de Redis aunque también falle la actualización a FAILED', async () => {
      const redisError = new Error('Redis no disponible');
      const databaseError = new Error('PostgreSQL no disponible');

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
          expect.stringContaining('No se pudo actualizar el deployment'),
          databaseError,
        );
      } finally {
        consoleError.mockRestore();
      }
    });

  });

  describe('retry', () => {
    it('debe reintentar un deployment fallido', async () => {
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
        message: 'Deployment añadido de nuevo a la cola',
        deploymentId: 'deployment-1',
        jobId: 'job-2',
        status: 'QUEUED',
      });

      expect(mocks.deployment.update).toHaveBeenCalledWith({
        where: { id: 'deployment-1' },
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

    it('debe rechazar un deployment inexistente o ajeno al usuario', async () => {
      mocks.deployment.findFirst.mockResolvedValue(null);

      await expect(
        service.retry('deployment-1', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mocks.deployment.update).not.toHaveBeenCalled();
      expect(mocks.queueAdd).not.toHaveBeenCalled();
    });

    it('debe rechazar el reintento si el deployment no ha fallado', async () => {
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
    
    it('debe marcar como FAILED el deployment si Redis falla al reintentar', async () => {
      const redisError = new Error('Redis no disponible');

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

      expect(mocks.deployment.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'deployment-1' },
        data: { status: 'QUEUED' },
      });

      expect(mocks.deployment.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'deployment-1' },
        data: { status: 'FAILED' },
      });
    });

    it('debe propagar el error de Redis aunque falle la actualización a FAILED durante el reintento', async () => {
      const redisError = new Error('Redis no disponible');
      const databaseError = new Error('PostgreSQL no disponible');

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

        mocks.deployment.update
          .mockResolvedValueOnce({})
          .mockRejectedValueOnce(databaseError);

        mocks.queueAdd.mockRejectedValue(redisError);

        await expect(
          service.retry('deployment-1', 'user-1'),
        ).rejects.toBe(redisError);

        expect(mocks.deployment.update).toHaveBeenNthCalledWith(1, {
          where: { id: 'deployment-1' },
          data: { status: 'QUEUED' },
        });

        expect(mocks.deployment.update).toHaveBeenNthCalledWith(2, {
          where: { id: 'deployment-1' },
          data: { status: 'FAILED' },
        });

        expect(consoleError).toHaveBeenCalledWith(
          expect.stringContaining('No se pudo restaurar el estado'),
          databaseError,
        );
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  describe('findOne', () => {
    it('debe buscar el deployment dentro del ámbito del usuario', async () => {
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
    it('debe listar los deployments del proyecto', async () => {
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

    it('debe rechazar un proyecto que no pertenece al usuario', async () => {
      mocks.project.findFirst.mockResolvedValue(null);

      await expect(
        service.findByProject('project-1', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mocks.deployment.findMany).not.toHaveBeenCalled();
    });
  });
});