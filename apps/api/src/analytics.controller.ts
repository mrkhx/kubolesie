import { Controller, Get, Headers, Inject, Optional, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { GameStore } from '@kubolesie/game-core';
import type { StoreBundle } from '@kubolesie/database';
import type { EphemeralStore } from '@kubolesie/vk-bot';
import type { AppConfig } from './app-config';
import { checkAdminAnalyticsAuth } from './admin-auth';
import { AnalyticsService } from './analytics.service';
import { incMetric } from './metrics';

@Controller('/v1/admin/analytics')
export class AnalyticsController {
  private readonly service: AnalyticsService;

  constructor(
    @Inject('APP_CONFIG') private readonly appConfig: AppConfig,
    @Inject('GAME_STORE') store: GameStore,
    @Inject('STORE_BUNDLE') bundle: StoreBundle,
    @Optional() @Inject('EPHEMERAL_STORE') ephemeral?: EphemeralStore | null,
  ) {
    this.service = new AnalyticsService(store, bundle, appConfig, () =>
      ephemeral ? ephemeral.ping() : Promise.resolve(false),
    );
  }

  @Get('overview')
  async overview(@Headers('authorization') authorization: string | undefined, @Res() res: Response, @Req() req: Request) {
    if (!this.guard(authorization, res, req)) return;
    return res.status(200).json(await this.service.overview());
  }

  @Get('players')
  async players(@Headers('authorization') authorization: string | undefined, @Res() res: Response, @Req() req: Request) {
    if (!this.guard(authorization, res, req)) return;
    return res.status(200).json(await this.service.players());
  }

  @Get('progression')
  async progression(
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    if (!this.guard(authorization, res, req)) return;
    return res.status(200).json(await this.service.progression());
  }

  @Get('combat')
  async combat(@Headers('authorization') authorization: string | undefined, @Res() res: Response, @Req() req: Request) {
    if (!this.guard(authorization, res, req)) return;
    return res.status(200).json(await this.service.combat());
  }

  @Get('system')
  async system(@Headers('authorization') authorization: string | undefined, @Res() res: Response, @Req() req: Request) {
    if (!this.guard(authorization, res, req)) return;
    return res.status(200).json(await this.service.system());
  }

  private guard(authorization: string | undefined, res: Response, req: Request): boolean {
    void req;
    const result = checkAdminAnalyticsAuth(this.appConfig.adminAnalyticsToken, authorization);
    if (result === 'disabled') {
      res.status(404).json({ error: 'not_found' });
      return false;
    }
    if (result === 'missing' || result === 'wrong') {
      res.status(401).json({ error: 'unauthorized' });
      return false;
    }
    incMetric('adminEndpointRequests');
    return true;
  }
}
