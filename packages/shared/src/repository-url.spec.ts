import { describe, expect, it } from 'vitest';
import {
  isValidRepositoryUrl,
  validateRepositoryUrl,
} from './repository-url.js';

describe('isValidRepositoryUrl', () => {
  it.each([
    'https://github.com/owner/repo.git',
    'https://gitlab.com/owner/repo.git',
    'https://bitbucket.org/owner/repo.git',
    'https://github.com/owner/repo.git/',
    'https://GitHub.com/owner/repo.git',
  ])('accepts %s', (url) => {
    expect(isValidRepositoryUrl(url)).toBe(true);
  });

  it.each([
    'http://github.com/owner/repo.git',
    'https://evil.com/owner/repo.git',
    'https://github.com.evil.com/owner/repo.git',
    'https://github.com/owner/repo',
    'https://github.com/owner/group/repo.git',
    'https://user:password@github.com/owner/repo.git',
    'https://github.com:8443/owner/repo.git',
    'https://github.com/owner/repo.git?token=abc',
    'https://github.com/owner/repo.git#main',
    'not-a-url',
  ])('rejects %s', (url) => {
    expect(isValidRepositoryUrl(url)).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidRepositoryUrl(undefined)).toBe(false);
    expect(isValidRepositoryUrl(42)).toBe(false);
  });
});

describe('validateRepositoryUrl', () => {
  it('returns the parsed URL', () => {
    expect(
      validateRepositoryUrl('https://github.com/owner/repo.git').hostname,
    ).toBe('github.com');
  });

  it.each([
    ['not-a-url', 'Invalid repository URL'],
    ['http://github.com/owner/repo.git', 'Only HTTPS repositories are allowed'],
    ['https://u:p@github.com/owner/repo.git', 'The URL must not contain credentials'],
    ['https://evil.com/owner/repo.git', 'Git provider not allowed'],
    ['https://github.com:8443/owner/repo.git', 'Repository port not allowed'],
    ['https://github.com/owner/repo.git?x=1', 'The URL must not contain query parameters or fragments'],
    ['https://github.com/owner/repo', 'Invalid repository path format'],
  ])('rejects %s with a clear message', (url, message) => {
    expect(() => validateRepositoryUrl(url)).toThrow(message);
  });
});
