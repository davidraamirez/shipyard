
import { describe, expect, it } from 'vitest';
import { validateWorkspacePath } from './workspace-path.js';

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