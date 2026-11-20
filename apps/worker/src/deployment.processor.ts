import { prisma } from './prisma.js';
import { cloneRepository } from './git.js';
import { detectProject } from './project-detector.js';
import { buildProject } from './build.js';
import type { DeploymentJob } from '@shipyard/shared';


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

    const workspace = await cloneRepository(repositoryUrl, deploymentId);

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      'Repositorio clonado correctamente',
    );

    const projectInfo = await detectProject(workspace);

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      `Tipo de proyecto detectado: ${projectInfo.type}`,
    );

    if (projectInfo.type !== 'NODE') {
      throw new Error(
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

    const buildResult = await buildProject(
      deploymentId,
      workspace,
      projectInfo,
    );

    await writeDeploymentLog(
      deploymentId,
      'INFO',
      'Build completado correctamente',
    );

    if (buildResult.output.trim()) {
      await writeDeploymentLog(deploymentId, 'INFO', buildResult.output);
    }

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
      workspace,
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
