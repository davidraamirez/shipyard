
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    deployment: {
      update: vi.fn(),
    },
  },
}));

vi.mock('./prisma.js', () => ({
  prisma: prismaMock,
}));

import { processDeployment } from './deployment.processor.js';

describe('processDeployment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const deploymentJob = {
    deploymentId: 'deployment-1',
    projectId: 'project-1',
    repositoryUrl: 'https://github.com/example/app',
    requestedAt: new Date().toISOString(),
  };

  it('marca el deployment como BUILDING y después RUNNING', async () => {
    prismaMock.deployment.update
      .mockResolvedValueOnce({ id: 'deployment-1', status: 'BUILDING' })
      .mockResolvedValueOnce({ id: 'deployment-1', status: 'RUNNING' });

    const result = await processDeployment(deploymentJob);

    expect(prismaMock.deployment.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'deployment-1' },
      data: { status: 'BUILDING' },
    });

    expect(prismaMock.deployment.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'deployment-1' },
      data: { status: 'RUNNING' },
    });

    expect(result).toEqual({
      success: true,
      deploymentId: 'deployment-1',
      status: 'RUNNING',
    });
  });

  it('marca el deployment como FAILED si falla el procesamiento', async () => {
    const processingError = new Error('Error al actualizar el deployment');

    prismaMock.deployment.update
      .mockRejectedValueOnce(processingError)
      .mockResolvedValueOnce({ id: 'deployment-1', status: 'FAILED' });

    await expect(processDeployment(deploymentJob)).rejects.toThrow(
      'Error al actualizar el deployment',
    );

    expect(prismaMock.deployment.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'deployment-1' },
      data: { status: 'FAILED' },
    });
  });

  it('propaga el error original aunque también falle la actualización a FAILED', async () => {
    const processingError = new Error('Error de procesamiento');
    const databaseError = new Error('Error de PostgreSQL');

    prismaMock.deployment.update
      .mockRejectedValueOnce(processingError)
      .mockRejectedValueOnce(databaseError);

    await expect(processDeployment(deploymentJob)).rejects.toThrow(
      'Error de procesamiento',
    );

    expect(prismaMock.deployment.update).toHaveBeenCalledTimes(2);
  });
});
