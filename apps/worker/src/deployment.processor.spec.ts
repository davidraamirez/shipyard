import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, gitMock, detectorMock, buildMock } = vi.hoisted(() => ({
  prismaMock: {
    deployment: {
      update: vi.fn(),
    },
    deploymentLog: {
      create: vi.fn(),
    },
  },
  gitMock: {
    cloneRepository: vi.fn(),
    getHeadCommit: vi.fn(),
    removeWorkspace: vi.fn(),
  },
  detectorMock: {
    detectProject: vi.fn(),
  },
  buildMock: {
    buildProject: vi.fn(),
  },
}));


vi.mock('./prisma.js', () => ({
  prisma: prismaMock,
}));

vi.mock('./git.js', () => ({
  cloneRepository: gitMock.cloneRepository,
  getHeadCommit: gitMock.getHeadCommit,
  removeWorkspace: gitMock.removeWorkspace,
}));

vi.mock('./project-detector.js', () => ({
  detectProject: detectorMock.detectProject,
}));

vi.mock('./build.js', () => ({
  buildProject: buildMock.buildProject,
}));

import { UnrecoverableError } from 'bullmq';
import { processDeployment } from './deployment.processor.js';
import { PermanentDeploymentError } from './errors.js';

const COMMIT_SHA = 'a'.repeat(40);

describe('processDeployment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.deploymentLog.create.mockResolvedValue({
      id: 'log-1',
    });
    gitMock.cloneRepository.mockResolvedValue(
      '/app/workspaces/deployment-1',
    );
    gitMock.getHeadCommit.mockResolvedValue(COMMIT_SHA);
    gitMock.removeWorkspace.mockResolvedValue(undefined);
    detectorMock.detectProject.mockResolvedValue({
      type: 'NODE',
      packageManager: 'pnpm',
      buildScript: 'build',
    });

    // Simula el build-runner: emite salida y termina bien.
    buildMock.buildProject.mockImplementation(
      async (_id: string, _workspace: string, _info: unknown, onOutput: (text: string) => Promise<void>) => {
        await onOutput('\n> tsc\nBuild completado\n');
        // Un trozo vacío no genera log.
        await onOutput('\n\n');
      },
    );
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
      data: { commitSha: COMMIT_SHA },
    });

    expect(prismaMock.deployment.update).toHaveBeenNthCalledWith(3, {
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
      data: { commitSha: COMMIT_SHA },
    });

    expect(prismaMock.deployment.update).toHaveBeenNthCalledWith(3, {
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

    const messages = prismaMock.deploymentLog.create.mock.calls.map(
      ([args]) => args.data.message,
    );

    expect(messages).toEqual([
      'Inicio del intento 1/1',
      'Estado actualizado a BUILDING',
      'Repositorio clonado correctamente',
      'Commit: aaaaaaa',
      'Tipo de proyecto detectado: NODE',
      'Gestor de paquetes: pnpm',
      'Script build: build',
      'Iniciando build del proyecto',
      '> tsc\nBuild completado',
      'Build completado correctamente',
      'Estado actualizado a RUNNING',
    ]);

    expect(gitMock.cloneRepository).toHaveBeenCalledWith(
      'https://github.com/example/app',
      'deployment-1',
    );
  });

  it('falla sin ejecutar el build si el tipo de proyecto no es compatible', async () => {
    detectorMock.detectProject.mockResolvedValueOnce({
      type: 'UNKNOWN',
      packageManager: null,
      buildScript: null,
    });

    const error = await processDeployment(deploymentJob, {
      attemptsMade: 0,
      maxAttempts: 3,
    }).catch((caught) => caught);

    // No se reintenta aunque queden intentos: BullMQ recibe un UnrecoverableError.
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(error.message).toBe(
      'Tipo de proyecto no compatible para build: UNKNOWN',
    );
    expect(buildMock.buildProject).not.toHaveBeenCalled();
    expect(gitMock.removeWorkspace).toHaveBeenCalledWith(
      '/app/workspaces/deployment-1',
    );
    expect(prismaMock.deployment.update).toHaveBeenLastCalledWith({
      where: { id: 'deployment-1' },
      data: { status: 'FAILED' },
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

  it('no marca como RUNNING si falla el build', async () => {
    const buildError = new Error('Falló la compilación');

    prismaMock.deployment.update.mockResolvedValueOnce({
      id: 'deployment-1',
      status: 'BUILDING',
    });

    buildMock.buildProject.mockRejectedValueOnce(buildError);

    await expect(
      processDeployment(deploymentJob, {
        attemptsMade: 0,
        maxAttempts: 3,
      }),
    ).rejects.toThrow('Falló la compilación');

    expect(buildMock.buildProject).toHaveBeenCalledWith(
      'deployment-1',
      '/app/workspaces/deployment-1',    
      {
        type: 'NODE',
        packageManager: 'pnpm',
        buildScript: 'build',
      },
      expect.any(Function),
    );

    expect(prismaMock.deployment.update).toHaveBeenCalledTimes(2);

    expect(prismaMock.deployment.update).not.toHaveBeenCalledWith({
      where: { id: 'deployment-1' },
      data: { status: 'FAILED' },
    });

    expect(prismaMock.deploymentLog.create).toHaveBeenCalledWith({
      data: {
        deploymentId: 'deployment-1',
        level: 'WARN',
        message:
          'Falló el intento 1/3: Falló la compilación. BullMQ podrá reintentarlo.',
      },
    });
  });


  it('elimina el workspace al terminar correctamente', async () => {
    await processDeployment(deploymentJob);

    expect(gitMock.removeWorkspace).toHaveBeenCalledWith(
      '/app/workspaces/deployment-1',
    );
  });

  it('elimina el workspace aunque falle el build', async () => {
    buildMock.buildProject.mockRejectedValueOnce(new Error('Falló'));

    await expect(processDeployment(deploymentJob)).rejects.toThrow('Falló');

    expect(gitMock.removeWorkspace).toHaveBeenCalledWith(
      '/app/workspaces/deployment-1',
    );
  });

  it('no intenta limpiar si el clonado falla', async () => {
    gitMock.cloneRepository.mockRejectedValueOnce(new Error('Sin red'));

    await expect(processDeployment(deploymentJob)).rejects.toThrow('Sin red');

    expect(gitMock.removeWorkspace).not.toHaveBeenCalled();
  });

  it('no falla el job si no se puede eliminar el workspace', async () => {
    gitMock.removeWorkspace.mockRejectedValueOnce(new Error('EBUSY'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      await expect(processDeployment(deploymentJob)).resolves.toMatchObject({
        status: 'RUNNING',
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it('reintenta los errores transitorios mientras queden intentos', async () => {
    buildMock.buildProject.mockRejectedValueOnce(new Error('Timeout'));

    const error = await processDeployment(deploymentJob, {
      attemptsMade: 0,
      maxAttempts: 3,
    }).catch((caught) => caught);

    expect(error).not.toBeInstanceOf(UnrecoverableError);
    expect(error.message).toBe('Timeout');
  });

  it('marca FAILED a la primera si el error es permanente', async () => {
    buildMock.buildProject.mockRejectedValueOnce(
      new PermanentDeploymentError('No se encuentra pnpm-lock.yaml'),
    );

    const error = await processDeployment(deploymentJob, {
      attemptsMade: 0,
      maxAttempts: 3,
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(prismaMock.deployment.update).toHaveBeenLastCalledWith({
      where: { id: 'deployment-1' },
      data: { status: 'FAILED' },
    });
    expect(prismaMock.deploymentLog.create).toHaveBeenCalledWith({
      data: {
        deploymentId: 'deployment-1',
        level: 'ERROR',
        message: 'Error no recuperable: No se encuentra pnpm-lock.yaml',
      },
    });
  });

  it('descarta el job sin reintentar si el deployment ya no existe', async () => {
    prismaMock.deployment.update.mockRejectedValueOnce(
      Object.assign(new Error('Record not found'), { code: 'P2025' }),
    );
    const consoleWarn = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    try {
      const error = await processDeployment(deploymentJob, {
        attemptsMade: 0,
        maxAttempts: 3,
      }).catch((caught) => caught);

      expect(error).toBeInstanceOf(UnrecoverableError);
      expect(error.message).toBe('El deployment ya no existe');
      expect(prismaMock.deployment.update).toHaveBeenCalledTimes(1);
      expect(gitMock.cloneRepository).not.toHaveBeenCalled();
    } finally {
      consoleWarn.mockRestore();
    }
  });
});
