import {
  BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import type { ClientSession } from 'mongoose';
import mongoose, { Model } from 'mongoose';
import { CashSession, CashSessionDocument } from './schemas/cash-session.schema.js';
import { CashMovement, CashMovementDocument } from './schemas/cash-movement.schema.js';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema.js';
import {
  CashMovementPushDto, CashSessionClosePushDto, CashSessionOpenPushDto,
  CloseSessionDto, CreateCashMovementDto, ListSessionsQuery,
} from './dto/cash.dto.js';
import { SyncService } from '../sync/sync.service.js';
import { notMine } from '../sync/echo-filter.js';
import type { SyncContext } from '../sync/sync.types.js';
import { round2 } from '../common/money.js';

@Injectable()
export class CashService implements OnModuleInit {
  constructor(
    @InjectConnection() private readonly connection: mongoose.Connection,
    @InjectModel(CashSession.name) private readonly sessions: Model<CashSessionDocument>,
    @InjectModel(CashMovement.name) private readonly movements: Model<CashMovementDocument>,
    @InjectModel(Sale.name) private readonly sales: Model<SaleDocument>,
    private readonly sync: SyncService,
  ) {}

  onModuleInit() {
    this.sync.registerPull('cash_sessions', {
      model: this.sessions,
      filter: (c) => notMine(c, 'lastWriteOrigin'),
      map: (d) => ({
        id: d._id, terminalId: d.terminalId, number: d.number, status: d.status, origin: d.origin,
        openedAt: d.openedAt, openingFloat: d.openingFloat, openedBy: d.openedBy,
        closedAt: d.closedAt, countedCash: d.countedCash, difference: d.difference,
        notes: d.notes, summary: d.summary, closedBy: d.closedBy,
        updatedAt: d.updatedAt, deletedAt: d.deletedAt,
      }),
    });
    this.sync.registerPull('cash_movements', {
      model: this.movements,
      filter: (c) => notMine(c),
      map: (d) => ({
        id: d._id, terminalId: d.terminalId, sessionId: d.sessionId, origin: d.origin,
        type: d.type, amount: d.amount, reason: d.reason, userId: d.createdBy,
        createdAt: d.occurredAt, updatedAt: d.updatedAt, deletedAt: d.deletedAt,
      }),
    });
  }

  // ───────── Usado por Sales ─────────
  findOpenForTerminal(tenantId: string, terminalId: string, session?: ClientSession) {
    return this.sessions.findOne({ tenantId, terminalId, status: 'open' }).session(session ?? null).lean();
  }

  async sessionExists(tenantId: string, id: string, session?: ClientSession) {
    return !!(await this.sessions.exists({ _id: id, tenantId }).session(session ?? null));
  }

  // ───────── Push del POS ─────────
  async openFromPos(ctx: SyncContext, dto: CashSessionOpenPushDto, openedAt: Date, session: ClientSession) {
    if (await this.sessions.exists({ _id: dto.id }).session(session)) return;
    if (await this.sessions.exists({ terminalId: ctx.terminalId, status: 'open' }).session(session)) {
      throw new ConflictException('Terminal already has an open session');
    }
    if (await this.sessions.exists({ terminalId: ctx.terminalId, number: dto.number }).session(session)) {
      throw new ConflictException(`Session number ${dto.number} already used on this terminal`);
    }
    await this.sessions.create(
      [{
        _id: dto.id, tenantId: ctx.tenantId, terminalId: ctx.terminalId, number: dto.number,
        status: 'open', origin: 'pos', lastWriteOrigin: 'pos', openedAt,
        openingFloat: dto.openingFloat, openedBy: dto.userId ?? null,
      }],
      { session },
    );
  }

  async closeFromPos(ctx: SyncContext, dto: CashSessionClosePushDto, session: ClientSession) {
    const s = await this.sessions
      .findOne({ _id: dto.id, tenantId: ctx.tenantId, terminalId: ctx.terminalId })
      .session(session)
      .lean();
    if (!s) throw new NotFoundException(`Session ${dto.id} not found`);
    // Solo gana el primer cierre
    if (s.status === 'closed') throw new ConflictException('Session already closed');

    await this.sessions.updateOne(
      { _id: dto.id },
      {
        $set: {
          status: 'closed', closedAt: new Date(dto.closedAt), countedCash: dto.countedCash,
          difference: dto.difference, notes: dto.notes ?? '', summary: dto.summary,
          closedBy: dto.userId ?? null, lastWriteOrigin: 'pos',
        },
      },
      { session },
    );
  }

  async movementFromPos(ctx: SyncContext, dto: CashMovementPushDto, session: ClientSession) {
    if (await this.movements.exists({ _id: dto.id }).session(session)) return;
    // Es un hecho ya ocurrido en caja: se acepta aunque la sesión ya esté cerrada
    const s = await this.sessions
      .findOne({ _id: dto.sessionId, tenantId: ctx.tenantId, terminalId: ctx.terminalId })
      .session(session)
      .lean();
    if (!s) throw new BadRequestException('sessionId does not exist');
    await this.movements.create(
      [{
        _id: dto.id, tenantId: ctx.tenantId, terminalId: ctx.terminalId, sessionId: dto.sessionId,
        origin: 'pos', type: dto.type, amount: round2(dto.amount), reason: dto.reason,
        createdBy: dto.userId ?? null, occurredAt: new Date(dto.createdAt),
      }],
      { session },
    );
  }

  // ───────── Admin ─────────
  listSessions(tenantId: string, q: ListSessionsQuery) {
    const f: Record<string, unknown> = { tenantId };
    if (q.terminalId) f.terminalId = q.terminalId;
    if (q.status) f.status = q.status;
    return this.sessions.find(f).sort({ openedAt: -1 }).limit(q.limit ?? 50).lean();
  }

  async detail(tenantId: string, id: string) {
    const session = await this.sessions.findOne({ _id: id, tenantId }).lean();
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    const [summary, movements] = await Promise.all([
      this.summary(tenantId, id),
      this.movements.find({ tenantId, sessionId: id }).sort({ occurredAt: 1 }).lean(),
    ]);
    return { session, summary, movements };
  }

  // Calcula el corte con ventas completadas y movimientos de efectivo
  async summary(tenantId: string, sessionId: string, dbSession?: ClientSession) {
    const s = await this.sessions.findOne({ _id: sessionId, tenantId }).session(dbSession ?? null).lean();
    if (!s) throw new NotFoundException(`Session ${sessionId} not found`);
    const sales = await this.sales
      .find({ tenantId, sessionId }).select('status total payments').session(dbSession ?? null).lean();
    const moves = await this.movements
      .find({ tenantId, sessionId, deletedAt: null }).session(dbSession ?? null).lean();

    let salesCount = 0, cancelledCount = 0, totalSales = 0, cashSales = 0, cardSales = 0, transferSales = 0;
    for (const x of sales) {
      if (x.status === 'cancelled') { cancelledCount++; continue; }
      salesCount++;
      totalSales += x.total;
      for (const p of x.payments) {
        if (p.method === 'cash') cashSales += p.amount;
        else if (p.method === 'card') cardSales += p.amount;
        else transferSales += p.amount;
      }
    }
    const cashIn = moves.filter((m) => m.type === 'in').reduce((a, m) => a + m.amount, 0);
    const cashOut = moves.filter((m) => m.type === 'out').reduce((a, m) => a + m.amount, 0);

    return {
      salesCount, cancelledCount,
      totalSales: round2(totalSales), cashSales: round2(cashSales),
      cardSales: round2(cardSales), transferSales: round2(transferSales),
      cashIn: round2(cashIn), cashOut: round2(cashOut),
      expectedCash: round2(s.openingFloat + cashSales + cashIn - cashOut),
    };
  }

  closeFromAdmin(tenantId: string, userId: string, id: string, dto: CloseSessionDto) {
    return this.connection.transaction(async (session) => {
      const open = await this.sessions.findOne({ _id: id, tenantId, status: 'open' }).session(session).lean();
      if (!open) throw new NotFoundException('Open session not found');
      const summary = await this.summary(tenantId, id, session);
      return this.sessions
        .findOneAndUpdate(
          { _id: id },
          {
            $set: {
              status: 'closed', closedAt: new Date(), countedCash: dto.countedCash,
              difference: round2(dto.countedCash - summary.expectedCash),
              notes: dto.notes ?? '', summary, closedBy: userId, lastWriteOrigin: 'admin',
            },
          },
          { new: true, session },
        )
        .lean();
    });
  }

  async addMovementFromAdmin(tenantId: string, userId: string, dto: CreateCashMovementDto) {
    const s = await this.sessions.findOne({ _id: dto.sessionId, tenantId, status: 'open' }).lean();
    if (!s) throw new NotFoundException('Open session not found');
    const doc = await this.movements.create({
      _id: randomUUID(), tenantId, terminalId: s.terminalId, sessionId: s._id,
      origin: 'admin', type: dto.type, amount: round2(dto.amount), reason: dto.reason,
      createdBy: userId, occurredAt: new Date(),
    });
    return doc.toObject();
  }
}