import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import type { ClientSession } from 'mongoose';
import { CategoriesService } from './categories.service.js';
import { CreateCategoryDto } from './dto/category.dto.js';
import { SyncService } from '../sync/sync.service.js';
import { asRejection, parsePayload } from '../sync/payload.util.js';
import { PushHandler, PushOp, RejectedOpError, SyncContext } from '../sync/sync.types.js';

// Lo que llega en el payload del outbox (el id lo genera el POS)
class CategoryPushDto extends CreateCategoryDto {
  @IsString() @MaxLength(64)
  id: string;
}

class CategoryDeletePushDto {
  @IsString() @MaxLength(64)
  id: string;
}

@Injectable()
export class CategoryPushHandler implements PushHandler, OnModuleInit {
  readonly entity = 'category';

  constructor(
    private readonly categories: CategoriesService,
    private readonly sync: SyncService,
  ) {}

  onModuleInit() {
    this.sync.register(this);
  }

  async handle(ctx: SyncContext, op: PushOp, session: ClientSession) {
    if (op.action === 'delete') {
      const { id } = await parsePayload(CategoryDeletePushDto, op.payload);
      const existing = await this.categories.findAnyById(id, session);
      if (!existing || existing.deletedAt) return; // ya borrada: idempotente
      if (existing.tenantId !== ctx.tenantId) throw new RejectedOpError('Category unavailable');
      await asRejection(() => this.categories.remove(ctx.tenantId, id, session));
      return;
    }

    if (op.action !== 'create' && op.action !== 'update') {
      throw new RejectedOpError(`Unknown action: ${op.action}`);
    }

    const { id, ...fields } = await parsePayload(CategoryPushDto, op.payload);
    await asRejection(async () => {
      const existing = await this.categories.findAnyById(id, session);
      if (!existing) return this.categories.create(ctx.tenantId, fields, { id, session });
      // Existe en otro tenant, o el admin ya la borró: gana el servidor
      if (existing.tenantId !== ctx.tenantId || existing.deletedAt) {
        throw new ConflictException('Category unavailable');
      }
      return this.categories.update(ctx.tenantId, id, fields, session);
    });
  }
}
