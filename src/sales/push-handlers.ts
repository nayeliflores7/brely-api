import { Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientSession } from 'mongoose';
import { SalesService } from './sales.service.js';
import { CashService } from '../cash/cash.service.js';
import { StockService } from '../stock/stock.service.js';
import { PushCancelDto, PushSaleDto } from './dto/sale.dto.js';
import { CashMovementPushDto, CashSessionClosePushDto, CashSessionOpenPushDto } from '../cash/dto/cash.dto.js';
import { StockMovementPushDto } from '../stock/dto/stock.dto.js';
import { SyncService } from '../sync/sync.service.js';
import { asRejection, parsePayload } from '../sync/payload.util.js';
import { PushHandler, PushOp, RejectedOpError, SyncContext } from '../sync/sync.types.js';

@Injectable()
export class SalePushHandler implements PushHandler, OnModuleInit {
  readonly entity = 'sale';
  constructor(private readonly sales: SalesService, private readonly sync: SyncService) {}
  onModuleInit() { this.sync.register(this); }

  async handle(ctx: SyncContext, op: PushOp, session: ClientSession) {
    if (op.action === 'create') {
      const dto = await parsePayload(PushSaleDto, op.payload);
      return asRejection(() => this.sales.createFromPos(ctx, dto, session));
    }
    if (op.action === 'cancel') {
      const dto = await parsePayload(PushCancelDto, op.payload);
      return asRejection(() => this.sales.cancelFromPos(ctx, dto, session));
    }
    throw new RejectedOpError(`Unknown action: ${op.action}`);
  }
}

@Injectable()
export class CashSessionPushHandler implements PushHandler, OnModuleInit {
  readonly entity = 'cash_session';
  constructor(private readonly cash: CashService, private readonly sync: SyncService) {}
  onModuleInit() { this.sync.register(this); }

  async handle(ctx: SyncContext, op: PushOp, session: ClientSession) {
    if (op.action === 'open') {
      const dto = await parsePayload(CashSessionOpenPushDto, op.payload);
      return asRejection(() => this.cash.openFromPos(ctx, dto, new Date(op.createdAt), session));
    }
    if (op.action === 'close') {
      const dto = await parsePayload(CashSessionClosePushDto, op.payload);
      return asRejection(() => this.cash.closeFromPos(ctx, dto, session));
    }
    throw new RejectedOpError(`Unknown action: ${op.action}`);
  }
}

@Injectable()
export class CashMovementPushHandler implements PushHandler, OnModuleInit {
  readonly entity = 'cash_movement';
  constructor(private readonly cash: CashService, private readonly sync: SyncService) {}
  onModuleInit() { this.sync.register(this); }

  async handle(ctx: SyncContext, op: PushOp, session: ClientSession) {
    if (op.action !== 'create') throw new RejectedOpError(`Unknown action: ${op.action}`);
    const dto = await parsePayload(CashMovementPushDto, op.payload);
    return asRejection(() => this.cash.movementFromPos(ctx, dto, session));
  }
}

@Injectable()
export class StockMovementPushHandler implements PushHandler, OnModuleInit {
  readonly entity = 'stock_movement';
  constructor(private readonly stock: StockService, private readonly sync: SyncService) {}
  onModuleInit() { this.sync.register(this); }

  async handle(ctx: SyncContext, op: PushOp, session: ClientSession) {
    if (op.action !== 'create') throw new RejectedOpError(`Unknown action: ${op.action}`);
    const dto = await parsePayload(StockMovementPushDto, op.payload);
    await asRejection(() =>
      this.stock.apply(
        {
          id: dto.id, tenantId: ctx.tenantId, terminalId: ctx.terminalId, origin: 'pos',
          productId: dto.productId, type: dto.type, quantity: dto.quantity, reason: dto.reason,
          referenceId: dto.referenceId ?? null, createdBy: dto.userId ?? null,
          occurredAt: new Date(dto.createdAt),
        },
        session,
      ),
    );
  }
}