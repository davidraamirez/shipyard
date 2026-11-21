import { BUILD_ARGS, INSTALL_ARGS } from '@shipyard/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuildRunnerConfig } from './config.js';
import type { DockerClient } from './docker-client.js';
import { DockerStepRunner, StepTimeoutError } from './step-runner.js';

const deploymentId = '123e4567-e89b-12d3-a456-426614174000';
const install = { command: 'pnpm' as const, args: [...INSTALL_ARGS.pnpm] };
const build = { command: 'pnpm' as const, args: [...BUILD_ARGS.pnpm] };

const config = {
  image: 'shipyard-build-node:22',
  workspacesVolume: 'shipyard_workspaces',
  installNetwork: 'shipyard_build_egress',
  stepTimeoutMs: 60_000,
  memoryBytes: 1,
  nanoCpus: 1,
  pidsLimit: 1,
} as BuildRunnerConfig;

function createDockerMock() {
  return {
    createContainer: vi.fn().mockResolvedValue('container-1'),
    startContainer: vi.fn().mockResolvedValue(undefined),
    inspectContainer: vi.fn(),
    containerLogs: vi.fn(),
    killContainer: vi.fn().mockResolvedValue(undefined),
    removeContainer: vi.fn().mockResolvedValue(undefined),
  };
}

describe('DockerStepRunner', () => {
  let docker: ReturnType<typeof createDockerMock>;

  beforeEach(() => {
    docker = createDockerMock();
  });

  const createRunner = (overrides: Partial<BuildRunnerConfig> = {}) =>
    new DockerStepRunner(
      docker as unknown as DockerClient,
      { ...config, ...overrides },
      0,
    );

  it('emite la salida incremental y devuelve el código de salida', async () => {
    docker.inspectContainer
      .mockResolvedValueOnce({ running: true, exitCode: 0 })
      .mockResolvedValueOnce({ running: false, exitCode: 0 });
    docker.containerLogs
      .mockResolvedValueOnce('linea 1\n')
      .mockResolvedValueOnce('linea 1\nlinea 2\n');
    const chunks: string[] = [];

    const exitCode = await createRunner().run(deploymentId, install, (text) => chunks.push(text));

    expect(exitCode).toBe(0);
    expect(chunks).toEqual(['linea 1\n', 'linea 2\n']);
  });

  it('crea el contenedor con nombre y configuración del paso', async () => {
    docker.inspectContainer.mockResolvedValue({ running: false, exitCode: 0 });
    docker.containerLogs.mockResolvedValue('');

    await createRunner().run(deploymentId, build, () => {});

    const [name, spec] = docker.createContainer.mock.calls[0];
    expect(name).toBe(`shipyard-build-${deploymentId}-build`);
    expect(spec.HostConfig.NetworkMode).toBe('none');
  });

  it('elimina restos de un intento anterior antes de crear el contenedor', async () => {
    docker.inspectContainer.mockResolvedValue({ running: false, exitCode: 0 });
    docker.containerLogs.mockResolvedValue('');

    await createRunner().run(deploymentId, install, () => {});

    expect(docker.removeContainer).toHaveBeenNthCalledWith(
      1,
      `shipyard-build-${deploymentId}-install`,
    );
    expect(docker.removeContainer.mock.invocationCallOrder[0]).toBeLessThan(
      docker.createContainer.mock.invocationCallOrder[0],
    );
  });

  it('elimina siempre el contenedor al terminar', async () => {
    docker.inspectContainer.mockResolvedValue({ running: false, exitCode: 1 });
    docker.containerLogs.mockResolvedValue('');

    await expect(createRunner().run(deploymentId, install, () => {})).resolves.toBe(1);

    expect(docker.removeContainer).toHaveBeenLastCalledWith('container-1');
  });

  it('mata y elimina el contenedor al superar el tiempo límite', async () => {
    docker.inspectContainer.mockResolvedValue({ running: true, exitCode: 0 });
    docker.containerLogs.mockResolvedValue('');

    await expect(
      createRunner({ stepTimeoutMs: 0 }).run(deploymentId, install, () => {}),
    ).rejects.toBeInstanceOf(StepTimeoutError);

    expect(docker.killContainer).toHaveBeenCalledWith('container-1');
    expect(docker.removeContainer).toHaveBeenLastCalledWith('container-1');
  });

  it('elimina el contenedor aunque falle el arranque', async () => {
    docker.startContainer.mockRejectedValueOnce(new Error('No such image'));

    await expect(createRunner().run(deploymentId, install, () => {})).rejects.toThrow(
      'No such image',
    );

    expect(docker.removeContainer).toHaveBeenLastCalledWith('container-1');
  });
});
