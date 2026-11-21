import { PrismaPg } from '@prisma/adapter-pg';

export * from './generated/prisma/client.js';

export function createPrismaAdapter(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  return new PrismaPg({ connectionString: databaseUrl });
}
