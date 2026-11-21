// Minimal, dependency-free Docker Engine HTTP API client. It only
// implements what the build-runner needs, through docker-socket-proxy.

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
      throw new DockerApiError(`Could not connect to Docker: ${reason}`, 503);
    }

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as
        | { message?: unknown }
        | null;
      const message =
        typeof detail?.message === 'string'
          ? detail.message
          : `Docker responded with HTTP ${response.status}`;

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

  // Creates the network if missing. It is not "internal" because dependency
  // installation needs to reach the package registry.
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
      throw new DockerApiError('Docker did not return the container id', 502);
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

  // With Tty enabled the output is plain text (without the 8-byte
  // multiplexing header) and stdout and stderr are already merged.
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
      // 409: the container is no longer running.
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
