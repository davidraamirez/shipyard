import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

describe('removeWorkspace', () => {
  let workspacesDir: string;
  let removeWorkspace: (workspace: string) => Promise<void>;

  beforeAll(async () => {
    workspacesDir = await mkdtemp(path.join(tmpdir(), 'shipyard-ws-'));
    vi.stubEnv('WORKSPACES_DIR', workspacesDir);
    // config.ts reads WORKSPACES_DIR when imported.
    vi.resetModules();
    ({ removeWorkspace } = await import('./git.js'));
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await rm(workspacesDir, { recursive: true, force: true });
  });

  it('removes a workspace inside the allowed directory', async () => {
    const workspace = path.join(workspacesDir, 'deployment-1');
    await mkdir(workspace);
    await writeFile(path.join(workspace, 'package.json'), '{}');

    await removeWorkspace(workspace);

    await expect(stat(workspace)).rejects.toThrow();
  });

  it.each([
    ['the base folder itself', () => workspacesDir],
    ['a sibling folder', () => path.join(workspacesDir, '..', 'other')],
    ['a traversal', () => path.join(workspacesDir, 'a', '..', '..')],
  ])('rejects %s', async (_name, getPath) => {
    await expect(removeWorkspace(getPath())).rejects.toThrow(
      'Workspace path not allowed',
    );
  });

  it('does not delete the base folder when rejecting it', async () => {
    await removeWorkspace(workspacesDir).catch(() => undefined);

    await expect(stat(workspacesDir)).resolves.toBeTruthy();
  });
});
