
import { prisma } from './prisma.js';

export type DeploymentJob = {
  deploymentId: string;
  projectId: string;
  repositoryUrl: string;
  requestedAt: string;
};

type DeploymentAttempt = {
  attemptsMade: number;
  maxAttempts: number;
};

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

async function writeDeploymentLog(
  deploymentId: string,
  level: LogLevel,
  message: string,
) {
  try {
    await prisma.deploymentLog.create({
      data: {
        deploymentId,
        level,
        message,
      },
    });
  } catch (error) {
    // Un fallo al guardar el log no debe ocultar el error original.
    console.error(
      `No se pudo guardar un log del deployment ${deploymentId}:`,
      error,
    );
  }
}

export async function processDeployment(
  { deploymentId, projectId, repositoryUrl }: DeploymentJob,
  { attemptsMade, maxAttempts }: DeploymentAttempt = {
    attemptsMade: 0,
    maxAttempts: 1,
  },
) {
  const attemptNumber = attemptsMade + 1;

  console.log(`Procesando deployment: ${deploymentId}`);
  console.log(`Proyecto: ${projectId}`);
  console.log(`Repositorio: ${repositoryUrl}`);
  console.log(`Intento: ${attemptNumber}/${maxAttempts}`);

  await writeDeploymentLog(
    deploymentId,
    'INFO',
    `Inicio del intento ${attemptNumber}/${maxAttempts}`,
  );

  try {
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'BUILDING' },
    });

    console.log(`Deployment ${deploymentId}: BUILDING`);

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      'Estado actualizado a BUILDING',
    );

    // Más adelante añadiremos aquí el clonado y la compilación.

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'RUNNING' },
    });

    console.log(`Deployment ${deploymentId}: RUNNING`);

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      'Deployment completado correctamente. Estado: RUNNING',
    );

    return {
      success: true,
      deploymentId,
      status: 'RUNNING' as const,
    };
  } catch (error) {
    const isLastAttempt = attemptNumber >= maxAttempts;
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    if (isLastAttempt) {
      await writeDeploymentLog(
        deploymentId,
        'ERROR',
        `Falló el último intento (${attemptNumber}/${maxAttempts}): ${errorMessage}`,
      );

      try {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'FAILED' },
        });

        await writeDeploymentLog(
          deploymentId,
          'ERROR',
          'Estado actualizado a FAILED tras agotar los intentos',
        );
      } catch (databaseError) {
        console.error(
          'No se pudo actualizar el estado en PostgreSQL:',
          databaseError,
        );
      }
    } else {
      await writeDeploymentLog(
        deploymentId,
        'WARN',
        `Falló el intento ${attemptNumber}/${maxAttempts}: ${errorMessage}. BullMQ podrá reintentarlo.`,
      );

      console.warn(
        `Deployment ${deploymentId}: intento fallido; BullMQ podrá reintentarlo`,
      );
    }

    throw error;
  }
}
