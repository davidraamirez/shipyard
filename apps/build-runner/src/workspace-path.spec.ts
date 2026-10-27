
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getWorkspacePath } from './workspace-path.js';

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
