import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { SyncService } from './sync.service.js';
import { PullDto, PushDto, SyncReportDto } from './dto/sync.dto.js';
import { CurrentTerminal, Public } from '../common/decorators.js';
import type { TerminalContext } from '../common/auth.types.js';
import { TerminalAuthGuard } from '../terminals/terminal-auth.guard.js';
import { TerminalsService } from '../terminals/terminals.service.js';

// @Public salta el guard global (JWT de admin); aquí manda el token de terminal
@Public()
@UseGuards(TerminalAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly terminals: TerminalsService,
  ) {}

  @Post('push')
  @HttpCode(200)
  push(@CurrentTerminal() t: TerminalContext, @Body() dto: PushDto) {
    return this.sync.push({ tenantId: t.tenantId, terminalId: t.id }, dto.ops);
  }

  @Post('report')
  @HttpCode(200)
  async report(@CurrentTerminal() t: TerminalContext, @Body() dto: SyncReportDto) {
    await this.terminals.reportSync(t.id, dto);
    return { ok: true };
  }

  @Post('pull')
  @HttpCode(200)
  pull(@CurrentTerminal() t: TerminalContext, @Body() dto: PullDto) {
    return this.sync.pull(
      { tenantId: t.tenantId, terminalId: t.id },
      dto.cursors,
      dto.limit,
    );
  }
}
