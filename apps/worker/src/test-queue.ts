
import { Queue } from 'bullmq';

const queue = new Queue('deployments', {
  connection: {
    host: '127.0.0.1',
    port: 6379,
  },
});

async function main() {
  try {
    const job = await queue.add('test-deployment', {
      projectId: 'project-test-001',
      repositoryUrl: 'https://github.com/example/demo',
      requestedAt: new Date().toISOString(),
    });

    console.log('Trabajo añadido correctamente:', job.id);
  } finally {
    await queue.close();
  }
}

main().catch((error: unknown) => {
  console.error('Error al añadir el trabajo:', error);
  process.exitCode = 1;
});
