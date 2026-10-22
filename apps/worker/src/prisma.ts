import 'dotenv/config';
import { PrismaClient, createPrismaAdapter } from '@shipyard/database';

export const prisma = new PrismaClient({ adapter: createPrismaAdapter() });
