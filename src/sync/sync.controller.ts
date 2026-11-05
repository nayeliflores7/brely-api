import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { SyncService } from './sync.service.js';
import { PullDto, PushDto, SyncReportDto } from './dto/sync.dto.js';
import { CurrentTerminal, Public } from '../common/decorators.js';
import type { TerminalContext } from '../common/auth.types.js';
import { TerminalAuthGuard } from '../terminals/terminal-auth.guard.js';
import { TerminalsService } from '../terminals/terminals.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UnlinkDto } from './dto/unlink.dto.js';

// @Public salta el guard global (JWT de admin); aquí manda el token de terminal
@Public()
@UseGuards(TerminalAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly terminals: TerminalsService,
    private readonly audit: AuditService,
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

  // El POS solo lo llama sin nada pendiente; las rechazadas ya no iban a llegar y quedan anotadas
  @Post('unlink')
  @HttpCode(200)
  async unlink(@CurrentTerminal() t: TerminalContext, @Body() dto: UnlinkDto) {
    await this.terminals.unlinkSelf(t.id);
    await this.audit.record({
      tenantId: t.tenantId,
      source: 'pos',
      actorId: null,
      actorName: dto.userName,
      action: 'terminals.unlink',
      entity: 'terminals',
      entityId: t.id,
      entityName: (await this.terminals.options(t.tenantId)).find((x) => x._id === t.id)?.name ?? '',
      detail: { rejected: dto.rejected },
    });
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
