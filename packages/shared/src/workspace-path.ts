import path from 'node:path';

export const DEFAULT_WORKSPACES_DIR = '/app/workspaces';

const DEPLOYMENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDeploymentId(value: unknown): value is string {
  return typeof value === 'string' && DEPLOYMENT_ID_PATTERN.test(value);
}

// Construye la ruta del workspace de un deployment. Solo acepta UUIDs, así
// que el identificador no puede contener separadores ni "..".
export function getWorkspacePath(
  deploymentId: string,
  workspacesDir = DEFAULT_WORKSPACES_DIR,
): string {
  if (!isDeploymentId(deploymentId)) {
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

// Valida una ruta ya construida (POSIX, tal como se ve dentro del contenedor)
// antes de montarla en un contenedor de build.
export function validateWorkspacePath(
  workspace: string,
  workspacesDir = DEFAULT_WORKSPACES_DIR,
): string {
  if (!path.posix.isAbsolute(workspace)) {
    throw new Error('La ruta del workspace debe ser absoluta');
  }

  const resolvedWorkspace = path.posix.resolve(workspace);
  const relativePath = path.posix.relative(workspacesDir, resolvedWorkspace);

  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith('../') ||
    path.posix.isAbsolute(relativePath)
  ) {
    throw new Error('La ruta del workspace no está permitida');
  }

  return resolvedWorkspace;
}
