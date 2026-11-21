import { BUILD_ARGS, INSTALL_ARGS } from '@shipyard/shared';
import { describe, expect, it } from 'vitest';
import type { BuildRunnerConfig } from './config.js';
import {
  createContainerSpec,
  getBuildStep,
  getContainerName,
} from './container-spec.js';

const deploymentId = '123e4567-e89b-12d3-a456-426614174000';

const config: BuildRunnerConfig = {
  dockerHost: 'http://docker-proxy:2375',
  image: 'shipyard-build-node:22',
  workspacesVolume: 'shipyard_workspaces',
  workspacesDir: '/app/workspaces',
  installNetwork: 'shipyard_build_egress',
  stepTimeoutMs: 600_000,
  maxConcurrentBuilds: 2,
  memoryBytes: 1024 * 1024 * 1024,
  nanoCpus: 1_000_000_000,
  pidsLimit: 256,
  maxOutputChars: 200_000,
};

const install = { command: 'pnpm' as const, args: [...INSTALL_ARGS.pnpm] };
const build = { command: 'pnpm' as const, args: [...BUILD_ARGS.pnpm] };

describe('createContainerSpec', () => {
  it('runs exactly the allowed command as an unprivileged user', () => {
    const spec = createContainerSpec({ deploymentId, command: install, config });

    expect(spec.Image).toBe('shipyard-build-node:22');
    expect(spec.Cmd).toEqual(['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts']);
    expect(spec.User).toBe('1000:1000');
    expect(spec.WorkingDir).toBe('/workspace');
  });

  it('applies every security restriction', () => {
    const { HostConfig } = createContainerSpec({ deploymentId, command: build, config });

    expect(HostConfig.Privileged).toBe(false);
    expect(HostConfig.ReadonlyRootfs).toBe(true);
    expect(HostConfig.CapDrop).toEqual(['ALL']);
    expect(HostConfig.SecurityOpt).toEqual(['no-new-privileges:true']);
    expect(HostConfig.Memory).toBe(config.memoryBytes);
    expect(HostConfig.MemorySwap).toBe(config.memoryBytes);
    expect(HostConfig.NanoCpus).toBe(config.nanoCpus);
    expect(HostConfig.PidsLimit).toBe(config.pidsLimit);
  });

  it('mounts nothing but the deployment folder', () => {
    const { HostConfig } = createContainerSpec({ deploymentId, command: build, config });

    expect(HostConfig.Mounts).toEqual([
      {
        Type: 'volume',
        Source: 'shipyard_workspaces',
        Target: '/workspace',
        ReadOnly: false,
        VolumeOptions: { Subpath: deploymentId, NoCopy: true },
      },
    ]);
    expect(HostConfig).not.toHaveProperty('Binds');
  });

  it('gives network access only to dependency installation', () => {
    const installSpec = createContainerSpec({ deploymentId, command: install, config });
    const buildSpec = createContainerSpec({ deploymentId, command: build, config });

    expect(installSpec.HostConfig.NetworkMode).toBe('shipyard_build_egress');
    expect(installSpec.NetworkDisabled).toBe(false);
    expect(buildSpec.HostConfig.NetworkMode).toBe('none');
    expect(buildSpec.NetworkDisabled).toBe(true);
  });

  it('labels the container so orphans can be cleaned up', () => {
    const spec = createContainerSpec({ deploymentId, command: install, config });

    expect(spec.Labels).toEqual({
      'shipyard.deployment': deploymentId,
      'shipyard.step': 'install',
    });
  });

  it('rejects a non-UUID deploymentId', () => {
    expect(() =>
      createContainerSpec({ deploymentId: '../../etc', command: install, config }),
    ).toThrow('Invalid deploymentId');
  });

  it('rejects commands outside the allowlist', () => {
    expect(() =>
      createContainerSpec({
        deploymentId,
        command: { command: 'pnpm', args: ['exec', 'sh'] },
        config,
      }),
    ).toThrow('Command and arguments combination not allowed');
  });
});

describe('getBuildStep', () => {
  it('tells install and build apart for every package manager', () => {
    for (const manager of ['pnpm', 'npm', 'yarn'] as const) {
      expect(getBuildStep({ command: manager, args: [...INSTALL_ARGS[manager]] })).toBe('install');
      expect(getBuildStep({ command: manager, args: [...BUILD_ARGS[manager]] })).toBe('build');
    }
  });
});

describe('getContainerName', () => {
  it('includes the deployment and the step', () => {
    expect(getContainerName(deploymentId, 'build')).toBe(
      `shipyard-build-${deploymentId}-build`,
    );
  });
});
