import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getWorkspacePath,
  isDeploymentId,
  validateWorkspacePath,
} from './workspace-path.js';

describe('getWorkspacePath', () => {
  it('construye la ruta a partir de un UUID válido', () => {
    expect(
      getWorkspacePath('123e4567-e89b-12d3-a456-426614174000'),
    ).toBe(
      path.resolve(
        '/app/workspaces',
        '123e4567-e89b-12d3-a456-426614174000',
      ),
    );
  });

  it('rechaza identificadores con traversal', () => {
    expect(() => getWorkspacePath('../otro-directorio')).toThrow(
      'deploymentId no válido',
    );
  });

  it('rechaza UUID incompletos', () => {
    expect(() => getWorkspacePath('1234')).toThrow(
      'deploymentId no válido',
    );
  });

  it('rechaza UUID con caracteres no permitidos', () => {
    expect(() =>
      getWorkspacePath('123e4567-e89b-12d3-a456-42661417400z'),
    ).toThrow('deploymentId no válido');
  });
});

describe('isDeploymentId', () => {
  it('acepta UUID y rechaza cualquier otro valor', () => {
    expect(isDeploymentId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isDeploymentId('deployment-1')).toBe(false);
    expect(isDeploymentId(42)).toBe(false);
  });
});

describe('validateWorkspacePath', () => {
  it('acepta un workspace dentro de la ruta permitida', () => {
    expect(
      validateWorkspacePath('/app/workspaces/deployment-123'),
    ).toBe('/app/workspaces/deployment-123');
  });

  it('rechaza rutas relativas', () => {
    expect(() => validateWorkspacePath('deployment-123')).toThrow(
      'La ruta del workspace debe ser absoluta',
    );
  });

  it('rechaza la propia carpeta base', () => {
    expect(() => validateWorkspacePath('/app/workspaces')).toThrow(
      'La ruta del workspace no está permitida',
    );
  });

  it('rechaza rutas fuera de la carpeta permitida', () => {
    expect(() => validateWorkspacePath('/etc')).toThrow(
      'La ruta del workspace no está permitida',
    );
  });

  it('rechaza intentos de escapar mediante ..', () => {
    expect(() =>
      validateWorkspacePath('/app/workspaces/../../etc'),
    ).toThrow('La ruta del workspace no está permitida');
  });
});
