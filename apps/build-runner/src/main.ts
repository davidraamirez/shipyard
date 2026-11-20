import { createServer } from 'node:http';
import { validateBuildRequest } from './build-request.js';
import { requireWorkspace } from './workspace.js';

const MAX_BODY_LENGTH = 16_384;

export function createBuildRunnerServer(token: string | undefined) {
  return createServer((request, response) => {
    response.setHeader('content-type', 'application/json');

    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200);
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (request.method !== 'POST' || request.url !== '/build') {
      response.writeHead(404);
      response.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    if (!token) {
      response.writeHead(503);
      response.end(JSON.stringify({ error: 'Build runner no configurado' }));
      return;
    }

    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401);
      response.end(JSON.stringify({ error: 'No autorizado' }));
      return;
    }

    let body = '';
    let tooLarge = false;

    request.setEncoding('utf8');

    request.on('data', (chunk: string) => {
      if (body.length + chunk.length > MAX_BODY_LENGTH) {
        tooLarge = true;
        response.writeHead(413);
        response.end(
          JSON.stringify({ error: 'Solicitud demasiado grande' }),
        );
        request.destroy();
        return;
      }

      body += chunk;
    });

    request.on('end', async () => {
      if (tooLarge || response.writableEnded) return;

      try {
        const buildRequest = validateBuildRequest(JSON.parse(body));
        await requireWorkspace(buildRequest.deploymentId);

        response.writeHead(501);
        response.end(
          JSON.stringify({
            error: 'Ejecución de builds todavía no implementada',
            deploymentId: buildRequest.deploymentId,
          }),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Solicitud no válida';

        const status =
          message === 'No se encuentra el workspace del deployment'
            ? 404
            : 400;

        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      }
    });
  });
}

const port = Number(process.env.PORT ?? 8080);
const host = '0.0.0.0';

if (process.env.NODE_ENV !== 'test') {
  const server = createBuildRunnerServer(process.env.BUILD_RUNNER_TOKEN);

  server.listen(port, host, () => {
    console.log(`Build runner escuchando en ${host}:${port}`);
  });
}