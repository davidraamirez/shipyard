import { describe, expect, it } from 'vitest';
import { validateBuildRequest } from './build-request.js';

describe('validateBuildRequest', () => {
  const validRequest = {
    deploymentId: '123e4567-e89b-12d3-a456-426614174000',
    commands: [
      {
        command: 'pnpm',
        args: ['install', '--frozen-lockfile', '--ignore-scripts'],
      },
      {
        command: 'pnpm',
        args: ['run', 'build', '--ignore-scripts'],
      },
    ],
  };

  it('acepta una solicitud de build válida', () => {
    expect(validateBuildRequest(validRequest)).toEqual(validRequest);
  });

  it('rechaza un deploymentId no válido', () => {
    expect(() =>
      validateBuildRequest({
        ...validRequest,
        deploymentId: '../otro-directorio',
      }),
    ).toThrow('deploymentId no válido');
  });

  it('rechaza comandos de shell arbitrarios', () => {
    expect(() =>
      validateBuildRequest({
        ...validRequest,
        commands: [
          {
            command: 'pnpm',
            args: ['install && rm -rf /'],
          },
        ],
      }),
    ).toThrow('Combinación de comando y argumentos no permitida');
  });

  it('rechaza gestores de paquetes desconocidos', () => {
    expect(() =>
      validateBuildRequest({
        ...validRequest,
        commands: [{ command: 'bash', args: ['-c', 'whoami'] }],
      }),
    ).toThrow('Gestor de paquetes no permitido');
  });

  it('rechaza una lista vacía de comandos', () => {
    expect(() =>
      validateBuildRequest({
        ...validRequest,
        commands: [],
      }),
    ).toThrow('La lista de comandos no es válida');
  });

  it('rechaza más de dos comandos', () => {
    expect(() =>
      validateBuildRequest({
        ...validRequest,
        commands: [
          ...validRequest.commands,
          validRequest.commands[0],
        ],
      }),
    ).toThrow('La lista de comandos no es válida');
  });
});
