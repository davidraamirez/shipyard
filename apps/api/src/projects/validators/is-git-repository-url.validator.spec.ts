
import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { IsGitRepositoryUrl } from './is-git-repository-url.validator.js';

class TestDto {
  @IsGitRepositoryUrl()
  repositoryUrl!: string;
}

async function isValid(repositoryUrl: string): Promise<boolean> {
  const dto = new TestDto();
  dto.repositoryUrl = repositoryUrl;

  const errors = await validate(dto);
  return errors.length === 0;
}

describe('IsGitRepositoryUrl', () => {
  it.each([
    'https://github.com/owner/repo.git',
    'https://gitlab.com/owner/repo.git',
    'https://bitbucket.org/owner/repo.git',
    'https://github.com/owner/repo.git/',
  ])('acepta %s', async (url) => {
    await expect(isValid(url)).resolves.toBe(true);
  });

  it.each([
    'http://github.com/owner/repo.git',
    'https://evil.com/owner/repo.git',
    'https://github.com/owner/repo',
    'https://user:password@github.com/owner/repo.git',
    'https://github.com:8443/owner/repo.git',
    'https://github.com/owner/repo.git?token=abc',
    'https://github.com/owner/repo.git#main',
    'no-es-una-url',
  ])('rechaza %s', async (url) => {
    await expect(isValid(url)).resolves.toBe(false);
  });
});
