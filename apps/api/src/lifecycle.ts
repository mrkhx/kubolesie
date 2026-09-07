import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { StoreBundle } from '@kubolesie/database';

@Injectable()
export class StoreLifecycle implements OnModuleDestroy {
  constructor(@Inject('STORE_BUNDLE') private readonly bundle: StoreBundle) {}

  async onModuleDestroy(): Promise<void> {
    if (this.bundle.prisma) {
      await this.bundle.prisma.$disconnect();
    }
  }
}
