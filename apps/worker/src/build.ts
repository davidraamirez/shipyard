import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { runRemoteBuild } from './build-runner-client.js';
import type { ProjectInfo } from './project-detector.js';
import { getBuildCommands } from './build-strategy.js';
import { PermanentDeploymentError } from './errors.js';

export async function buildProject(
  deploymentId: string,
  workspace: string,
  projectInfo: ProjectInfo,
  onOutput: (text: string) => Promise<void> | void = () => {},
): Promise<void> {
  if (projectInfo.type !== 'NODE') {
    throw new PermanentDeploymentError(
      `No build strategy for ${projectInfo.type}`,
    );
  }

  const packageJson = await stat(join(workspace, 'package.json'))
    .catch(() => null);

  if (!packageJson?.isFile()) {
    throw new PermanentDeploymentError('package.json not found in the project');
  }

  const lockFiles = {
    pnpm: 'pnpm-lock.yaml',
    npm: 'package-lock.json',
    yarn: 'yarn.lock',
  } as const;

  const manager = projectInfo.packageManager;

  if (!manager) {
    throw new PermanentDeploymentError(
      'No supported package manager detected',
    );
  }

  const lockFile = lockFiles[manager];
  const hasLockFile = await stat(join(workspace, lockFile))
    .then((file) => file.isFile())
    .catch(() => false);

  if (!hasLockFile) {
    throw new PermanentDeploymentError(
      `${lockFile} not found. Dependencies are not installed without a lockfile.`,
    );
  }

  const commands = getBuildCommands(projectInfo);

  await runRemoteBuild({ deploymentId, commands }, onOutput);
}
