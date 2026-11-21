import { timingSafeEqual } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { isDeploymentId } from '@shipyard/shared';
import { validateBuildRequest } from './build-request.js';
import { BuildBusyError, BuildManager } from './build-manager.js';
import { loadConfig } from './config.js';
import { DEPLOYMENT_LABEL } from './container-spec.js';
import { DockerApiError, DockerClient } from './docker-client.js';
import { DockerStepRunner } from './step-runner.js';
import { requireWorkspace } from './workspace.js';

const MAX_BODY_LENGTH = 16_384;
const BUILD_PATH = /^\/builds\/([^/?]+)$/;

type ServerOptions = {
  token: string | undefined;
  manager: BuildManager;
  workspacesDir?: string;
};

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

// Constant-time comparison so timing does not leak the token.
function isAuthorized(header: string | undefined, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`);
  const received = Buffer.from(header ?? '');

  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      if (body.length + chunk.length > MAX_BODY_LENGTH) {
        reject(new RangeError('Request too large'));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

export function createBuildRunnerServer({
  token,
  manager,
  workspacesDir,
}: ServerOptions) {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://build-runner');

    if (request.method === 'GET' && url.pathname === '/health') {
      send(response, 200, { status: 'ok' });
      return;
    }

    const buildMatch = BUILD_PATH.exec(url.pathname);
    const isStart = request.method === 'POST' && url.pathname === '/builds';
    const isStatus = request.method === 'GET' && buildMatch !== null;

    if (!isStart && !isStatus) {
      send(response, 404, { error: 'Not found' });
      return;
    }

    if (!token) {
      send(response, 503, { error: 'Build runner not configured' });
      return;
    }

    if (!isAuthorized(request.headers.authorization, token)) {
      send(response, 401, { error: 'Unauthorized' });
      return;
    }

    if (isStatus) {
      const deploymentId = decodeURIComponent(buildMatch![1]);
      const after = Number(url.searchParams.get('after') ?? 0);

      if (!isDeploymentId(deploymentId) || !Number.isInteger(after) || after < 0) {
        send(response, 400, { error: 'Invalid parameters' });
        return;
      }

      const build = manager.get(deploymentId, after);

      if (!build) {
        send(response, 404, { error: 'Build not found' });
        return;
      }

      send(response, 200, build);
      return;
    }

    try {
      const buildRequest = validateBuildRequest(JSON.parse(await readBody(request)));
      await requireWorkspace(buildRequest.deploymentId, workspacesDir);

      send(response, 202, manager.start(buildRequest));
    } catch (error) {
      if (error instanceof RangeError) {
        send(response, 413, { error: error.message });
        return;
      }

      if (error instanceof BuildBusyError) {
        send(response, 429, { error: error.message });
        return;
      }

      const message =
        error instanceof Error ? error.message : 'Invalid request';

      send(
        response,
        message === 'Deployment workspace not found' ? 404 : 400,
        { error: message },
      );
    }
  });
}

// Gets Docker ready: install network, build image and no orphan containers
// from a previous restart.
async function prepareDocker(docker: DockerClient, network: string, image: string) {
  await docker.ensureNetwork(network);

  if (!(await docker.imageExists(image))) {
    console.error(
      `Build image ${image} not found. Build it with "pnpm build:image".`,
    );
  }

  const orphans = await docker.listContainersByLabel(DEPLOYMENT_LABEL);

  for (const container of orphans) {
    await docker.removeContainer(container.Id);
  }

  if (orphans.length > 0) {
    console.log(`Removed ${orphans.length} orphan build containers`);
  }
}

if (process.env.NODE_ENV !== 'test') {
  const config = loadConfig();
  const docker = new DockerClient(config.dockerHost);
  const manager = new BuildManager(new DockerStepRunner(docker, config), {
    maxConcurrentBuilds: config.maxConcurrentBuilds,
    maxOutputChars: config.maxOutputChars,
  });

  const server = createBuildRunnerServer({
    token: process.env.BUILD_RUNNER_TOKEN,
    manager,
    workspacesDir: config.workspacesDir,
  });

  const port = Number(process.env.PORT ?? 8080);
  const host = '0.0.0.0';

  prepareDocker(docker, config.installNetwork, config.image)
    .catch((error: unknown) => {
      const message =
        error instanceof DockerApiError || error instanceof Error
          ? error.message
          : String(error);
      console.error(`Could not prepare Docker: ${message}`);
    })
    .finally(() => {
      server.listen(port, host, () => {
        console.log(`Build runner listening on ${host}:${port}`);
      });
    });
}
