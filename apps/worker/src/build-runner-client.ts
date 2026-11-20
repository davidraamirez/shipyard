import type { BuildCommand } from './build-strategy.js';

const REQUEST_TIMEOUT_MS = 10_000;

export type BuildRunnerRequest = {
  deploymentId: string;
  commands: BuildCommand[];
};

export async function requestBuild(
  request: BuildRunnerRequest,
): Promise<{ success: true; output: string }> {
  const baseUrl = process.env.BUILD_RUNNER_URL;
  const token = process.env.BUILD_RUNNER_TOKEN;

  if (!baseUrl || !token) {
    throw new Error('Build runner no está configurado');
  }

  const url = new URL('/build', baseUrl);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Protocolo del build runner no permitido');
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!response.ok) {
      const message =
        typeof body?.error === 'string'
          ? body.error
          : `Build runner respondió con HTTP ${response.status}`;

      throw new Error(message);
    }

    if (
      body?.success !== true ||
      typeof body.output !== 'string'
    ) {
      throw new Error('Respuesta no válida del build runner');
    }

    return {
      success: true,
      output: body.output,
    };
  } finally {
    clearTimeout(timeout);
  }
}
