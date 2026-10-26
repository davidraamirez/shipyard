
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    deployment: {
      update: vi.fn(),
    },
    deploymentLog: {
      create: vi.fn(),
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
    prismaMock.deploymentLog.create.mockResolvedValue({
      id: 'log-1',
    });
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

  it('no marca el deployment como RUNNING si falla al establecer BUILDING', async () => {
    const processingError = new Error('No se pudo establecer BUILDING');

    prismaMock.deployment.update
      .mockRejectedValueOnce(processingError)
      .mockResolvedValueOnce({ id: 'deployment-1', status: 'FAILED' });

    await expect(processDeployment(deploymentJob)).rejects.toThrow(
      'No se pudo establecer BUILDING',
    );

    expect(prismaMock.deployment.update).toHaveBeenCalledTimes(2);

    expect(prismaMock.deployment.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'deployment-1' },
      data: { status: 'BUILDING' },
    });

    expect(prismaMock.deployment.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'deployment-1' },
      data: { status: 'FAILED' },
    });
  });

  it('no marca como FAILED si todavía quedan reintentos', async () => {
    const processingError = new Error('Fallo temporal');

    prismaMock.deployment.update.mockRejectedValueOnce(processingError);

    await expect(
      processDeployment(deploymentJob, {
        attemptsMade: 0,
        maxAttempts: 3,
      }),
    ).rejects.toThrow('Fallo temporal');

    expect(prismaMock.deployment.update).toHaveBeenCalledTimes(1);

    expect(prismaMock.deployment.update).toHaveBeenCalledWith({
      where: { id: 'deployment-1' },
      data: { status: 'BUILDING' },
    });
  });

  it('marca como FAILED cuando falla el último intento', async () => {
    const processingError = new Error('Fallo definitivo');

    prismaMock.deployment.update
      .mockRejectedValueOnce(processingError)
      .mockResolvedValueOnce({
        id: 'deployment-1',
        status: 'FAILED',
      });

    await expect(
      processDeployment(deploymentJob, {
        attemptsMade: 2,
        maxAttempts: 3,
      }),
    ).rejects.toThrow('Fallo definitivo');

    expect(prismaMock.deployment.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'deployment-1' },
      data: { status: 'FAILED' },
    });
  });

  
  it('vuelve a establecer BUILDING cuando un deployment se procesa de nuevo', async () => {
    prismaMock.deployment.update
      .mockResolvedValueOnce({
        id: 'deployment-1',
        status: 'BUILDING',
      })
      .mockResolvedValueOnce({
        id: 'deployment-1',
        status: 'RUNNING',
      });

    const result = await processDeployment(deploymentJob, {
      attemptsMade: 1,
      maxAttempts: 3,
    });

    expect(prismaMock.deployment.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'deployment-1' },
      data: { status: 'BUILDING' },
    });

    expect(prismaMock.deployment.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'deployment-1' },
      data: { status: 'RUNNING' },
    });

    expect(result.status).toBe('RUNNING');
  });

  
  it('guarda logs al iniciar y completar un deployment', async () => {
    prismaMock.deployment.update
      .mockResolvedValueOnce({ id: 'deployment-1', status: 'BUILDING' })
      .mockResolvedValueOnce({ id: 'deployment-1', status: 'RUNNING' });

    await processDeployment(deploymentJob);

    expect(prismaMock.deploymentLog.create).toHaveBeenCalledWith({
      data: {
        deploymentId: 'deployment-1',
        level: 'INFO',
        message: 'Inicio del intento 1/1',
      },
    });

    expect(prismaMock.deploymentLog.create).toHaveBeenCalledWith({
      data: {
        deploymentId: 'deployment-1',
        level: 'INFO',
        message: 'Estado actualizado a BUILDING',
      },
    });

    expect(prismaMock.deploymentLog.create).toHaveBeenCalledWith({
      data: {
        deploymentId: 'deployment-1',
        level: 'INFO',
        message: 'Deployment completado correctamente. Estado: RUNNING',
      },
    });
  });

  it('registra un WARN cuando un intento falla y quedan reintentos', async () => {
    prismaMock.deployment.update.mockRejectedValueOnce(
      new Error('Fallo temporal'),
    );

    await expect(
      processDeployment(deploymentJob, {
        attemptsMade: 0,
        maxAttempts: 3,
      }),
    ).rejects.toThrow('Fallo temporal');

    expect(prismaMock.deploymentLog.create).toHaveBeenCalledWith({
      data: {
        deploymentId: 'deployment-1',
        level: 'WARN',
        message:
          'Falló el intento 1/3: Fallo temporal. BullMQ podrá reintentarlo.',
      },
    });
  });

  it('no interrumpe el deployment si falla el guardado de un log', async () => {
    prismaMock.deploymentLog.create.mockRejectedValue(
      new Error('No se pudo guardar el log'),
    );

    prismaMock.deployment.update
      .mockResolvedValueOnce({ id: 'deployment-1', status: 'BUILDING' })
      .mockResolvedValueOnce({ id: 'deployment-1', status: 'RUNNING' });

    const result = await processDeployment(deploymentJob);

    expect(result.status).toBe('RUNNING');
  });

});
