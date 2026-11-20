import { lstat } from 'node:fs/promises';
import { getWorkspacePath } from '@shipyard/shared';

export async function requireWorkspace(
  deploymentId: string,
  workspacesDir?: string,
): Promise<string> {
  const workspace = getWorkspacePath(deploymentId, workspacesDir);

  let workspaceStat;

  try {
    workspaceStat = await lstat(workspace);
  } catch {
    throw new Error('No se encuentra el workspace del deployment');
  }

  if (!workspaceStat.isDirectory() || workspaceStat.isSymbolicLink()) {
    throw new Error('El workspace no es un directorio válido');
  }

  return workspace;
}
