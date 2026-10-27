
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

import { runBuildContainer } from './build-container.js';

describe('runBuildContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: ReturnType<typeof vi.fn>;
      };

      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();

      return child;
    });
  });

  it('ejecuta los comandos dentro de Docker con límites y red aislada', async () => {
    const promise = runBuildContainer({
      workspace: '/app/workspaces/deployment-123',
      commands: [
        {
          command: 'pnpm',
          args: ['install', '--frozen-lockfile', '--ignore-scripts'],
        },
        {
          command: 'pnpm',
          args: ['run', 'build', '--ignore-scripts'],
        },
      ],
    });

    const child = spawnMock.mock.results[0].value;

    child.stdout.emit('data', Buffer.from('Build completado\n'));
    child.emit('close', 0);

    await expect(promise).resolves.toEqual({
      success: true,
      output: 'Build completado\n',
    });

    const [, args, options] = spawnMock.mock.calls[0];

    expect(args).toEqual(
      expect.arrayContaining([
        'run',
        '--rm',
        '--network',
        'none',
        '--memory',
        '512m',
        '--cpus',
        '1',
        '--pids-limit',
        '128',
        '--mount',
        'type=bind,source=/app/workspaces/deployment-123,target=/workspace',        '--workdir',
        '/workspace',
        'shipyard-build-node:22',
        'sh',
        '-lc',
        " 'pnpm' 'install' '--frozen-lockfile' '--ignore-scripts' && 'pnpm' 'run' 'build' '--ignore-scripts'".trim(),
      ]),
    );

    expect(options).toEqual(
      expect.objectContaining({
        shell: false,
        windowsHide: true,
      }),
    );
  });

  it('rechaza si el contenedor termina con error', async () => {
    const promise = runBuildContainer({
      workspace: '/app/workspaces/deployment-123',
      commands: [{ command: 'pnpm', args: ['run', 'build'] }],
    });

    const child = spawnMock.mock.results[0].value;

    child.stderr.emit('data', Buffer.from('Error de build'));
    child.emit('close', 1);

    await expect(promise).rejects.toThrow(
      'El contenedor de build terminó con código 1',
    );
  });
});
