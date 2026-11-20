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
  ])('acepta %s', (url) => {
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
    'no-es-una-url',
  ])('rechaza %s', (url) => {
    expect(isValidRepositoryUrl(url)).toBe(false);
  });

  it('rechaza valores que no son texto', () => {
    expect(isValidRepositoryUrl(undefined)).toBe(false);
    expect(isValidRepositoryUrl(42)).toBe(false);
  });
});

describe('validateRepositoryUrl', () => {
  it('devuelve la URL parseada', () => {
    expect(
      validateRepositoryUrl('https://github.com/owner/repo.git').hostname,
    ).toBe('github.com');
  });

  it.each([
    ['no-es-una-url', 'La URL del repositorio no es válida'],
    ['http://github.com/owner/repo.git', 'Solo se permiten repositorios HTTPS'],
    ['https://u:p@github.com/owner/repo.git', 'La URL no puede contener credenciales'],
    ['https://evil.com/owner/repo.git', 'El proveedor Git no está permitido'],
    ['https://github.com:8443/owner/repo.git', 'El puerto del repositorio no está permitido'],
    ['https://github.com/owner/repo.git?x=1', 'La URL no puede contener parámetros ni fragmentos'],
    ['https://github.com/owner/repo', 'La ruta del repositorio no tiene un formato válido'],
  ])('rechaza %s con un mensaje claro', (url, message) => {
    expect(() => validateRepositoryUrl(url)).toThrow(message);
  });
});
