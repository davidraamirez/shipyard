
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../api/src/generated/prisma/client.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(currentDirectory, '../../api/.env');
dotenv.config({ path: envPath });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    `DATABASE_URL no está definida. Archivo .env esperado: ${envPath}`,
  );
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

export const prisma = new PrismaClient({ adapter });