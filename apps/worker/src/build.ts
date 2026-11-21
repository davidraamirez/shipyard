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
      `No existe una estrategia de build para ${projectInfo.type}`,
    );
  }

  const packageJson = await stat(join(workspace, 'package.json'))
    .catch(() => null);

  if (!packageJson?.isFile()) {
    throw new PermanentDeploymentError('No se encuentra package.json en el proyecto');
  }

  const lockFiles = {
    pnpm: 'pnpm-lock.yaml',
    npm: 'package-lock.json',
    yarn: 'yarn.lock',
  } as const;

  const manager = projectInfo.packageManager;

  if (!manager) {
    throw new PermanentDeploymentError(
      'No se ha detectado un gestor de paquetes compatible',
    );
  }

  const lockFile = lockFiles[manager];
  const hasLockFile = await stat(join(workspace, lockFile))
    .then((file) => file.isFile())
    .catch(() => false);

  if (!hasLockFile) {
    throw new PermanentDeploymentError(
      `No se encuentra ${lockFile}. No se instalarán dependencias sin un lockfile.`,
    );
  }

  const commands = getBuildCommands(projectInfo);

  await runRemoteBuild({ deploymentId, commands }, onOutput);
}
