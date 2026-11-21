import type { BuildCommand } from '@shipyard/shared';
import { PermanentDeploymentError } from './errors.js';

const REQUEST_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 2_000;
// At most two 10-min steps in the build-runner, plus margin.
const BUILD_TIMEOUT_MS = 25 * 60 * 1000;

export type BuildRunnerRequest = {
  deploymentId: string;
  commands: BuildCommand[];
};

type BuildStatus = 'running' | 'succeeded' | 'failed';

type BuildSnapshot = {
  status: BuildStatus;
  output: string;
  nextOffset: number;
  error: string | null;
  failedStep: 'install' | 'build' | null;
};

export type RemoteBuildOptions = {
  pollIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function getRunnerConfig() {
  const baseUrl = process.env.BUILD_RUNNER_URL;
  const token = process.env.BUILD_RUNNER_TOKEN;

  if (!baseUrl || !token) {
    throw new Error('Build runner is not configured');
  }

  const url = new URL(baseUrl);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Build runner protocol not allowed');
  }

  return { baseUrl: url, token };
}

function isSnapshot(value: unknown): value is BuildSnapshot {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;

  return (
    (body.status === 'running' || body.status === 'succeeded' || body.status === 'failed') &&
    typeof body.output === 'string' &&
    typeof body.nextOffset === 'number' &&
    (body.error === null || typeof body.error === 'string') &&
    (body.failedStep === null || body.failedStep === 'install' || body.failedStep === 'build')
  );
}

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Starts the build in the build-runner and follows it until it ends, passing new
// output to onOutput. Throws PermanentDeploymentError if retrying would not
// change the result, and a plain Error if the failure is transient.
export async function runRemoteBuild(
  request: BuildRunnerRequest,
  onOutput: (text: string) => Promise<void> | void,
  options: RemoteBuildOptions = {},
): Promise<void> {
  const { baseUrl, token } = getRunnerConfig();
  const fetchImpl = options.fetchImpl ?? fetch;
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const deadline = Date.now() + (options.timeoutMs ?? BUILD_TIMEOUT_MS);

  const call = async (path: string, init: RequestInit = {}) => {
    let response: Response;

    try {
      response = await fetchImpl(new URL(path, baseUrl), {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not reach the build runner: ${reason}`);
    }

    const body = (await response.json().catch(() => null)) as unknown;
    return { response, body };
  };

  const errorMessage = (body: unknown, status: number) =>
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `Build runner responded with HTTP ${status}`;

  const started = await call('/builds', {
    method: 'POST',
    body: JSON.stringify(request),
  });

  if (started.response.status !== 202) {
    const message = errorMessage(started.body, started.response.status);

    // 400: the request is invalid; repeating it would give the same result.
    if (started.response.status === 400) {
      throw new PermanentDeploymentError(message);
    }

    throw new Error(message);
  }

  if (!isSnapshot(started.body)) {
    throw new Error('Invalid response from the build runner');
  }

  let snapshot = started.body;

  for (;;) {
    if (snapshot.output) {
      await onOutput(snapshot.output);
    }

    if (snapshot.status === 'succeeded') {
      return;
    }

    if (snapshot.status === 'failed') {
      const message = snapshot.error ?? 'The build failed';

      // A failing build will fail again on the same commit. Install,
      // however, can fail because of the network, so it is retried.
      if (snapshot.failedStep === 'build') {
        throw new PermanentDeploymentError(message);
      }

      throw new Error(message);
    }

    if (Date.now() > deadline) {
      throw new Error('The build exceeded the maximum wait time');
    }

    await sleep(pollIntervalMs);

    const polled = await call(
      `/builds/${request.deploymentId}?after=${snapshot.nextOffset}`,
    );

    if (polled.response.status === 404) {
      throw new Error('The build runner lost the build state (did it restart?)');
    }

    if (!polled.response.ok) {
      throw new Error(errorMessage(polled.body, polled.response.status));
    }

    if (!isSnapshot(polled.body)) {
      throw new Error('Invalid response from the build runner');
    }

    snapshot = polled.body;
  }
}
