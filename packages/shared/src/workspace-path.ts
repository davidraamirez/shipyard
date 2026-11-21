import path from 'node:path';

export const DEFAULT_WORKSPACES_DIR = '/app/workspaces';

const DEPLOYMENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDeploymentId(value: unknown): value is string {
  return typeof value === 'string' && DEPLOYMENT_ID_PATTERN.test(value);
}

// Builds the workspace path of a deployment. It only accepts UUIDs, so
// the id cannot contain separators or "..".
export function getWorkspacePath(
  deploymentId: string,
  workspacesDir = DEFAULT_WORKSPACES_DIR,
): string {
  if (!isDeploymentId(deploymentId)) {
    throw new Error('Invalid deploymentId');
  }

  const workspace = path.resolve(workspacesDir, deploymentId);
  const relativePath = path.relative(workspacesDir, workspace);

  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error('Workspace path not allowed');
  }

  return workspace;
}

// Validates an already built path (POSIX, as seen inside the container)
// before mounting it into a build container.
export function validateWorkspacePath(
  workspace: string,
  workspacesDir = DEFAULT_WORKSPACES_DIR,
): string {
  if (!path.posix.isAbsolute(workspace)) {
    throw new Error('Workspace path must be absolute');
  }

  const resolvedWorkspace = path.posix.resolve(workspace);
  const relativePath = path.posix.relative(workspacesDir, resolvedWorkspace);

  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith('../') ||
    path.posix.isAbsolute(relativePath)
  ) {
    throw new Error('Workspace path not allowed');
  }

  return resolvedWorkspace;
}
