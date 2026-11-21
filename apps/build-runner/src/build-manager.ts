import type { BuildCommand } from '@shipyard/shared';
import type { BuildRequest } from './build-request.js';
import { getBuildStep, type BuildStep } from './container-spec.js';
import type { StepRunner } from './step-runner.js';

export type BuildStatus = 'running' | 'succeeded' | 'failed';

export type BuildSnapshot = {
  deploymentId: string;
  status: BuildStatus;
  // Output from the requested offset; nextOffset is the next "after".
  output: string;
  nextOffset: number;
  truncated: boolean;
  error: string | null;
  // Step that failed. null if it was an infrastructure (Docker) failure.
  failedStep: BuildStep | null;
};

type BuildState = {
  deploymentId: string;
  status: BuildStatus;
  output: string;
  truncated: boolean;
  error: string | null;
  failedStep: BuildStep | null;
};

export class BuildBusyError extends Error {
  override name = 'BuildBusyError';
}

type BuildManagerOptions = {
  maxConcurrentBuilds: number;
  maxOutputChars: number;
  retentionMs?: number;
};

// ANSI escape sequences (colors, cursor) and carriage returns from progress
// bars: they add nothing to stored logs.
const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/g;

function cleanOutput(text: string): string {
  return text.replace(ANSI_PATTERN, '').replace(/\r(?!\n)/g, '\n').replace(/\r\n/g, '\n');
}

function describe(command: BuildCommand): string {
  return [command.command, ...command.args].join(' ');
}

// In-memory build state. It is lost if the build-runner restarts,
// and the worker gets a 404, which it treats as a transient error.
export class BuildManager {
  private readonly builds = new Map<string, BuildState>();
  private readonly retentionMs: number;

  constructor(
    private readonly runner: StepRunner,
    private readonly options: BuildManagerOptions,
  ) {
    this.retentionMs = options.retentionMs ?? 30 * 60 * 1000;
  }

  start(request: BuildRequest): BuildSnapshot {
    const existing = this.builds.get(request.deploymentId);

    // Idempotent: repeating the POST while running does not start another build.
    if (existing?.status === 'running') {
      return this.snapshot(existing, 0);
    }

    if (this.runningCount() >= this.options.maxConcurrentBuilds) {
      throw new BuildBusyError('Maximum number of concurrent builds reached');
    }

    const state: BuildState = {
      deploymentId: request.deploymentId,
      status: 'running',
      output: '',
      truncated: false,
      error: null,
      failedStep: null,
    };

    this.builds.set(request.deploymentId, state);
    void this.execute(state, request.commands);

    return this.snapshot(state, 0);
  }

  get(deploymentId: string, after = 0): BuildSnapshot | null {
    const state = this.builds.get(deploymentId);
    return state ? this.snapshot(state, after) : null;
  }

  private runningCount(): number {
    let count = 0;
    for (const build of this.builds.values()) {
      if (build.status === 'running') count++;
    }
    return count;
  }

  private snapshot(state: BuildState, after: number): BuildSnapshot {
    const offset = Math.min(Math.max(0, after), state.output.length);

    return {
      deploymentId: state.deploymentId,
      status: state.status,
      output: state.output.slice(offset),
      nextOffset: state.output.length,
      truncated: state.truncated,
      error: state.error,
      failedStep: state.failedStep,
    };
  }

  private append(state: BuildState, text: string) {
    if (state.truncated) return;

    const clean = cleanOutput(text);
    const remaining = this.options.maxOutputChars - state.output.length;

    if (clean.length <= remaining) {
      state.output += clean;
      return;
    }

    state.output += clean.slice(0, Math.max(0, remaining));
    state.output += '\n[output truncated]\n';
    state.truncated = true;
  }

  private async execute(state: BuildState, commands: BuildCommand[]) {
    let currentStep: BuildStep | null = null;

    try {
      for (const command of commands) {
        currentStep = getBuildStep(command);
        this.append(state, `$ ${describe(command)}\n`);

        const exitCode = await this.runner.run(
          state.deploymentId,
          command,
          (text) => this.append(state, text),
        );

        if (exitCode !== 0) {
          state.status = 'failed';
          state.failedStep = currentStep;
          state.error = `"${describe(command)}" exited with code ${exitCode}`;
          return;
        }
      }

      state.status = 'succeeded';
    } catch (error) {
      state.status = 'failed';
      // A timeout is the step's fault; any other error is Docker's.
      state.failedStep =
        error instanceof Error && error.name === 'StepTimeoutError'
          ? currentStep
          : null;
      state.error = error instanceof Error ? error.message : String(error);
    } finally {
      const timer = setTimeout(() => {
        if (this.builds.get(state.deploymentId) === state) {
          this.builds.delete(state.deploymentId);
        }
      }, this.retentionMs);
      timer.unref();
    }
  }
}
