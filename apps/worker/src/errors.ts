// Error que no se arregla reintentando (proyecto no compatible, falta el
// lockfile, URL no válida...). El processor lo convierte en un
// UnrecoverableError de BullMQ para no gastar los reintentos.
export class PermanentDeploymentError extends Error {
  override name = 'PermanentDeploymentError';
}

// Prisma P2025: el registro no existe. Pasa cuando el proyecto (y con él el
// deployment, por el cascade) se borra mientras el job está en la cola.
export function isRecordNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2025'
  );
}
