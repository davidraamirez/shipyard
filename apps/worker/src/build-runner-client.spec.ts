import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runRemoteBuild } from './build-runner-client.js';
import { PermanentDeploymentError } from './errors.js';

const deploymentId = '123e4567-e89b-12d3-a456-426614174000';
const request = {
  deploymentId,
  commands: [{ command: 'npm' as const, args: ['ci', '--ignore-scripts'] }],
};

type Snapshot = {
  status: 'running' | 'succeeded' | 'failed';
  output?: string;
  nextOffset?: number;
  error?: string | null;
  failedStep?: 'install' | 'build' | null;
};

const snapshot = (value: Snapshot) => ({
  output: '',
  nextOffset: 0,
  error: null,
  failedStep: null,
  ...value,
});

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

function run(responses: Response[], onOutput = vi.fn()) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);

  return {
    fetchMock,
    onOutput,
    promise: runRemoteBuild(request, onOutput, {
      fetchImpl: fetchMock as typeof fetch,
      pollIntervalMs: 0,
    }),
  };
}

describe('runRemoteBuild', () => {
  beforeEach(() => {
    vi.stubEnv('BUILD_RUNNER_URL', 'http://build-runner:8080');
    vi.stubEnv('BUILD_RUNNER_TOKEN', 'secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sigue el build hasta el final y emite la salida en orden', async () => {
    const { promise, onOutput, fetchMock } = run([
      reply(202, snapshot({ status: 'running', output: 'a\n', nextOffset: 2 })),
      reply(200, snapshot({ status: 'running', output: 'b\n', nextOffset: 4 })),
      reply(200, snapshot({ status: 'succeeded', output: 'c\n', nextOffset: 6 })),
    ]);

    await expect(promise).resolves.toBeUndefined();

    expect(onOutput.mock.calls.map(([text]) => text)).toEqual(['a\n', 'b\n', 'c\n']);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      `http://build-runner:8080/builds/${deploymentId}?after=2`,
    );
    expect(String(fetchMock.mock.calls[2][0])).toContain('after=4');
  });

  it('envía el token y el cuerpo al lanzar el build', async () => {
    const { promise, fetchMock } = run([reply(202, snapshot({ status: 'succeeded' }))]);

    await promise;

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://build-runner:8080/builds');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer secret');
    expect(JSON.parse(init.body)).toEqual(request);
  });

  it('un fallo en el paso build es permanente', async () => {
    const { promise } = run([
      reply(202, snapshot({
        status: 'failed',
        error: '"npm run build" terminó con código 2',
        failedStep: 'build',
      })),
    ]);

    const error = await promise.catch((caught) => caught);

    expect(error).toBeInstanceOf(PermanentDeploymentError);
    expect(error.message).toBe('"npm run build" terminó con código 2');
  });

  it('un fallo en la instalación es transitorio', async () => {
    const { promise } = run([
      reply(202, snapshot({ status: 'failed', error: 'ETIMEDOUT', failedStep: 'install' })),
    ]);

    const error = await promise.catch((caught) => caught);

    expect(error).not.toBeInstanceOf(PermanentDeploymentError);
    expect(error.message).toBe('ETIMEDOUT');
  });

  it('un fallo de Docker es transitorio', async () => {
    const { promise } = run([
      reply(202, snapshot({ status: 'failed', error: 'Docker no responde', failedStep: null })),
    ]);

    await expect(promise).rejects.not.toBeInstanceOf(PermanentDeploymentError);
  });

  it('una petición rechazada (400) es permanente', async () => {
    const { promise } = run([reply(400, { error: 'Comando no válido' })]);

    const error = await promise.catch((caught) => caught);

    expect(error).toBeInstanceOf(PermanentDeploymentError);
    expect(error.message).toBe('Comando no válido');
  });

  it.each([
    [429, 'Se ha alcanzado el máximo de builds simultáneos'],
    [503, 'Build runner no configurado'],
  ])('HTTP %i al lanzar el build es transitorio', async (status, message) => {
    const { promise } = run([reply(status, { error: message })]);

    const error = await promise.catch((caught) => caught);

    expect(error).not.toBeInstanceOf(PermanentDeploymentError);
    expect(error.message).toBe(message);
  });

  it('si el build-runner pierde el build (404) el error es transitorio', async () => {
    const { promise } = run([
      reply(202, snapshot({ status: 'running' })),
      reply(404, { error: 'Build no encontrado' }),
    ]);

    const error = await promise.catch((caught) => caught);

    expect(error).not.toBeInstanceOf(PermanentDeploymentError);
    expect(error.message).toContain('perdió el estado del build');
  });

  it('rechaza respuestas con un formato inesperado', async () => {
    const { promise } = run([reply(202, { status: 'ok' })]);

    await expect(promise).rejects.toThrow('Respuesta no válida del build runner');
  });

  it('falla si el build-runner no es accesible', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      runRemoteBuild(request, () => {}, { fetchImpl: fetchMock as typeof fetch }),
    ).rejects.toThrow('No se pudo contactar con el build runner');
  });

  it('se rinde al superar el tiempo máximo de espera', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => reply(200, snapshot({ status: 'running' })));
    fetchMock.mockResolvedValueOnce(reply(202, snapshot({ status: 'running' })));

    await expect(
      runRemoteBuild(request, () => {}, {
        fetchImpl: fetchMock as typeof fetch,
        pollIntervalMs: 0,
        timeoutMs: 0,
      }),
    ).rejects.toThrow('El build superó el tiempo máximo de espera');
  });

  it('exige que el build-runner esté configurado', async () => {
    vi.stubEnv('BUILD_RUNNER_TOKEN', '');

    await expect(runRemoteBuild(request, () => {})).rejects.toThrow(
      'Build runner no está configurado',
    );
  });
});
