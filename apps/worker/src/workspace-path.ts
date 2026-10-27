import path from 'node:path';

const WORKSPACES_DIR = '/app/workspaces';

export function validateWorkspacePath(workspace: string): string {
  if (!path.posix.isAbsolute(workspace)) {
    throw new Error('La ruta del workspace debe ser absoluta');
  }

  const resolvedWorkspace = path.posix.resolve(workspace);
  const relativePath = path.posix.relative(
    WORKSPACES_DIR,
    resolvedWorkspace,
  );

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