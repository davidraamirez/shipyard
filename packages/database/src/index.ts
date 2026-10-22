import { PrismaPg } from '@prisma/adapter-pg';

export * from './generated/prisma/client.js';

export function createPrismaAdapter(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL no está definida');
  }

  return new PrismaPg({ connectionString: databaseUrl });
}
