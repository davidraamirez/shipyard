import { prisma } from './prisma.js';

export type DeploymentJob = {
  deploymentId: string;
  projectId: string;
  repositoryUrl: string;
  requestedAt: string;
};

export async function processDeployment({
  deploymentId,
  projectId,
  repositoryUrl,
}: DeploymentJob) {
  console.log(`Procesando deployment: ${deploymentId}`);
  console.log(`Proyecto: ${projectId}`);
  console.log(`Repositorio: ${repositoryUrl}`);

  try {
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'BUILDING' },
    });

    console.log(`Deployment ${deploymentId}: BUILDING`);

    // Más adelante añadiremos aquí el clonado y la compilación.

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'RUNNING' },
    });

    console.log(`Deployment ${deploymentId}: RUNNING`);

    return {
      success: true,
      deploymentId,
      status: 'RUNNING' as const,
    };
  } catch (error) {
    try {
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: 'FAILED' },
      });
    } catch (databaseError) {
      console.error(
        'No se pudo actualizar el estado en PostgreSQL:',
        databaseError,
      );
    }

    throw error;
  }
}
