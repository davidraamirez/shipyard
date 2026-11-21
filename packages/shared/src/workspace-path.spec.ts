import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getWorkspacePath,
  isDeploymentId,
  validateWorkspacePath,
} from './workspace-path.js';

describe('getWorkspacePath', () => {
  it('builds the path from a valid UUID', () => {
    expect(
      getWorkspacePath('123e4567-e89b-12d3-a456-426614174000'),
    ).toBe(
      path.resolve(
        '/app/workspaces',
        '123e4567-e89b-12d3-a456-426614174000',
      ),
    );
  });

  it('rejects identifiers with traversal', () => {
    expect(() => getWorkspacePath('../other-directory')).toThrow(
      'Invalid deploymentId',
    );
  });

  it('rejects incomplete UUIDs', () => {
    expect(() => getWorkspacePath('1234')).toThrow(
      'Invalid deploymentId',
    );
  });

  it('rejects UUIDs with invalid characters', () => {
    expect(() =>
      getWorkspacePath('123e4567-e89b-12d3-a456-42661417400z'),
    ).toThrow('Invalid deploymentId');
  });
});

describe('isDeploymentId', () => {
  it('accepts UUIDs and rejects anything else', () => {
    expect(isDeploymentId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isDeploymentId('deployment-1')).toBe(false);
    expect(isDeploymentId(42)).toBe(false);
  });
});

describe('validateWorkspacePath', () => {
  it('accepts a workspace inside the allowed path', () => {
    expect(
      validateWorkspacePath('/app/workspaces/deployment-123'),
    ).toBe('/app/workspaces/deployment-123');
  });

  it('rejects relative paths', () => {
    expect(() => validateWorkspacePath('deployment-123')).toThrow(
      'Workspace path must be absolute',
    );
  });

  it('rejects the base folder itself', () => {
    expect(() => validateWorkspacePath('/app/workspaces')).toThrow(
      'Workspace path not allowed',
    );
  });

  it('rejects paths outside the allowed folder', () => {
    expect(() => validateWorkspacePath('/etc')).toThrow(
      'Workspace path not allowed',
    );
  });

  it('rejects escape attempts via ..', () => {
    expect(() =>
      validateWorkspacePath('/app/workspaces/../../etc'),
    ).toThrow('Workspace path not allowed');
  });
});
