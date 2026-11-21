import { describe, expect, it, vi } from 'vitest';
import { DockerApiError, DockerClient } from './docker-client.js';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createClient(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  return {
    client: new DockerClient('http://docker-proxy:2375', fetchMock as typeof fetch),
    fetchMock,
  };
}

describe('DockerClient', () => {
  it('crea un contenedor con nombre y devuelve su id', async () => {
    const { client, fetchMock } = createClient(jsonResponse(201, { Id: 'abc' }));

    await expect(client.createContainer('build-1', { Image: 'x' })).resolves.toBe('abc');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://docker-proxy:2375/containers/create?name=build-1');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ Image: 'x' });
  });

  it('convierte los errores de Docker en DockerApiError con su mensaje', async () => {
    const { client } = createClient(jsonResponse(404, { message: 'No such image: x' }));

    const error = await client.createContainer('b', {}).catch((caught) => caught);

    expect(error).toBeInstanceOf(DockerApiError);
    expect(error.status).toBe(404);
    expect(error.message).toBe('No such image: x');
  });

  it('trata la falta de conexión como 503', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const client = new DockerClient('http://docker-proxy:2375', fetchMock as typeof fetch);

    const error = await client.startContainer('abc').catch((caught) => caught);

    expect(error).toBeInstanceOf(DockerApiError);
    expect(error.status).toBe(503);
  });

  it('imageExists devuelve false con 404 y propaga otros errores', async () => {
    const { client } = createClient(
      jsonResponse(404, { message: 'no such image' }),
      jsonResponse(500, { message: 'boom' }),
    );

    await expect(client.imageExists('x')).resolves.toBe(false);
    await expect(client.imageExists('x')).rejects.toThrow('boom');
  });

  it('ensureNetwork no crea la red si ya existe', async () => {
    const { client, fetchMock } = createClient(jsonResponse(200, { Name: 'net' }));

    await client.ensureNetwork('net');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ensureNetwork crea una red bridge con salida si no existe', async () => {
    const { client, fetchMock } = createClient(
      jsonResponse(404, { message: 'network not found' }),
      jsonResponse(201, { Id: 'n1' }),
    );

    await client.ensureNetwork('net');

    const [url, init] = fetchMock.mock.calls[1];
    expect(String(url)).toBe('http://docker-proxy:2375/networks/create');
    expect(JSON.parse(init.body)).toMatchObject({
      Name: 'net',
      Driver: 'bridge',
      Internal: false,
    });
  });

  it('ignora 404 al eliminar y 409 al matar contenedores ya terminados', async () => {
    const { client } = createClient(
      jsonResponse(404, { message: 'no such container' }),
      jsonResponse(409, { message: 'is not running' }),
    );

    await expect(client.removeContainer('abc')).resolves.toBeUndefined();
    await expect(client.killContainer('abc')).resolves.toBeUndefined();
  });

  it('lee el estado del contenedor', async () => {
    const { client } = createClient(
      jsonResponse(200, { State: { Running: false, ExitCode: 3 } }),
    );

    await expect(client.inspectContainer('abc')).resolves.toEqual({
      running: false,
      exitCode: 3,
    });
  });
});
