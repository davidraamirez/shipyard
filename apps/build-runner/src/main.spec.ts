import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createBuildRunnerServer } from './main.js';

describe('Build runner HTTP', () => {
  let server: Server | undefined;
  let baseUrl: string;

  afterEach(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    server = undefined;
  });

  async function startServer(token?: string) {
    server = createBuildRunnerServer(token);

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

  it('responde correctamente en /health', async () => {
    await startServer('test-token');

    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('rechaza solicitudes /build sin token', async () => {
    await startServer('test-token');

    const response = await fetch(`${baseUrl}/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(401);
  });

  it('rechaza builds si no se ha configurado el token', async () => {
    await startServer(undefined);

    const response = await fetch(`${baseUrl}/build`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(503);
  });

  it('responde 404 en rutas desconocidas', async () => {
    await startServer('test-token');

    const response = await fetch(`${baseUrl}/unknown`);

    expect(response.status).toBe(404);
  });
});
