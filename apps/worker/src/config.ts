import 'dotenv/config';
import { DEFAULT_WORKSPACES_DIR } from '@shipyard/shared';

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

export const WORKSPACES_DIR =
  process.env.WORKSPACES_DIR || DEFAULT_WORKSPACES_DIR;

export const WORKER_CONCURRENCY = readPositiveInteger('WORKER_CONCURRENCY', 1);
