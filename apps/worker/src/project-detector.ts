import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import type { PackageManager } from '@shipyard/shared';

export type ProjectType = 'NODE' | 'UNKNOWN';

export type ProjectInfo = {
  type: ProjectType;
  packageManager: PackageManager | null;
  buildScript: string | null;
};

type PackageJson = {
  packageManager?: unknown;
  scripts?: unknown;
};

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function detectProject(
  workspace: string,
): Promise<ProjectInfo> {
  const packageJsonPath = join(workspace, 'package.json');

  if (!(await fileExists(packageJsonPath))) {
    return {
      type: 'UNKNOWN',
      packageManager: null,
      buildScript: null,
    };
  }

  let packageJson: PackageJson;

  try {
    packageJson = JSON.parse(
      await readFile(packageJsonPath, 'utf8'),
    ) as PackageJson;
  } catch {
    throw new Error('The repository package.json is invalid');
  }

  const scripts =
    packageJson.scripts &&
    typeof packageJson.scripts === 'object' &&
    !Array.isArray(packageJson.scripts)
      ? (packageJson.scripts as Record<string, unknown>)
      : {};

  const declaredManager =
    typeof packageJson.packageManager === 'string'
      ? packageJson.packageManager.split('@')[0]
      : null;

  let packageManager: ProjectInfo['packageManager'];

  if (
    declaredManager === 'pnpm' ||
    declaredManager === 'npm' ||
    declaredManager === 'yarn'
  ) {
    packageManager = declaredManager;
  } else if (await fileExists(join(workspace, 'pnpm-lock.yaml'))) {
    packageManager = 'pnpm';
  } else if (await fileExists(join(workspace, 'yarn.lock'))) {
    packageManager = 'yarn';
  } else {
    packageManager = 'npm';
  }

  return {
    type: 'NODE',
    packageManager,
    buildScript:
      typeof scripts.build === 'string' ? scripts.build : null,
  };
}
