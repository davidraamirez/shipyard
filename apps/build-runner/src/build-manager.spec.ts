import { BUILD_ARGS, INSTALL_ARGS, type BuildCommand } from '@shipyard/shared';
import { describe, expect, it, vi } from 'vitest';
import { BuildBusyError, BuildManager } from './build-manager.js';
import { StepTimeoutError, type StepRunner } from './step-runner.js';

const id1 = '123e4567-e89b-12d3-a456-426614174000';
const id2 = '223e4567-e89b-12d3-a456-426614174000';
const id3 = '323e4567-e89b-12d3-a456-426614174000';

const install: BuildCommand = { command: 'npm', args: [...INSTALL_ARGS.npm] };
const build: BuildCommand = { command: 'npm', args: [...BUILD_ARGS.npm] };

type Step = { output?: string; exitCode?: number; error?: Error };

// Fake runner: each call consumes the next scripted step.
function fakeRunner(steps: Step[]) {
  const pending: Array<() => void> = [];
  let blocked = false;

  const runner: StepRunner & { release(): void; block(): void } = {
    async run(_id, _command, onOutput) {
      if (blocked) {
        await new Promise<void>((resolve) => pending.push(resolve));
      }
      const step = steps.shift() ?? {};
      if (step.output) onOutput(step.output);
      if (step.error) throw step.error;
      return step.exitCode ?? 0;
    },
    block() {
      blocked = true;
    },
    release() {
      blocked = false;
      pending.splice(0).forEach((resolve) => resolve());
    },
  };

  return runner;
}

function createManager(runner: StepRunner, overrides = {}) {
  return new BuildManager(runner, {
    maxConcurrentBuilds: 2,
    maxOutputChars: 1_000,
    ...overrides,
  });
}

async function waitForFinish(manager: BuildManager, id: string) {
  await vi.waitFor(() => {
    expect(manager.get(id)?.status).not.toBe('running');
  });
  return manager.get(id)!;
}

describe('BuildManager', () => {
  it('runs the steps in order and ends as succeeded', async () => {
    const manager = createManager(
      fakeRunner([{ output: 'added 10 packages\n' }, { output: 'built\n' }]),
    );

    expect(manager.start({ deploymentId: id1, commands: [install, build] }).status).toBe('running');

    const result = await waitForFinish(manager, id1);

    expect(result.status).toBe('succeeded');
    expect(result.output).toBe(
      '$ npm ci --ignore-scripts\nadded 10 packages\n$ npm run build --ignore-scripts\nbuilt\n',
    );
    expect(result.error).toBeNull();
  });

  it('stops at the first failing step and reports which one', async () => {
    const runner = fakeRunner([{ exitCode: 0 }, { exitCode: 2, output: 'error TS1005\n' }]);
    const spy = vi.spyOn(runner, 'run');
    const manager = createManager(runner);

    manager.start({ deploymentId: id1, commands: [install, build] });
    const result = await waitForFinish(manager, id1);

    expect(result.status).toBe('failed');
    expect(result.failedStep).toBe('build');
    expect(result.error).toBe('"npm run build --ignore-scripts" exited with code 2');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('attributes a timeout to the step that exceeded it', async () => {
    const manager = createManager(
      fakeRunner([{ error: new StepTimeoutError('exceeded the time limit') }]),
    );

    manager.start({ deploymentId: id1, commands: [install] });
    const result = await waitForFinish(manager, id1);

    expect(result.failedStep).toBe('install');
  });

  it('marks Docker errors as infrastructure failures', async () => {
    const manager = createManager(
      fakeRunner([{ error: new Error('Could not connect to Docker') }]),
    );

    manager.start({ deploymentId: id1, commands: [install] });
    const result = await waitForFinish(manager, id1);

    expect(result.status).toBe('failed');
    expect(result.failedStep).toBeNull();
    expect(result.error).toBe('Could not connect to Docker');
  });

  it('does not start a second build if the POST is repeated while running', async () => {
    const runner = fakeRunner([{}]);
    runner.block();
    const spy = vi.spyOn(runner, 'run');
    const manager = createManager(runner);

    manager.start({ deploymentId: id1, commands: [install] });
    manager.start({ deploymentId: id1, commands: [install] });
    runner.release();
    await waitForFinish(manager, id1);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('allows restarting a finished build', async () => {
    const manager = createManager(fakeRunner([{ exitCode: 1 }, { exitCode: 0 }]));

    manager.start({ deploymentId: id1, commands: [install] });
    expect((await waitForFinish(manager, id1)).status).toBe('failed');

    manager.start({ deploymentId: id1, commands: [install] });
    expect((await waitForFinish(manager, id1)).status).toBe('succeeded');
  });

  it('rejects builds above the concurrency limit', () => {
    const runner = fakeRunner([]);
    runner.block();
    const manager = createManager(runner, { maxConcurrentBuilds: 2 });

    manager.start({ deploymentId: id1, commands: [install] });
    manager.start({ deploymentId: id2, commands: [install] });

    expect(() => manager.start({ deploymentId: id3, commands: [install] })).toThrow(
      BuildBusyError,
    );
    runner.release();
  });

  it('returns only the new output after the offset', async () => {
    const manager = createManager(fakeRunner([{ output: 'line 1\nline 2\n' }]));

    manager.start({ deploymentId: id1, commands: [install] });
    const full = await waitForFinish(manager, id1);
    const header = '$ npm ci --ignore-scripts\n';

    expect(manager.get(id1, header.length)?.output).toBe('line 1\nline 2\n');
    expect(manager.get(id1, full.nextOffset)?.output).toBe('');
    expect(full.nextOffset).toBe(full.output.length);
  });

  it('strips ANSI codes and carriage returns from the output', async () => {
    const manager = createManager(
      fakeRunner([{ output: '\x1b[32mok\x1b[0m\r\nprogress 50%\rprogress 100%\n' }]),
    );

    manager.start({ deploymentId: id1, commands: [install] });
    const result = await waitForFinish(manager, id1);

    expect(result.output).toContain('ok\nprogress 50%\nprogress 100%\n');
    expect(result.output).not.toContain('\x1b');
  });

  it('truncates the output above the limit', async () => {
    const manager = createManager(fakeRunner([{ output: 'x'.repeat(5_000) }]), {
      maxOutputChars: 100,
    });

    manager.start({ deploymentId: id1, commands: [install] });
    const result = await waitForFinish(manager, id1);

    expect(result.truncated).toBe(true);
    expect(result.output.endsWith('[output truncated]\n')).toBe(true);
    expect(result.output.length).toBeLessThan(150);
  });

  it('returns null for unknown builds', () => {
    expect(createManager(fakeRunner([])).get(id1)).toBeNull();
  });
});
