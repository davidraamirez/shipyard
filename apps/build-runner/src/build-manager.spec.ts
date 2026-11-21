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

// Runner falso: cada llamada consume el siguiente paso programado.
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
  it('ejecuta los pasos en orden y termina en succeeded', async () => {
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

  it('se detiene en el primer paso que falla e indica cuál fue', async () => {
    const runner = fakeRunner([{ exitCode: 0 }, { exitCode: 2, output: 'error TS1005\n' }]);
    const spy = vi.spyOn(runner, 'run');
    const manager = createManager(runner);

    manager.start({ deploymentId: id1, commands: [install, build] });
    const result = await waitForFinish(manager, id1);

    expect(result.status).toBe('failed');
    expect(result.failedStep).toBe('build');
    expect(result.error).toBe('"npm run build --ignore-scripts" terminó con código 2');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('atribuye un timeout al paso que lo superó', async () => {
    const manager = createManager(
      fakeRunner([{ error: new StepTimeoutError('superó el tiempo límite') }]),
    );

    manager.start({ deploymentId: id1, commands: [install] });
    const result = await waitForFinish(manager, id1);

    expect(result.failedStep).toBe('install');
  });

  it('marca los errores de Docker como fallo de infraestructura', async () => {
    const manager = createManager(
      fakeRunner([{ error: new Error('No se pudo conectar con Docker') }]),
    );

    manager.start({ deploymentId: id1, commands: [install] });
    const result = await waitForFinish(manager, id1);

    expect(result.status).toBe('failed');
    expect(result.failedStep).toBeNull();
    expect(result.error).toBe('No se pudo conectar con Docker');
  });

  it('no lanza un segundo build si se repite el POST mientras se ejecuta', async () => {
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

  it('permite volver a lanzar un build que ya terminó', async () => {
    const manager = createManager(fakeRunner([{ exitCode: 1 }, { exitCode: 0 }]));

    manager.start({ deploymentId: id1, commands: [install] });
    expect((await waitForFinish(manager, id1)).status).toBe('failed');

    manager.start({ deploymentId: id1, commands: [install] });
    expect((await waitForFinish(manager, id1)).status).toBe('succeeded');
  });

  it('rechaza builds por encima del máximo simultáneo', () => {
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

  it('devuelve solo la salida nueva a partir del offset', async () => {
    const manager = createManager(fakeRunner([{ output: 'linea 1\nlinea 2\n' }]));

    manager.start({ deploymentId: id1, commands: [install] });
    const full = await waitForFinish(manager, id1);
    const header = '$ npm ci --ignore-scripts\n';

    expect(manager.get(id1, header.length)?.output).toBe('linea 1\nlinea 2\n');
    expect(manager.get(id1, full.nextOffset)?.output).toBe('');
    expect(full.nextOffset).toBe(full.output.length);
  });

  it('limpia códigos ANSI y retornos de carro de la salida', async () => {
    const manager = createManager(
      fakeRunner([{ output: '\x1b[32mok\x1b[0m\r\nprogreso 50%\rprogreso 100%\n' }]),
    );

    manager.start({ deploymentId: id1, commands: [install] });
    const result = await waitForFinish(manager, id1);

    expect(result.output).toContain('ok\nprogreso 50%\nprogreso 100%\n');
    expect(result.output).not.toContain('\x1b');
  });

  it('trunca la salida al superar el máximo', async () => {
    const manager = createManager(fakeRunner([{ output: 'x'.repeat(5_000) }]), {
      maxOutputChars: 100,
    });

    manager.start({ deploymentId: id1, commands: [install] });
    const result = await waitForFinish(manager, id1);

    expect(result.truncated).toBe(true);
    expect(result.output.endsWith('[salida truncada]\n')).toBe(true);
    expect(result.output.length).toBeLessThan(150);
  });

  it('devuelve null para builds desconocidos', () => {
    expect(createManager(fakeRunner([])).get(id1)).toBeNull();
  });
});
