import { mkdir, mkdtemp, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { requireWorkspace } from './workspace.js';

const DEPLOYMENT_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('requireWorkspace', () => {
  let temporaryDirectory: string | undefined;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      temporaryDirectory = undefined;
    }
  });

  async function createWorkspacesDirectory() {
    temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), 'shipyard-workspace-'),
    );

    const workspacesDirectory = path.join(temporaryDirectory, 'workspaces');
    await mkdir(workspacesDirectory, { recursive: true });

    return workspacesDirectory;
  }

  it('rejects an invalid deploymentId', async () => {
    await expect(
      requireWorkspace('../outside', temporaryDirectory),
    ).rejects.toThrow('Invalid deploymentId');
  });

  it('rejects a missing workspace', async () => {
    const workspacesDirectory = await createWorkspacesDirectory();

    await expect(
      requireWorkspace(DEPLOYMENT_ID, workspacesDirectory),
    ).rejects.toThrow('Deployment workspace not found');
  });

  it('accepts a workspace that is a directory', async () => {
    const workspacesDirectory = await createWorkspacesDirectory();
    const workspace = path.join(workspacesDirectory, DEPLOYMENT_ID);

    await mkdir(workspace);

    await expect(
      requireWorkspace(DEPLOYMENT_ID, workspacesDirectory),
    ).resolves.toBe(workspace);
  });

  it('rejects a workspace that is a file', async () => {
    const workspacesDirectory = await createWorkspacesDirectory();
    const workspace = path.join(workspacesDirectory, DEPLOYMENT_ID);

    await writeFile(workspace, 'test');

    await expect(
      requireWorkspace(DEPLOYMENT_ID, workspacesDirectory),
    ).rejects.toThrow('The workspace is not a valid directory');
  });

  it('rejects a workspace that is a symlink', async () => {
    const workspacesDirectory = await createWorkspacesDirectory();
    const target = path.join(temporaryDirectory!, 'target');

    await mkdir(target);

    try {
      await symlink(target, path.join(workspacesDirectory, DEPLOYMENT_ID), 'dir');
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'EPERM' || error.code === 'EACCES')
      ) {
        return;
      }

      throw error;
    }

    await expect(
      requireWorkspace(DEPLOYMENT_ID, workspacesDirectory),
    ).rejects.toThrow('The workspace is not a valid directory');
  });
});
