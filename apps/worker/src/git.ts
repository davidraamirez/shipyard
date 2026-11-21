import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  getWorkspacePath,
  validateRepositoryUrl,
} from '@shipyard/shared';
import { WORKSPACES_DIR } from './config.js';
import { PermanentDeploymentError } from './errors.js';

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 120_000;

// Git with no global or system config and no credential prompts.
const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
};

function resolveWorkspace(repositoryUrl: string, deploymentId: string) {
  try {
    validateRepositoryUrl(repositoryUrl);
    return getWorkspacePath(deploymentId, WORKSPACES_DIR);
  } catch (error) {
    throw new PermanentDeploymentError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function cloneRepository(
  repositoryUrl: string,
  deploymentId: string,
): Promise<string> {
  const workspace = resolveWorkspace(repositoryUrl, deploymentId);

  await mkdir(WORKSPACES_DIR, { recursive: true });
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
        env: GIT_ENV,
      },
    );

    return workspace;
  } catch (error) {
    await rm(workspace, { recursive: true, force: true });

    const message =
      error instanceof Error ? error.message : String(error);

    throw new Error(`Could not clone the repository: ${message}`);
  }
}

export async function getHeadCommit(workspace: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', workspace, 'rev-parse', 'HEAD'],
    { timeout: 10_000, env: GIT_ENV },
  );

  const commitSha = stdout.trim();

  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new Error('Could not read the repository commit');
  }

  return commitSha;
}

// Only deletes directories inside WORKSPACES_DIR.
export async function removeWorkspace(workspace: string): Promise<void> {
  const relativePath = path.relative(WORKSPACES_DIR, workspace);

  if (
    !relativePath ||
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error('Workspace path not allowed');
  }

  await rm(workspace, { recursive: true, force: true });
}
