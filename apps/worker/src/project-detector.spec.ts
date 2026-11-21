
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectProject } from './project-detector.js';

describe('detectProject', () => {
  let workspace: string;

  afterEach(async () => {
    if (workspace) {
      await rm(workspace, { recursive: true, force: true });
      workspace = '';
    }
  });

  async function createWorkspace() {
    workspace = await mkdtemp(join(tmpdir(), 'shipyard-test-'));
    return workspace;
  }

  it('detects a Node project with pnpm and a build script', async () => {
    const dir = await createWorkspace();

    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({
        packageManager: 'pnpm@10.0.0',
        scripts: { build: 'tsc' },
      }),
    );

    await expect(detectProject(dir)).resolves.toEqual({
      type: 'NODE',
      packageManager: 'pnpm',
      buildScript: 'tsc',
    });
  });

  it('defaults to npm', async () => {
    const dir = await createWorkspace();

    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ scripts: {} }),
    );

    await expect(detectProject(dir)).resolves.toEqual({
      type: 'NODE',
      packageManager: 'npm',
      buildScript: null,
    });
  });

  it('detecta pnpm mediante pnpm-lock.yaml', async () => {
    const dir = await createWorkspace();

    await writeFile(join(dir, 'package.json'), '{}');
    await writeFile(join(dir, 'pnpm-lock.yaml'), '');

    await expect(detectProject(dir)).resolves.toMatchObject({
      type: 'NODE',
      packageManager: 'pnpm',
    });
  });

  it('returns UNKNOWN without package.json', async () => {
    const dir = await createWorkspace();

    await expect(detectProject(dir)).resolves.toEqual({
      type: 'UNKNOWN',
      packageManager: null,
      buildScript: null,
    });
  });

  it('fails if package.json contains invalid JSON', async () => {
    const dir = await createWorkspace();

    await writeFile(join(dir, 'package.json'), '{ invalid JSON');

    await expect(detectProject(dir)).rejects.toThrow(
      'The repository package.json is invalid',
    );
  });
});