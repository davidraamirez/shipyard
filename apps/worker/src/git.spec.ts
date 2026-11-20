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
    // config.ts lee WORKSPACES_DIR al importarse.
    vi.resetModules();
    ({ removeWorkspace } = await import('./git.js'));
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await rm(workspacesDir, { recursive: true, force: true });
  });

  it('elimina un workspace dentro del directorio permitido', async () => {
    const workspace = path.join(workspacesDir, 'deployment-1');
    await mkdir(workspace);
    await writeFile(path.join(workspace, 'package.json'), '{}');

    await removeWorkspace(workspace);

    await expect(stat(workspace)).rejects.toThrow();
  });

  it.each([
    ['la propia carpeta base', () => workspacesDir],
    ['una carpeta hermana', () => path.join(workspacesDir, '..', 'otra')],
    ['un traversal', () => path.join(workspacesDir, 'a', '..', '..')],
  ])('rechaza %s', async (_name, getPath) => {
    await expect(removeWorkspace(getPath())).rejects.toThrow(
      'La ruta del workspace no está permitida',
    );
  });

  it('no borra la carpeta base al rechazarla', async () => {
    await removeWorkspace(workspacesDir).catch(() => undefined);

    await expect(stat(workspacesDir)).resolves.toBeTruthy();
  });
});
