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

  it('accepts a valid build request', () => {
    expect(validateBuildRequest(validRequest)).toEqual(validRequest);
  });

  it('rejects an invalid deploymentId', () => {
    expect(() =>
      validateBuildRequest({
        ...validRequest,
        deploymentId: '../other-directory',
      }),
    ).toThrow('Invalid deploymentId');
  });

  it('rejects arbitrary shell commands', () => {
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
    ).toThrow('Command and arguments combination not allowed');
  });

  it('rejects unknown package managers', () => {
    expect(() =>
      validateBuildRequest({
        ...validRequest,
        commands: [{ command: 'bash', args: ['-c', 'whoami'] }],
      }),
    ).toThrow('Package manager not allowed');
  });

  it('rejects an empty command list', () => {
    expect(() =>
      validateBuildRequest({
        ...validRequest,
        commands: [],
      }),
    ).toThrow('Invalid command list');
  });

  it('rejects more than two commands', () => {
    expect(() =>
      validateBuildRequest({
        ...validRequest,
        commands: [
          ...validRequest.commands,
          validRequest.commands[0],
        ],
      }),
    ).toThrow('Invalid command list');
  });
});
