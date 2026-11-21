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

    // Simulates the build-runner: emits output and succeeds.
    buildMock.buildProject.mockImplementation(
      async (_id: string, _workspace: string, _info: unknown, onOutput: (text: string) => Promise<void>) => {
        await onOutput('\n> tsc\nBuild done\n');
        // An empty chunk creates no log.
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

  it('marks the deployment BUILDING and then RUNNING', async () => {
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

  it('marks the deployment FAILED if processing fails', async () => {
    const processingError = new Error('Error updating the deployment');

    prismaMock.deployment.update
      .mockRejectedValueOnce(processingError)
      .mockResolvedValueOnce({ id: 'deployment-1', status: 'FAILED' });

    await expect(processDeployment(deploymentJob)).rejects.toThrow(
      'Error updating the deployment',
    );

    expect(prismaMock.deployment.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'deployment-1' },
      data: { status: 'FAILED' },
    });
  });

  it('propagates the original error even if the FAILED update also fails', async () => {
    const processingError = new Error('Processing error');
    const databaseError = new Error('PostgreSQL error');

    prismaMock.deployment.update
      .mockRejectedValueOnce(processingError)
      .mockRejectedValueOnce(databaseError);

    await expect(processDeployment(deploymentJob)).rejects.toThrow(
      'Processing error',
    );

    expect(prismaMock.deployment.update).toHaveBeenCalledTimes(2);
  });

  it('does not mark RUNNING if setting BUILDING fails', async () => {
    const processingError = new Error('Could not set BUILDING');

    prismaMock.deployment.update
      .mockRejectedValueOnce(processingError)
      .mockResolvedValueOnce({ id: 'deployment-1', status: 'FAILED' });

    await expect(processDeployment(deploymentJob)).rejects.toThrow(
      'Could not set BUILDING',
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

  it('does not mark FAILED while retries remain', async () => {
    const processingError = new Error('Temporary failure');

    prismaMock.deployment.update.mockRejectedValueOnce(processingError);

    await expect(
      processDeployment(deploymentJob, {
        attemptsMade: 0,
        maxAttempts: 3,
      }),
    ).rejects.toThrow('Temporary failure');

    expect(prismaMock.deployment.update).toHaveBeenCalledTimes(1);

    expect(prismaMock.deployment.update).toHaveBeenCalledWith({
      where: { id: 'deployment-1' },
      data: { status: 'BUILDING' },
    });
  });

  it('marks FAILED when the last attempt fails', async () => {
    const processingError = new Error('Final failure');

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
    ).rejects.toThrow('Final failure');

    expect(prismaMock.deployment.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'deployment-1' },
      data: { status: 'FAILED' },
    });
  });

  
  it('sets BUILDING again when a deployment is reprocessed', async () => {
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

  
  it('stores logs when starting and completing a deployment', async () => {
    prismaMock.deployment.update
      .mockResolvedValueOnce({ id: 'deployment-1', status: 'BUILDING' })
      .mockResolvedValueOnce({ id: 'deployment-1', status: 'RUNNING' });

    await processDeployment(deploymentJob);

    const messages = prismaMock.deploymentLog.create.mock.calls.map(
      ([args]) => args.data.message,
    );

    expect(messages).toEqual([
      'Starting attempt 1/1',
      'Status set to BUILDING',
      'Repository cloned',
      'Commit: aaaaaaa',
      'Detected project type: NODE',
      'Package manager: pnpm',
      'Build script: build',
      'Starting project build',
      '> tsc\nBuild done',
      'Build completed',
      'Status set to RUNNING',
    ]);

    expect(gitMock.cloneRepository).toHaveBeenCalledWith(
      'https://github.com/example/app',
      'deployment-1',
    );
  });

  it('fails without building if the project type is unsupported', async () => {
    detectorMock.detectProject.mockResolvedValueOnce({
      type: 'UNKNOWN',
      packageManager: null,
      buildScript: null,
    });

    const error = await processDeployment(deploymentJob, {
      attemptsMade: 0,
      maxAttempts: 3,
    }).catch((caught) => caught);

    // Not retried even with attempts left: BullMQ gets an UnrecoverableError.
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(error.message).toBe(
      'Unsupported project type for build: UNKNOWN',
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

  it('logs a WARN when an attempt fails and retries remain', async () => {
    prismaMock.deployment.update.mockRejectedValueOnce(
      new Error('Temporary failure'),
    );

    await expect(
      processDeployment(deploymentJob, {
        attemptsMade: 0,
        maxAttempts: 3,
      }),
    ).rejects.toThrow('Temporary failure');

    expect(prismaMock.deploymentLog.create).toHaveBeenCalledWith({
      data: {
        deploymentId: 'deployment-1',
        level: 'WARN',
        message:
          'Attempt 1/3 failed: Temporary failure. BullMQ will retry it.',
      },
    });
  });

  it('does not interrupt the deployment if saving a log fails', async () => {
    prismaMock.deploymentLog.create.mockRejectedValue(
      new Error('Could not save the log'),
    );

    prismaMock.deployment.update
      .mockResolvedValueOnce({ id: 'deployment-1', status: 'BUILDING' })
      .mockResolvedValueOnce({ id: 'deployment-1', status: 'RUNNING' });

    const result = await processDeployment(deploymentJob);

    expect(result.status).toBe('RUNNING');
  });

  it('does not mark RUNNING if the build fails', async () => {
    const buildError = new Error('Compilation failed');

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
    ).rejects.toThrow('Compilation failed');

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
          'Attempt 1/3 failed: Compilation failed. BullMQ will retry it.',
      },
    });
  });


  it('removes the workspace after succeeding', async () => {
    await processDeployment(deploymentJob);

    expect(gitMock.removeWorkspace).toHaveBeenCalledWith(
      '/app/workspaces/deployment-1',
    );
  });

  it('removes the workspace even if the build fails', async () => {
    buildMock.buildProject.mockRejectedValueOnce(new Error('Failed'));

    await expect(processDeployment(deploymentJob)).rejects.toThrow('Failed');

    expect(gitMock.removeWorkspace).toHaveBeenCalledWith(
      '/app/workspaces/deployment-1',
    );
  });

  it('does not clean up if cloning fails', async () => {
    gitMock.cloneRepository.mockRejectedValueOnce(new Error('No network'));

    await expect(processDeployment(deploymentJob)).rejects.toThrow('No network');

    expect(gitMock.removeWorkspace).not.toHaveBeenCalled();
  });

  it('does not fail the job if the workspace cannot be removed', async () => {
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

  it('retries transient errors while attempts remain', async () => {
    buildMock.buildProject.mockRejectedValueOnce(new Error('Timeout'));

    const error = await processDeployment(deploymentJob, {
      attemptsMade: 0,
      maxAttempts: 3,
    }).catch((caught) => caught);

    expect(error).not.toBeInstanceOf(UnrecoverableError);
    expect(error.message).toBe('Timeout');
  });

  it('marks FAILED right away on a permanent error', async () => {
    buildMock.buildProject.mockRejectedValueOnce(
      new PermanentDeploymentError('pnpm-lock.yaml not found'),
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
        message: 'Unrecoverable error: pnpm-lock.yaml not found',
      },
    });
  });

  it('drops the job without retrying if the deployment no longer exists', async () => {
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
      expect(error.message).toBe('The deployment no longer exists');
      expect(prismaMock.deployment.update).toHaveBeenCalledTimes(1);
      expect(gitMock.cloneRepository).not.toHaveBeenCalled();
    } finally {
      consoleWarn.mockRestore();
    }
  });
});
