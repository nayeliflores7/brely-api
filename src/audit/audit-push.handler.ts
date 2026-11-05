import { Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientSession } from 'mongoose';
import { parsePayload } from '../sync/payload.util.js';
import { SyncService } from '../sync/sync.service.js';
import { PushHandler, PushOp, RejectedOpError, SyncContext } from '../sync/sync.types.js';
import { UsersService } from '../users/users.service.js';
import { AuditService } from './audit.service.js';
import { AuditPushDto } from './dto/audit.dto.js';

const POS_ENTITIES: Record<string, string> = {
  user: 'auth',
  product: 'products',
  sale: 'sales',
  cash_session: 'cash',
};

function parseDetail(detail?: string | null): unknown {
  if (!detail) return null;
  try {
    return JSON.parse(detail);
  } catch {
    return { raw: detail };
  }
}

@Injectable()
export class AuditPushHandler implements PushHandler, OnModuleInit {
  readonly entity = 'audit';

  constructor(
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly sync: SyncService,
  ) {}

  onModuleInit() {
    this.sync.register(this);
  }

  async handle(ctx: SyncContext, op: PushOp, session: ClientSession) {
    if (op.action !== 'create') throw new RejectedOpError(`Unknown action: ${op.action}`);
    const dto = await parsePayload(AuditPushDto, op.payload);
    const entity = POS_ENTITIES[dto.entity] ?? dto.entity;
    // Un PIN fallido ocurre sin sesión: el autor es el usuario al que se intentó entrar
    const actorId = dto.userId ?? (dto.entity === 'user' ? (dto.entityId ?? null) : null);
    const names = await this.users.displayNames([actorId]);
    const actorName = actorId ? (names.get(actorId) ?? '') : '';
    const detail = parseDetail(dto.detail);
    const entityName =
      entity === 'auth'
        ? actorName
        : dto.entityId
          ? await this.audit.lookupName(entity, dto.entityId)
          : String((detail as { code?: unknown } | null)?.code ?? ''); // sin registro: un código no encontrado
    await this.audit.recordInSession(
      {
        id: dto.id,
        tenantId: ctx.tenantId,
        source: 'pos',
        terminalId: ctx.terminalId,
        actorId,
        actorName,
        action: dto.action,
        entity,
        entityId: dto.entityId ?? null,
        entityName,
        detail,
        occurredAt: new Date(dto.createdAt),
      },
      session,
    );
  }
}
