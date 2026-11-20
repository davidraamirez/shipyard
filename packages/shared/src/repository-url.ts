export const ALLOWED_GIT_HOSTS: ReadonlySet<string> = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
]);

const REPOSITORY_PATH_PATTERN = /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git\/?$/;

// Única fuente de verdad para las URLs de repositorio: la API la usa al
// validar la entrada y el worker otra vez justo antes de clonar.
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

  if (!ALLOWED_GIT_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('El proveedor Git no está permitido');
  }

  if (url.port && url.port !== '443') {
    throw new Error('El puerto del repositorio no está permitido');
  }

  if (url.search || url.hash) {
    throw new Error('La URL no puede contener parámetros ni fragmentos');
  }

  if (!REPOSITORY_PATH_PATTERN.test(url.pathname)) {
    throw new Error('La ruta del repositorio no tiene un formato válido');
  }

  return url;
}

export function isValidRepositoryUrl(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    validateRepositoryUrl(value);
    return true;
  } catch {
    return false;
  }
}
