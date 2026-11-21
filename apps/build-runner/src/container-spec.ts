import {
  INSTALL_ARGS,
  isAllowedBuildCommand,
  isDeploymentId,
  type BuildCommand,
} from '@shipyard/shared';
import type { BuildRunnerConfig } from './config.js';

export type BuildStep = 'install' | 'build';

export const DEPLOYMENT_LABEL = 'shipyard.deployment';

// UID of the "node" user, the same one that clones the repository in the worker.
const BUILD_USER = '1000:1000';

export function getBuildStep(command: BuildCommand): BuildStep {
  const installArgs = INSTALL_ARGS[command.command];

  return installArgs.length === command.args.length &&
    installArgs.every((arg, index) => arg === command.args[index])
    ? 'install'
    : 'build';
}

export function getContainerName(deploymentId: string, step: BuildStep) {
  return `shipyard-build-${deploymentId}-${step}`;
}

type ContainerSpecInput = {
  deploymentId: string;
  command: BuildCommand;
  config: BuildRunnerConfig;
};

// Single source of a build container configuration. Nothing from the
// request gets here unvalidated: the id is a UUID and the command comes from the
// allowlist. Creating containers is root-equivalent on the host, so every
// security restriction has to be set here.
export function createContainerSpec({
  deploymentId,
  command,
  config,
}: ContainerSpecInput) {
  if (!isDeploymentId(deploymentId)) {
    throw new Error('Invalid deploymentId');
  }

  if (!isAllowedBuildCommand(command)) {
    throw new Error('Command and arguments combination not allowed');
  }

  const step = getBuildStep(command);

  return {
    Image: config.image,
    Cmd: [command.command, ...command.args],
    User: BUILD_USER,
    WorkingDir: '/workspace',
    // With Tty the output is not multiplexed (stdout and stderr together).
    Tty: true,
    AttachStdin: false,
    OpenStdin: false,
    // Install needs the package registry; the build has no network.
    NetworkDisabled: step === 'build',
    Labels: {
      [DEPLOYMENT_LABEL]: deploymentId,
      'shipyard.step': step,
    },
    HostConfig: {
      NetworkMode: step === 'install' ? config.installNetwork : 'none',
      // Each build only sees its deployment folder inside the volume.
      Mounts: [
        {
          Type: 'volume',
          Source: config.workspacesVolume,
          Target: '/workspace',
          ReadOnly: false,
          VolumeOptions: {
            Subpath: deploymentId,
            NoCopy: true,
          },
        },
      ],
      ReadonlyRootfs: true,
      Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=64m' },
      Privileged: false,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges:true'],
      Memory: config.memoryBytes,
      MemorySwap: config.memoryBytes,
      NanoCpus: config.nanoCpus,
      PidsLimit: config.pidsLimit,
      AutoRemove: false,
    },
  };
}
