import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatHistoryService } from './chat-history.service';

/** Saved Regent chats for the signed-in user. Every route is scoped to req.user.id. */
@UseGuards(JwtAuthGuard)
@Controller('chats')
export class ChatHistoryController {
  constructor(private readonly chats: ChatHistoryService) {}

  @Get()
  list(@Req() req: any) {
    return this.chats.list(req.user.id);
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: any) {
    return this.chats.get(req.user.id, id);
  }

  /** Create or replace a chat's messages. */
  @Put(':id')
  save(
    @Param('id') id: string,
    @Body() body: { title?: string; messages: unknown; updatedAt?: number },
    @Req() req: any,
  ) {
    return this.chats.save(req.user.id, id, body || ({} as any));
  }

  /** Rename or pin / unpin. */
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { title?: string; pinned?: boolean }, @Req() req: any) {
    return this.chats.update(req.user.id, id, {
      title: body?.title,
      pinned: typeof body?.pinned === 'boolean' ? body.pinned : undefined,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @Req() req: any) {
    await this.chats.remove(req.user.id, id);
  }
}
