import { spawn } from 'node:child_process';
import type { BuildCommand } from './build-strategy.js';
import { validateWorkspacePath } from './workspace-path.js';

const CONTAINER_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_OUTPUT_LENGTH = 20_000;

export type ContainerBuildOptions = {
  workspace: string;
  commands: BuildCommand[];
};

export type ContainerBuildResult = {
  success: true;
  output: string;
};

export async function runBuildContainer(
  options: ContainerBuildOptions,
): Promise<ContainerBuildResult> {
  const workspace = validateWorkspacePath(options.workspace);
  const script = options.commands
    .map(({ command, args }) => {
      const escapedArgs = [command, ...args]
        .map((arg) => `'${arg.replace(/'/g, "'\\''")}'`)
        .join(' ');

      return escapedArgs;
    })
    .join(' && ');

  const args = [
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
    `type=bind,source=${workspace},target=/workspace`,
    '--workdir',
    '/workspace',
    'shipyard-build-node:22',
    'sh',
    '-lc',
    script,
  ];

  return new Promise((resolve, reject) => {
    const output: string[] = [];
    let outputLength = 0;
    let settled = false;

    const child = spawn('docker', args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (error) {
        reject(error);
      } else {
        resolve({
          success: true,
          output: output.join(''),
        });
      }
    };

    const appendOutput = (chunk: Buffer) => {
      if (outputLength >= MAX_OUTPUT_LENGTH) return;

      const text = chunk
        .toString('utf8')
        .slice(0, MAX_OUTPUT_LENGTH - outputLength);

      output.push(text);
      outputLength += text.length;
    };

    child.stdout.on('data', appendOutput);
    child.stderr.on('data', appendOutput);

    child.on('error', (error) => {
      finish(new Error(`No se pudo ejecutar Docker: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        finish(
          new Error(
            `El contenedor de build terminó con código ${code ?? 'desconocido'}.\n${output.join('')}`,
          ),
        );
        return;
      }

      finish();
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      finish(new Error('Tiempo límite del contenedor de build superado'));
    }, CONTAINER_TIMEOUT_MS);
  });
}
