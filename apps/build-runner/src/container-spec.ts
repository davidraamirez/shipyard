import {
  INSTALL_ARGS,
  isAllowedBuildCommand,
  isDeploymentId,
  type BuildCommand,
} from '@shipyard/shared';
import type { BuildRunnerConfig } from './config.js';

export type BuildStep = 'install' | 'build';

export const DEPLOYMENT_LABEL = 'shipyard.deployment';

// UID del usuario "node", el mismo que clona el repositorio en el worker.
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

// Única fuente de la configuración de un contenedor de build. Nada de la
// petición llega aquí sin validar: el id es un UUID y el comando sale de la
// lista blanca. Crear contenedores equivale a root en el host, así que toda
// restricción de seguridad tiene que estar fijada aquí.
export function createContainerSpec({
  deploymentId,
  command,
  config,
}: ContainerSpecInput) {
  if (!isDeploymentId(deploymentId)) {
    throw new Error('deploymentId no válido');
  }

  if (!isAllowedBuildCommand(command)) {
    throw new Error('Combinación de comando y argumentos no permitida');
  }

  const step = getBuildStep(command);

  return {
    Image: config.image,
    Cmd: [command.command, ...command.args],
    User: BUILD_USER,
    WorkingDir: '/workspace',
    // Con Tty la salida llega sin multiplexar (stdout y stderr juntos).
    Tty: true,
    AttachStdin: false,
    OpenStdin: false,
    // La instalación necesita el registro de paquetes; el build no tiene red.
    NetworkDisabled: step === 'build',
    Labels: {
      [DEPLOYMENT_LABEL]: deploymentId,
      'shipyard.step': step,
    },
    HostConfig: {
      NetworkMode: step === 'install' ? config.installNetwork : 'none',
      // Cada build solo ve la carpeta de su deployment dentro del volumen.
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
