// Cliente mínimo de la API HTTP de Docker Engine, sin dependencias. Solo
// implementa lo que necesita el build-runner, a través de docker-socket-proxy.

const REQUEST_TIMEOUT_MS = 15_000;

export class DockerApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DockerApiError';
  }
}

export type ContainerState = {
  running: boolean;
  exitCode: number;
};

export type ContainerSummary = {
  Id: string;
  Labels: Record<string, string>;
};

export class DockerClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    let response: Response;

    try {
      response = await this.fetchImpl(new URL(path, this.baseUrl), {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new DockerApiError(`No se pudo conectar con Docker: ${reason}`, 503);
    }

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as
        | { message?: unknown }
        | null;
      const message =
        typeof detail?.message === 'string'
          ? detail.message
          : `Docker respondió con HTTP ${response.status}`;

      throw new DockerApiError(message, response.status);
    }

    return response;
  }

  async imageExists(image: string): Promise<boolean> {
    try {
      await this.request('GET', `/images/${encodeURIComponent(image)}/json`);
      return true;
    } catch (error) {
      if (error instanceof DockerApiError && error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  // Crea la red si no existe. No es "internal" porque la instalación de
  // dependencias necesita salir al registro de paquetes.
  async ensureNetwork(name: string): Promise<void> {
    try {
      await this.request('GET', `/networks/${encodeURIComponent(name)}`);
      return;
    } catch (error) {
      if (!(error instanceof DockerApiError && error.status === 404)) {
        throw error;
      }
    }

    await this.request('POST', '/networks/create', {
      Name: name,
      Driver: 'bridge',
      Internal: false,
      CheckDuplicate: true,
      Labels: { 'shipyard.managed': 'true' },
    });
  }

  async createContainer(name: string, spec: object): Promise<string> {
    const response = await this.request(
      'POST',
      `/containers/create?name=${encodeURIComponent(name)}`,
      spec,
    );
    const body = (await response.json()) as { Id?: unknown };

    if (typeof body.Id !== 'string') {
      throw new DockerApiError('Docker no devolvió el id del contenedor', 502);
    }

    return body.Id;
  }

  async startContainer(id: string): Promise<void> {
    await this.request('POST', `/containers/${id}/start`);
  }

  async inspectContainer(id: string): Promise<ContainerState> {
    const response = await this.request('GET', `/containers/${id}/json`);
    const body = (await response.json()) as {
      State?: { Running?: boolean; ExitCode?: number };
    };

    return {
      running: body.State?.Running === true,
      exitCode: body.State?.ExitCode ?? -1,
    };
  }

  // Con Tty activado la salida llega como texto plano (sin la cabecera
  // multiplexada de 8 bytes) y stdout y stderr vienen ya mezclados.
  async containerLogs(id: string): Promise<string> {
    const response = await this.request(
      'GET',
      `/containers/${id}/logs?stdout=1&stderr=1`,
    );

    return response.text();
  }

  async killContainer(id: string): Promise<void> {
    try {
      await this.request('POST', `/containers/${id}/kill`);
    } catch (error) {
      // 409: el contenedor ya no está en ejecución.
      if (!(error instanceof DockerApiError && error.status === 409)) {
        throw error;
      }
    }
  }

  async removeContainer(id: string): Promise<void> {
    try {
      await this.request('DELETE', `/containers/${id}?force=1`);
    } catch (error) {
      if (!(error instanceof DockerApiError && error.status === 404)) {
        throw error;
      }
    }
  }

  async listContainersByLabel(label: string): Promise<ContainerSummary[]> {
    const filters = encodeURIComponent(JSON.stringify({ label: [label] }));
    const response = await this.request(
      'GET',
      `/containers/json?all=1&filters=${filters}`,
    );

    return (await response.json()) as ContainerSummary[];
  }
}
