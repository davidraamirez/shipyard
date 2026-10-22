import { Worker } from 'bullmq';
import { prisma } from './prisma.js';
import {
  processDeployment,
  type DeploymentJob,
} from './deployment.processor.js';

const worker = new Worker<DeploymentJob>(
  'deployments',
  async (job) => processDeployment(job.data),
  {
    connection: {
      host: process.env.REDIS_HOST ?? '127.0.0.1',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
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
