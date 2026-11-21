import { UnrecoverableError } from 'bullmq';
import type { DeploymentJob } from '@shipyard/shared';
import { prisma } from './prisma.js';
import { cloneRepository, getHeadCommit, removeWorkspace } from './git.js';
import { detectProject } from './project-detector.js';
import { buildProject } from './build.js';
import { PermanentDeploymentError, isRecordNotFound } from './errors.js';

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

  let workspace: string | null = null;

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

    workspace = await cloneRepository(repositoryUrl, deploymentId);

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      'Repositorio clonado correctamente',
    );

    const commitSha = await getHeadCommit(workspace);

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { commitSha },
    });

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      `Commit: ${commitSha.slice(0, 7)}`,
    );

    const projectInfo = await detectProject(workspace);

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      `Tipo de proyecto detectado: ${projectInfo.type}`,
    );

    if (projectInfo.type !== 'NODE') {
      throw new PermanentDeploymentError(
        `Tipo de proyecto no compatible para build: ${projectInfo.type}`,
      );
    }

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      `Gestor de paquetes: ${projectInfo.packageManager ?? 'no detectado'}`,
    );

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      `Script build: ${projectInfo.buildScript ?? 'no definido'}`,
    );

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      'Iniciando build del proyecto',
    );

    // La salida del build se guarda a medida que llega del build-runner.
    await buildProject(deploymentId, workspace, projectInfo, async (output) => {
      // Los trozos llegan cortados por el sondeo y a veces empiezan con un
      // salto de línea: se quitan los del principio y los del final.
      const text = output.replace(/^\n+/, '').trimEnd();

      if (text) {
        await writeDeploymentLog(deploymentId, 'INFO', text);
      }
    });

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      'Build completado correctamente',
    );

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'RUNNING' },
    });

    console.log(`Deployment ${deploymentId}: RUNNING`);

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      'Estado actualizado a RUNNING',
    );

    return {
      success: true,
      deploymentId,
      status: 'RUNNING' as const,
    };
  } catch (error) {
    if (isRecordNotFound(error)) {
      // El proyecto se borró mientras el job estaba en la cola: no hay nada
      // que actualizar ni donde guardar logs.
      console.warn(
        `Deployment ${deploymentId}: ya no existe; se descarta el job`,
      );

      throw new UnrecoverableError('El deployment ya no existe');
    }

    const isPermanent = error instanceof PermanentDeploymentError;
    const isLastAttempt = isPermanent || attemptNumber >= maxAttempts;
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    if (isLastAttempt) {
      await writeDeploymentLog(
        deploymentId,
        'ERROR',
        isPermanent
          ? `Error no recuperable: ${errorMessage}`
          : `Falló el último intento (${attemptNumber}/${maxAttempts}): ${errorMessage}`,
      );

      try {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'FAILED' },
        });

        await writeDeploymentLog(
          deploymentId,
          'ERROR',
          isPermanent
            ? 'Estado actualizado a FAILED'
            : 'Estado actualizado a FAILED tras agotar los intentos',
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

    if (isPermanent) {
      throw new UnrecoverableError(errorMessage);
    }

    throw error;
  } finally {
    if (workspace) {
      await removeWorkspace(workspace).catch((cleanupError) => {
        console.error(
          `No se pudo eliminar el workspace del deployment ${deploymentId}:`,
          cleanupError,
        );
      });
    }
  }
}
