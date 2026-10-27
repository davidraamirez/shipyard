
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);

const ALLOWED_HOSTS = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
]);

const WORKSPACES_DIR = '/app/workspaces';
const GIT_TIMEOUT_MS = 120_000;

export function validateRepositoryUrl(repositoryUrl: string): URL {
  let url: URL;

  try {
    url = new URL(repositoryUrl);
  } catch {
    throw new Error('La URL del repositorio no es válida');
  }

  if (url.protocol !== 'https:') {
    throw new Error('Solo se permiten repositorios HTTPS');
  }

  if (url.username || url.password) {
    throw new Error('La URL no puede contener credenciales');
  }

  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('El proveedor Git no está permitido');
  }

  if (url.port && url.port !== '443') {
    throw new Error('El puerto del repositorio no está permitido');
  }

  if (url.search || url.hash) {
    throw new Error('La URL no puede contener parámetros ni fragmentos');
  }

  if (!/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git\/?$/.test(url.pathname)) {
    throw new Error('La ruta del repositorio no tiene un formato válido');
  }

  return url;
}

export async function cloneRepository(
  repositoryUrl: string,
  deploymentId: string,
): Promise<string> {
  validateRepositoryUrl(repositoryUrl);

  if (!/^[a-f0-9-]{36}$/i.test(deploymentId)) {
    throw new Error('El identificador del deployment no es válido');
  }

  const workspace = resolve(WORKSPACES_DIR, deploymentId);

  await mkdir(WORKSPACES_DIR, { recursive: true });
  await rm(workspace, { recursive: true, force: true });
  await mkdir(workspace, { recursive: true });

  try {
    await execFileAsync(
      'git',
      [
        '-c', 'protocol.file.allow=never',
        '-c', 'protocol.ext.allow=never',
        'clone',
        '--depth', '1',
        '--no-recurse-submodules',
        '--',
        repositoryUrl,
        workspace,
      ],
      {
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
        },
      },
    );

    return workspace;
  } catch (error) {
    await rm(workspace, { recursive: true, force: true });

    const message =
      error instanceof Error ? error.message : String(error);

    throw new Error(`No se pudo clonar el repositorio: ${message}`);
  }
}
