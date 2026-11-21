export const ALLOWED_GIT_HOSTS: ReadonlySet<string> = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
]);

const REPOSITORY_PATH_PATTERN = /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git\/?$/;

// Single source of truth for repository URLs: the API uses it to
// validate input and the worker again right before cloning.
export function validateRepositoryUrl(repositoryUrl: string): URL {
  let url: URL;

  try {
    url = new URL(repositoryUrl);
  } catch {
    throw new Error('Invalid repository URL');
  }

  if (url.protocol !== 'https:') {
    throw new Error('Only HTTPS repositories are allowed');
  }

  if (url.username || url.password) {
    throw new Error('The URL must not contain credentials');
  }

  if (!ALLOWED_GIT_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('Git provider not allowed');
  }

  if (url.port && url.port !== '443') {
    throw new Error('Repository port not allowed');
  }

  if (url.search || url.hash) {
    throw new Error('The URL must not contain query parameters or fragments');
  }

  if (!REPOSITORY_PATH_PATTERN.test(url.pathname)) {
    throw new Error('Invalid repository path format');
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
