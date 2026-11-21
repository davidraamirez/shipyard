// Error that retrying won't fix (unsupported project, missing
// lockfile, invalid URL...). The processor turns it into a BullMQ
// UnrecoverableError so retries are not wasted.
export class PermanentDeploymentError extends Error {
  override name = 'PermanentDeploymentError';
}

// Prisma P2025: the record does not exist. It happens when the project (and with
// it the deployment, via cascade) is deleted while the job is queued.
export function isRecordNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2025'
  );
}
