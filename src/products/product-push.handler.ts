import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientSession } from 'mongoose';
import { ProductsService } from './products.service.js';
import { ProductDeletePushDto, ProductPushDto } from './dto/product.dto.js';
import { SyncService } from '../sync/sync.service.js';
import { asRejection, parsePayload } from '../sync/payload.util.js';
import { PushHandler, PushOp, RejectedOpError, SyncContext } from '../sync/sync.types.js';

@Injectable()
export class ProductPushHandler implements PushHandler, OnModuleInit {
  readonly entity = 'product';

  constructor(
    private readonly products: ProductsService,
    private readonly sync: SyncService,
  ) {}

  onModuleInit() {
    this.sync.register(this);
  }

  async handle(ctx: SyncContext, op: PushOp, session: ClientSession) {
    if (op.action === 'delete') {
      const p = await parsePayload(ProductDeletePushDto, op.payload);
      const existing = await this.products.findAnyById(p.id, session);
      if (!existing || existing.deletedAt) return; // ya borrado: idempotente
      if (existing.tenantId !== ctx.tenantId) throw new RejectedOpError('Product unavailable');
      return this.products.remove(ctx.tenantId, p.id, { session, userId: p.userId });
    }

    if (op.action !== 'create' && op.action !== 'update') {
      throw new RejectedOpError(`Unknown action: ${op.action}`);
    }

    const { id, userId, ...fields } = await parsePayload(ProductPushDto, op.payload);
    await asRejection(async () => {
      const existing = await this.products.findAnyById(id, session);
      if (!existing) return this.products.create(ctx.tenantId, fields, { id, userId, session });
      // Existe en otro tenant, o el admin ya lo borró: gana el servidor
      if (existing.tenantId !== ctx.tenantId || existing.deletedAt) {
        throw new ConflictException('Product unavailable');
      }
      return this.products.update(ctx.tenantId, id, fields, { userId, session });
    });
  }
}