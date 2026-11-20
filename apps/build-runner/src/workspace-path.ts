import path from 'node:path';

const DEFAULT_WORKSPACES_DIR = '/app/workspaces';

export function getWorkspacePath(
  deploymentId: string,
  workspacesDir = DEFAULT_WORKSPACES_DIR,
): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      deploymentId,
    )
  ) {
    throw new Error('deploymentId no válido');
  }

  const workspace = path.resolve(workspacesDir, deploymentId);
  const relativePath = path.relative(workspacesDir, workspace);

  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error('La ruta del workspace no está permitida');
  }

  return workspace;
}
