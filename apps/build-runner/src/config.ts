import { DEFAULT_WORKSPACES_DIR } from '@shipyard/shared';

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} debe ser un entero positivo`);
  }

  return value;
}

export type BuildRunnerConfig = {
  dockerHost: string;
  image: string;
  workspacesVolume: string;
  workspacesDir: string;
  installNetwork: string;
  stepTimeoutMs: number;
  maxConcurrentBuilds: number;
  memoryBytes: number;
  nanoCpus: number;
  pidsLimit: number;
  maxOutputChars: number;
};

export function loadConfig(): BuildRunnerConfig {
  return {
    dockerHost: process.env.DOCKER_HOST || 'http://docker-proxy:2375',
    image: process.env.BUILD_IMAGE || 'shipyard-build-node:22',
    workspacesVolume: process.env.BUILD_WORKSPACES_VOLUME || 'shipyard_workspaces',
    workspacesDir: process.env.WORKSPACES_DIR || DEFAULT_WORKSPACES_DIR,
    installNetwork: process.env.BUILD_NETWORK || 'shipyard_build_egress',
    stepTimeoutMs: readPositiveInteger('BUILD_STEP_TIMEOUT_SECONDS', 600) * 1000,
    maxConcurrentBuilds: readPositiveInteger('MAX_CONCURRENT_BUILDS', 2),
    memoryBytes: readPositiveInteger('BUILD_MEMORY_MB', 1024) * 1024 * 1024,
    nanoCpus: readPositiveInteger('BUILD_CPUS', 1) * 1_000_000_000,
    pidsLimit: readPositiveInteger('BUILD_PIDS_LIMIT', 256),
    maxOutputChars: readPositiveInteger('BUILD_MAX_OUTPUT_CHARS', 200_000),
  };
}
