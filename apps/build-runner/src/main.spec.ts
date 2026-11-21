import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { INSTALL_ARGS } from '@shipyard/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BuildManager } from './build-manager.js';
import { createBuildRunnerServer } from './main.js';
import type { StepRunner } from './step-runner.js';

const deploymentId = '123e4567-e89b-12d3-a456-426614174000';
const token = 'test-token';
const auth = { authorization: `Bearer ${token}` };

const validBody = {
  deploymentId,
  commands: [{ command: 'npm', args: [...INSTALL_ARGS.npm] }],
};

describe('Build runner HTTP', () => {
  let server: Server | undefined;
  let baseUrl: string;
  let workspacesDir: string;
  let runner: StepRunner;

  beforeAll(async () => {
    workspacesDir = await mkdtemp(path.join(tmpdir(), 'shipyard-runner-'));
    await mkdir(path.join(workspacesDir, deploymentId));
  });

  afterAll(async () => {
    await rm(workspacesDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
      });
    }
    server = undefined;
  });

  async function startServer(
    serverToken: string | undefined = token,
    maxConcurrentBuilds = 2,
  ) {
    runner = { run: vi.fn().mockResolvedValue(0) };
    const manager = new BuildManager(runner, {
      maxConcurrentBuilds,
      maxOutputChars: 10_000,
    });
    server = createBuildRunnerServer({ token: serverToken, manager, workspacesDir });

    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('No se pudo obtener el puerto del servidor');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  const postBuild = (body: unknown, headers: Record<string, string> = auth) =>
    fetch(`${baseUrl}/builds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  it('responde correctamente en /health sin autenticación', async () => {
    await startServer();

    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('rechaza solicitudes sin token', async () => {
    await startServer();

    expect((await postBuild(validBody, {})).status).toBe(401);
    expect((await fetch(`${baseUrl}/builds/${deploymentId}`)).status).toBe(401);
  });

  it('rechaza un token incorrecto de la misma longitud', async () => {
    await startServer();

    const response = await postBuild(validBody, { authorization: 'Bearer test-tokeX' });

    expect(response.status).toBe(401);
  });

  it('rechaza builds si no se ha configurado el token', async () => {
    // Equivale a BUILD_RUNNER_TOKEN vacío en el entorno.
    await startServer('');

    expect((await postBuild(validBody)).status).toBe(503);
  });

  it('acepta un build con 202 y permite consultar su estado', async () => {
    await startServer();

    const accepted = await postBuild(validBody);
    expect(accepted.status).toBe(202);
    await expect(accepted.json()).resolves.toMatchObject({
      deploymentId,
      status: 'running',
    });

    await vi.waitFor(async () => {
      const status = await fetch(`${baseUrl}/builds/${deploymentId}`, { headers: auth });
      expect(status.status).toBe(200);
      expect((await status.json()).status).toBe('succeeded');
    });

    expect(runner.run).toHaveBeenCalledWith(
      deploymentId,
      validBody.commands[0],
      expect.any(Function),
    );
  });

  it('valida la solicitud con la lista blanca de comandos', async () => {
    await startServer();

    const response = await postBuild({
      deploymentId,
      commands: [{ command: 'npm', args: ['exec', 'sh'] }],
    });

    expect(response.status).toBe(400);
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('responde 404 si no existe el workspace del deployment', async () => {
    await startServer();

    const response = await postBuild({
      ...validBody,
      deploymentId: '223e4567-e89b-12d3-a456-426614174000',
    });

    expect(response.status).toBe(404);
  });

  it('responde 429 si se alcanza el máximo de builds simultáneos', async () => {
    await startServer(token, 1);
    runner.run = vi.fn(() => new Promise<number>(() => {}));

    expect((await postBuild(validBody)).status).toBe(202);

    const otherId = '223e4567-e89b-12d3-a456-426614174000';
    await mkdir(path.join(workspacesDir, otherId), { recursive: true });

    expect((await postBuild({ ...validBody, deploymentId: otherId })).status).toBe(429);
  });

  it('responde 404 para builds desconocidos y 400 para ids no válidos', async () => {
    await startServer();

    const unknown = await fetch(`${baseUrl}/builds/${deploymentId}`, { headers: auth });
    const invalid = await fetch(`${baseUrl}/builds/no-es-un-uuid`, { headers: auth });
    const badOffset = await fetch(`${baseUrl}/builds/${deploymentId}?after=-1`, {
      headers: auth,
    });

    expect(unknown.status).toBe(404);
    expect(invalid.status).toBe(400);
    expect(badOffset.status).toBe(400);
  });

  it('responde 413 si el cuerpo es demasiado grande', async () => {
    await startServer();

    const response = await postBuild({ ...validBody, padding: 'x'.repeat(20_000) }).catch(
      () => null,
    );

    // El servidor corta la conexión al superar el límite; según el momento
    // el cliente ve el 413 o un error de red.
    if (response) {
      expect(response.status).toBe(413);
    }
  });

  it('responde 404 en rutas desconocidas', async () => {
    await startServer();

    expect((await fetch(`${baseUrl}/unknown`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/build`, { method: 'POST' })).status).toBe(404);
  });
});
