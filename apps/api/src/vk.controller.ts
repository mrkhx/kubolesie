import { Body, Controller, Header, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { VkAdapter } from '@kubolesie/vk-bot';

export function requestIp(req: {
  ip?: string;
  headers?: Record<string, unknown>;
  socket?: { remoteAddress?: string };
}): string | undefined {
  const forwarded = req.headers?.['x-forwarded-for'];
  const raw =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]
      : Array.isArray(forwarded)
        ? String(forwarded[0])
        : req.ip ?? req.socket?.remoteAddress;
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 64);
}

@Controller()
export class VkController {
  constructor(@Inject(VkAdapter) private readonly adapter: VkAdapter) {}

  @Post(['/vk/callback', '/v1/vk/callback'])
  @Header('content-type', 'text/plain; charset=utf-8')
  async callback(@Body() body: unknown, @Req() req: Request, @Res() res: Response): Promise<void> {
    const result = await this.adapter.handleCallback(body, { ip: requestIp(req) });
    res.status(result.status);
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.send(result.body);
  }
}
