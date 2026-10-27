import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProject } from './build.js';
import type { ProjectInfo } from './project-detector.js';

const DEPLOYMENT_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('buildProject', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'shipyard-build-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('rechaza proyectos desconocidos', async () => {
    const projectInfo: ProjectInfo = {
      type: 'UNKNOWN',
      packageManager: null,
      buildScript: null,
    };

    await expect(
      buildProject(DEPLOYMENT_ID, workspace, projectInfo),
    ).rejects.toThrow(
      'No existe una estrategia de build para UNKNOWN',
    );
  });

  it('rechaza proyectos Node sin package.json', async () => {
    const projectInfo: ProjectInfo = {
      type: 'NODE',
      packageManager: 'pnpm',
      buildScript: 'tsc',
    };

    await expect(
      buildProject(DEPLOYMENT_ID, workspace, projectInfo),
    ).rejects.toThrow(
      'No se encuentra package.json en el proyecto',
    );
  });

  it('rechaza proyectos sin lockfile', async () => {
    await writeFile(
      join(workspace, 'package.json'),
      JSON.stringify({ name: 'test-project' }),
    );

    const projectInfo: ProjectInfo = {
      type: 'NODE',
      packageManager: 'pnpm',
      buildScript: 'tsc',
    };

    await expect(
      buildProject(DEPLOYMENT_ID, workspace, projectInfo),
    ).rejects.toThrow(
      'No se encuentra pnpm-lock.yaml',
    );
  });
});