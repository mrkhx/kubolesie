import { Inject, Injectable, Optional, type OnModuleDestroy } from '@nestjs/common';
import type { StoreBundle } from '@kubolesie/database';
import type { EphemeralStore } from '@kubolesie/vk-bot';

@Injectable()
export class StoreLifecycle implements OnModuleDestroy {
  constructor(
    @Inject('STORE_BUNDLE') private readonly bundle: StoreBundle,
    @Optional() @Inject('EPHEMERAL_STORE') private readonly ephemeral?: EphemeralStore | null,
  ) {}

  async onModuleDestroy(): Promise<void> {
    if (this.bundle.prisma) {
      await this.bundle.prisma.$disconnect();
    }
    if (this.ephemeral) {
      await this.ephemeral.close();
    }
  }
}
