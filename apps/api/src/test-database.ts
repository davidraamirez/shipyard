
import 'dotenv/config';
import { PrismaService } from './prisma/prisma.service.js';

async function main() {
  const prisma = new PrismaService();

  try {
    const project = await prisma.project.findFirstOrThrow({
      where: {
        name: 'mi-primer-proyecto',
        user: {
          email: 'demo@shipyard.local',
        },
      },
      include: {
        deployments: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    console.log('Proyecto:', project.name);
    console.log('Número de despliegues:', project.deployments.length);
    console.log('Historial:', project.deployments);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
