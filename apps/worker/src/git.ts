import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, rm } from 'node:fs/promises';
import {
  DEFAULT_WORKSPACES_DIR,
  getWorkspacePath,
  validateRepositoryUrl,
} from '@shipyard/shared';

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 120_000;

export async function cloneRepository(
  repositoryUrl: string,
  deploymentId: string,
): Promise<string> {
  validateRepositoryUrl(repositoryUrl);

  const workspace = getWorkspacePath(deploymentId);

  await mkdir(DEFAULT_WORKSPACES_DIR, { recursive: true });
  await rm(workspace, { recursive: true, force: true });
  await mkdir(workspace, { recursive: true });

  try {
    await execFileAsync(
      'git',
      [
        '-c', 'protocol.file.allow=never',
        '-c', 'protocol.ext.allow=never',
        'clone',
        '--depth', '1',
        '--no-recurse-submodules',
        '--',
        repositoryUrl,
        workspace,
      ],
      {
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
        },
      },
    );

    return workspace;
  } catch (error) {
    await rm(workspace, { recursive: true, force: true });

    const message =
      error instanceof Error ? error.message : String(error);

    throw new Error(`No se pudo clonar el repositorio: ${message}`);
  }
}
