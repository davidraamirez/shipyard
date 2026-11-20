import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, createPrismaAdapter } from '@shipyard/database';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: createPrismaAdapter() });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
