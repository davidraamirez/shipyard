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
    throw new Error('Deployment workspace not found');
  }

  if (!workspaceStat.isDirectory() || workspaceStat.isSymbolicLink()) {
    throw new Error('The workspace is not a valid directory');
  }

  return workspace;
}
