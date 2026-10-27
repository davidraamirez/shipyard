import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { requestBuild } from './build-runner-client.js';
import type { ProjectInfo } from './project-detector.js';
import { getBuildCommands } from './build-strategy.js';

const MAX_OUTPUT_LENGTH = 20_000;

type BuildResult = {
  success: true;
  output: string;
};

export async function buildProject(
  deploymentId: string,
  workspace: string,
  projectInfo: ProjectInfo,
): Promise<BuildResult> {
  if (projectInfo.type !== 'NODE') {
    throw new Error(
      `No existe una estrategia de build para ${projectInfo.type}`,
    );
  }

  const packageJson = await stat(join(workspace, 'package.json'))
    .catch(() => null);

  if (!packageJson?.isFile()) {
    throw new Error('No se encuentra package.json en el proyecto');
  }

  const lockFiles = {
    pnpm: 'pnpm-lock.yaml',
    npm: 'package-lock.json',
    yarn: 'yarn.lock',
  } as const;

  const manager = projectInfo.packageManager;

  if (!manager) {
    throw new Error(
      'No se ha detectado un gestor de paquetes compatible',
    );
  }

  const lockFile = lockFiles[manager];
  const hasLockFile = await stat(join(workspace, lockFile))
    .then((file) => file.isFile())
    .catch(() => false);

  if (!hasLockFile) {
    throw new Error(
      `No se encuentra ${lockFile}. No se instalarán dependencias sin un lockfile.`,
    );
  }

  const commands = getBuildCommands(projectInfo);

  const result = await requestBuild({
    deploymentId,
    commands,
  });

  return {
    success: true,
    output: result.output.slice(-MAX_OUTPUT_LENGTH),
  };
}
