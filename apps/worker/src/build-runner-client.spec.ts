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

  it('follows the build to the end and emits output in order', async () => {
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

  it('sends the token and body when starting the build', async () => {
    const { promise, fetchMock } = run([reply(202, snapshot({ status: 'succeeded' }))]);

    await promise;

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://build-runner:8080/builds');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer secret');
    expect(JSON.parse(init.body)).toEqual(request);
  });

  it('a build step failure is permanent', async () => {
    const { promise } = run([
      reply(202, snapshot({
        status: 'failed',
        error: '"npm run build" exited with code 2',
        failedStep: 'build',
      })),
    ]);

    const error = await promise.catch((caught) => caught);

    expect(error).toBeInstanceOf(PermanentDeploymentError);
    expect(error.message).toBe('"npm run build" exited with code 2');
  });

  it('an install failure is transient', async () => {
    const { promise } = run([
      reply(202, snapshot({ status: 'failed', error: 'ETIMEDOUT', failedStep: 'install' })),
    ]);

    const error = await promise.catch((caught) => caught);

    expect(error).not.toBeInstanceOf(PermanentDeploymentError);
    expect(error.message).toBe('ETIMEDOUT');
  });

  it('a Docker failure is transient', async () => {
    const { promise } = run([
      reply(202, snapshot({ status: 'failed', error: 'Docker is not responding', failedStep: null })),
    ]);

    await expect(promise).rejects.not.toBeInstanceOf(PermanentDeploymentError);
  });

  it('a rejected request (400) is permanent', async () => {
    const { promise } = run([reply(400, { error: 'Invalid command' })]);

    const error = await promise.catch((caught) => caught);

    expect(error).toBeInstanceOf(PermanentDeploymentError);
    expect(error.message).toBe('Invalid command');
  });

  it.each([
    [429, 'Maximum number of concurrent builds reached'],
    [503, 'Build runner not configured'],
  ])('HTTP %i when starting the build is transient', async (status, message) => {
    const { promise } = run([reply(status, { error: message })]);

    const error = await promise.catch((caught) => caught);

    expect(error).not.toBeInstanceOf(PermanentDeploymentError);
    expect(error.message).toBe(message);
  });

  it('a lost build (404) is transient', async () => {
    const { promise } = run([
      reply(202, snapshot({ status: 'running' })),
      reply(404, { error: 'Build not found' }),
    ]);

    const error = await promise.catch((caught) => caught);

    expect(error).not.toBeInstanceOf(PermanentDeploymentError);
    expect(error.message).toContain('lost the build state');
  });

  it('rejects responses with an unexpected shape', async () => {
    const { promise } = run([reply(202, { status: 'ok' })]);

    await expect(promise).rejects.toThrow('Invalid response from the build runner');
  });

  it('fails if the build-runner is unreachable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      runRemoteBuild(request, () => {}, { fetchImpl: fetchMock as typeof fetch }),
    ).rejects.toThrow('Could not reach the build runner');
  });

  it('gives up after the maximum wait time', async () => {
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
    ).rejects.toThrow('The build exceeded the maximum wait time');
  });

  it('requires the build-runner to be configured', async () => {
    vi.stubEnv('BUILD_RUNNER_TOKEN', '');

    await expect(runRemoteBuild(request, () => {})).rejects.toThrow(
      'Build runner is not configured',
    );
  });
});
