import { Worker } from 'bullmq';
import { WORKER_CONCURRENCY } from './config.js';
import { prisma } from './prisma.js';
import { DEPLOYMENTS_QUEUE, type DeploymentJob } from '@shipyard/shared';
import { processDeployment } from './deployment.processor.js';

const worker = new Worker<DeploymentJob>(
  DEPLOYMENTS_QUEUE,
  async (job) => processDeployment(job.data, {
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts.attempts ?? 1,
  }),
  {
    concurrency: WORKER_CONCURRENCY,
    connection: {
      host: process.env.REDIS_HOST ?? '127.0.0.1',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
    },
  },
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed:`, error.message);
});

worker.on('error', (error) => {
  console.error('Worker error:', error);
});

console.log(
  `Shipyard worker connected to queue ${DEPLOYMENTS_QUEUE} (concurrency ${WORKER_CONCURRENCY})`,
);

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
