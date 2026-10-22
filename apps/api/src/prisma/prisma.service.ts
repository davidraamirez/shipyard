import { Injectable } from '@nestjs/common';
import { PrismaClient, createPrismaAdapter } from '@shipyard/database';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    super({ adapter: createPrismaAdapter() });
  }
}
