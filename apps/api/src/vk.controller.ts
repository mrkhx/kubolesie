import { Body, Controller, Header, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { VkAdapter } from '@kubolesie/vk-bot';

@Controller()
export class VkController {
  constructor(private readonly adapter: VkAdapter) {}

  @Post(['/vk/callback', '/v1/vk/callback'])
  @Header('content-type', 'text/plain; charset=utf-8')
  async callback(@Body() body: unknown, @Res() res: Response): Promise<void> {
    const result = await this.adapter.handleCallback(body);
    res.status(result.status);
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.send(result.body);
  }
}
