import { Worker, type Job } from 'bullmq';
import { prisma } from './prisma.js';

type DeploymentJob = {
  deploymentId: string;
  projectId: string;
  repositoryUrl: string;
  requestedAt: string;
};

const worker = new Worker<DeploymentJob>(
  'deployments',
  async (job: Job<DeploymentJob>) => {
    const { deploymentId, projectId, repositoryUrl } = job.data;

    console.log(`Procesando deployment: ${deploymentId}`);
    console.log(`Proyecto: ${projectId}`);
    console.log(`Repositorio: ${repositoryUrl}`);

    try {
      // 1. Marcar el deployment como BUILDING.
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: 'BUILDING' },
      });

      console.log(`Deployment ${deploymentId}: BUILDING`);

      // Más adelante clonaremos el repositorio y construiremos la aplicación.

      // 2. Por ahora, simulamos que el despliegue termina correctamente.
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: 'RUNNING' },
      });

      console.log(`Deployment ${deploymentId}: RUNNING`);

      return {
        success: true,
        deploymentId,
        status: 'RUNNING',
      };
    } catch (error) {
      // Si falla el procesamiento, registrar el estado FAILED.
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
  },
  {
    connection: {
      host: '127.0.0.1',
      port: 6379,
    },
  },
);

worker.on('completed', (job) => {
  console.log(`Trabajo ${job.id} completado`);
});

worker.on('failed', (job, error) => {
  console.error(`Trabajo ${job?.id} fallido:`, error.message);
});

worker.on('error', (error) => {
  console.error('Error del Worker:', error);
});

console.log('Shipyard worker conectado a la cola deployments');

async function shutdown() {
  await worker.close();
  await prisma.$disconnect();
}

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});