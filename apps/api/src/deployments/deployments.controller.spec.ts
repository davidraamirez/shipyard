import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  findOne: vi.fn(),
  findByProject: vi.fn(),
  retry: vi.fn(),
}));

vi.mock('./deployments.service.js', () => ({
  DeploymentsService: class DeploymentsService {
    enqueue = mocks.enqueue;
    findOne = mocks.findOne;
    findByProject = mocks.findByProject;
    retry = mocks.retry;
  },
}));

import { DeploymentsController } from './deployments.controller.js';

describe('DeploymentsController', () => {
  let controller: DeploymentsController;

  const request = {
    user: {
      userId: 'user-1',
      email: 'bob@example.com',
    },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new DeploymentsController({
      enqueue: mocks.enqueue,
      findOne: mocks.findOne,
      findByProject: mocks.findByProject,
      retry: mocks.retry,
    } as any);
  });

  it('debe crear un deployment para el usuario autenticado', async () => {
    const body = {
      projectId: 'project-1',
      repositoryUrl: 'https://github.com/example/shipyard',
    };
    const result = {
      deploymentId: 'deployment-1',
      jobId: 'job-1',
      status: 'QUEUED',
    };

    mocks.enqueue.mockResolvedValue(result);

    await expect(
      controller.create(request, body),
    ).resolves.toEqual(result);

    expect(mocks.enqueue).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      'https://github.com/example/shipyard',
    );
  });

  it('debe devolver un deployment existente', async () => {
    const deployment = {
      id: 'deployment-1',
      status: 'RUNNING',
    };
    mocks.findOne.mockResolvedValue(deployment);

    await expect(
      controller.findOne(request, 'deployment-1'),
    ).resolves.toEqual(deployment);

    expect(mocks.findOne).toHaveBeenCalledWith(
      'deployment-1',
      'user-1',
    );
  });

  it('debe lanzar NotFoundException si el deployment no existe', async () => {
    mocks.findOne.mockResolvedValue(null);

    await expect(
      controller.findOne(request, 'missing-deployment'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('debe listar los deployments de un proyecto', async () => {
    const deployments = [
      { id: 'deployment-1', status: 'RUNNING' },
      { id: 'deployment-2', status: 'FAILED' },
    ];
    mocks.findByProject.mockResolvedValue(deployments);

    await expect(
      controller.findByProject(request, 'project-1'),
    ).resolves.toEqual(deployments);

    expect(mocks.findByProject).toHaveBeenCalledWith(
      'project-1',
      'user-1',
    );
  });

  it('debe reintentar un deployment para el usuario autenticado', async () => {
    const result = {
      deploymentId: 'deployment-1',
      jobId: 'job-2',
      status: 'QUEUED',
    };
    mocks.retry.mockResolvedValue(result);

    await expect(
      controller.retry(request, 'deployment-1'),
    ).resolves.toEqual(result);

    expect(mocks.retry).toHaveBeenCalledWith(
      'deployment-1',
      'user-1',
    );
  });
});