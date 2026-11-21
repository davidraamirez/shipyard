import type { BuildCommand } from '@shipyard/shared';
import type { BuildRunnerConfig } from './config.js';
import {
  createContainerSpec,
  getBuildStep,
  getContainerName,
} from './container-spec.js';
import type { DockerClient } from './docker-client.js';

const POLL_INTERVAL_MS = 1_000;

export class StepTimeoutError extends Error {
  override name = 'StepTimeoutError';
}

export type StepRunner = {
  run(
    deploymentId: string,
    command: BuildCommand,
    onOutput: (text: string) => void,
  ): Promise<number>;
};

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Ejecuta un comando en un contenedor efímero y devuelve su código de salida.
// No usa /containers/{id}/wait: el proxy corta las peticiones a los 10 min.
export class DockerStepRunner implements StepRunner {
  constructor(
    private readonly docker: DockerClient,
    private readonly config: BuildRunnerConfig,
    private readonly pollIntervalMs = POLL_INTERVAL_MS,
  ) {}

  async run(
    deploymentId: string,
    command: BuildCommand,
    onOutput: (text: string) => void,
  ): Promise<number> {
    const spec = createContainerSpec({
      deploymentId,
      command,
      config: this.config,
    });
    const name = getContainerName(deploymentId, getBuildStep(command));

    // Restos de un intento anterior interrumpido (reinicio del build-runner).
    await this.docker.removeContainer(name);

    const id = await this.docker.createContainer(name, spec);
    const deadline = Date.now() + this.config.stepTimeoutMs;
    let emitted = 0;

    const emitNewOutput = async () => {
      const logs = await this.docker.containerLogs(id);

      if (logs.length > emitted) {
        onOutput(logs.slice(emitted));
        emitted = logs.length;
      }
    };

    try {
      await this.docker.startContainer(id);

      for (;;) {
        await sleep(this.pollIntervalMs);

        // Primero el estado: si ya ha terminado, los logs están completos.
        const state = await this.docker.inspectContainer(id);
        await emitNewOutput();

        if (!state.running) {
          return state.exitCode;
        }

        if (Date.now() > deadline) {
          await this.docker.killContainer(id);
          throw new StepTimeoutError(
            `"${command.command} ${command.args[0]}" superó el tiempo límite de ${Math.round(this.config.stepTimeoutMs / 1000)} s`,
          );
        }
      }
    } finally {
      await this.docker.removeContainer(id).catch((error: unknown) => {
        console.error(`No se pudo eliminar el contenedor ${id}:`, error);
      });
    }
  }
}
