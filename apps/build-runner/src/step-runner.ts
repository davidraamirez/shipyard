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

// Runs a command in an ephemeral container and returns its exit code.
// It does not use /containers/{id}/wait: the proxy cuts requests at 10 min.
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

    // Leftovers from an interrupted previous attempt (build-runner restart).
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

        // State first: if it has finished, the logs are complete.
        const state = await this.docker.inspectContainer(id);
        await emitNewOutput();

        if (!state.running) {
          return state.exitCode;
        }

        if (Date.now() > deadline) {
          await this.docker.killContainer(id);
          throw new StepTimeoutError(
            `"${command.command} ${command.args[0]}" exceeded the time limit of ${Math.round(this.config.stepTimeoutMs / 1000)} s`,
          );
        }
      }
    } finally {
      await this.docker.removeContainer(id).catch((error: unknown) => {
        console.error(`Could not remove container ${id}:`, error);
      });
    }
  }
}
