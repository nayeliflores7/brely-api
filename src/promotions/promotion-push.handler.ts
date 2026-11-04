import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsString, MaxLength } from 'class-validator';
import type { ClientSession } from 'mongoose';
import { asRejection, parsePayload } from '../sync/payload.util.js';
import { SyncService } from '../sync/sync.service.js';
import { PushHandler, PushOp, RejectedOpError, SyncContext } from '../sync/sync.types.js';
import { CreatePromotionDto } from './dto/promotion.dto.js';
import { PromotionsService } from './promotions.service.js';

// El POS guarda y envía los días como texto: "1,2,3"
class PromotionPushDto extends CreatePromotionDto {
  @IsString() @MaxLength(64)
  id: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').map(Number) : value))
  declare weekdays?: number[] | null;
}

class PromotionSetActivePushDto {
  @IsString() @MaxLength(64)
  id: string;

  @IsBoolean()
  active: boolean;
}

class PromotionDeletePushDto {
  @IsString() @MaxLength(64)
  id: string;
}

@Injectable()
export class PromotionPushHandler implements PushHandler, OnModuleInit {
  readonly entity = 'promotion';

  constructor(
    private readonly promotions: PromotionsService,
    private readonly sync: SyncService,
  ) {}

  onModuleInit() {
    this.sync.register(this);
  }

  async handle(ctx: SyncContext, op: PushOp, session: ClientSession) {
    switch (op.action) {
      case 'create':
      case 'update': {
        const { id, ...fields } = await parsePayload(PromotionPushDto, op.payload);
        await asRejection(async () => {
          const existing = await this.promotions.findAnyById(id, session);
          if (!existing) return this.promotions.create(ctx.tenantId, fields, { id, session });
          this.assertUsable(existing, ctx);
          return this.promotions.update(ctx.tenantId, id, fields, session);
        });
        return;
      }
      case 'set-active': {
        const { id, active } = await parsePayload(PromotionSetActivePushDto, op.payload);
        await asRejection(async () => {
          const existing = await this.promotions.findAnyById(id, session);
          if (!existing) throw new ConflictException('Promotion unavailable');
          this.assertUsable(existing, ctx);
          return this.promotions.update(ctx.tenantId, id, { active }, session);
        });
        return;
      }
      case 'delete': {
        const { id } = await parsePayload(PromotionDeletePushDto, op.payload);
        const existing = await this.promotions.findAnyById(id, session);
        if (!existing || existing.deletedAt) return; // ya borrada: idempotente
        if (existing.tenantId !== ctx.tenantId) throw new RejectedOpError('Promotion unavailable');
        await asRejection(() => this.promotions.remove(ctx.tenantId, id, session));
        return;
      }
      default:
        throw new RejectedOpError(`Unknown action: ${op.action}`);
    }
  }

  // Existe en otro tenant, o el panel ya la borró: gana el servidor
  private assertUsable(existing: { tenantId: string; deletedAt: Date | null }, ctx: SyncContext) {
    if (existing.tenantId !== ctx.tenantId || existing.deletedAt) {
      throw new ConflictException('Promotion unavailable');
    }
  }
}
