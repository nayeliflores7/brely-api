import {
  BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import type { ClientSession } from 'mongoose';
import { Connection, Model } from 'mongoose';
import { Sale, SaleDocument } from './schemas/sale.schema.js';
import { Product, ProductDocument } from '../products/schemas/product.schema.js';
import { Terminal, TerminalDocument } from '../terminals/schemas/terminal.schema.js';
import { Counter } from '../common/counter.schema.js';
import {
  CreateSaleDto, ListSalesQuery, PushCancelDto, PushSaleDto, SalePaymentDto,
} from './dto/sale.dto.js';
import { StockService } from '../stock/stock.service.js';
import { CashService } from '../cash/cash.service.js';
import { SyncService } from '../sync/sync.service.js';
import { notMine } from '../sync/echo-filter.js';
import type { SyncContext } from '../sync/sync.types.js';
import type { AuthUser } from '../common/auth.types.js';
import { round2 } from '../common/money.js';

@Injectable()
export class SalesService implements OnModuleInit {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Sale.name) private readonly model: Model<SaleDocument>,
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    @InjectModel(Terminal.name) private readonly terminals: Model<TerminalDocument>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    private readonly stock: StockService,
    private readonly cash: CashService,
    private readonly sync: SyncService,
  ) {}

  onModuleInit() {
    this.sync.registerPull('sales', {
      model: this.model,
      filter: (c) => notMine(c, 'lastWriteOrigin'),
      map: (d) => ({
        id: d._id, terminalId: d.terminalId, origin: d.origin, folio: d.folio,
        sessionId: d.sessionId, createdAt: d.soldAt,
        subtotal: d.subtotal, tax: d.tax, total: d.total, discount: d.discount,
        paymentMethod: d.paymentMethod, received: d.received, change: d.change,
        status: d.status, cancelledAt: d.cancelledAt, cancelReason: d.cancelReason,
        userId: d.createdBy, userName: d.createdByName, cancelledBy: d.cancelledBy,
        items: d.items, payments: d.payments,
        updatedAt: d.updatedAt, deletedAt: d.deletedAt,
      }),
    });
  }

  // ───────────── Push del POS: se registran hechos, sin tocar stock ─────────────
  async createFromPos(ctx: SyncContext, dto: PushSaleDto, session: ClientSession) {
    if (await this.model.exists({ _id: dto.id }).session(session)) return; // ya existe

    if (Math.abs(dto.total - (dto.subtotal + dto.tax)) > 0.01) {
      throw new BadRequestException('total must equal subtotal + tax');
    }
    const payments = this.normalizePayments(dto.payments, dto.total);

    if (dto.sessionId && !(await this.cash.sessionExists(ctx.tenantId, dto.sessionId, session))) {
      throw new BadRequestException('sessionId does not exist');
    }
    if (await this.model.exists({ terminalId: ctx.terminalId, origin: 'pos', folio: dto.folio }).session(session)) {
      throw new ConflictException(`Folio ${dto.folio} already used on this terminal`);
    }

    await this.model.create(
      [{
        _id: dto.id, tenantId: ctx.tenantId, terminalId: ctx.terminalId,
        origin: 'pos', lastWriteOrigin: 'pos', folio: dto.folio,
        sessionId: dto.sessionId ?? null, soldAt: new Date(dto.createdAt),
        items: dto.items.map((i) => ({
          ...i, unitCost: i.unitCost ?? 0, discount: i.discount ?? 0,
          promotionId: i.promotionId ?? null, promotionName: i.promotionName ?? null,
        })),
        payments, paymentMethod: this.primary(payments),
        subtotal: dto.subtotal, tax: dto.tax, total: dto.total, discount: dto.discount ?? 0,
        received: dto.received, change: dto.change, status: 'completed',
        createdBy: dto.userId ?? null, createdByName: dto.userName ?? '',
      }],
      { session },
    );
  }

  async cancelFromPos(ctx: SyncContext, dto: PushCancelDto, session: ClientSession) {
    const s = await this.model.findOne({ _id: dto.id, tenantId: ctx.tenantId }).session(session).lean();
    if (!s) throw new NotFoundException(`Sale ${dto.id} not found`);
    if (s.status === 'cancelled') return; // idempotente
    await this.model.updateOne(
      { _id: dto.id },
      {
        $set: {
          status: 'cancelled', cancelledAt: new Date(dto.cancelledAt), cancelReason: dto.reason ?? '',
          cancelledBy: dto.userId ?? null, lastWriteOrigin: 'pos',
        },
      },
      { session },
    );
  }

  // ───────────── Admin: calcula todo en una transacción ─────────────
  createFromAdmin(tenantId: string, user: AuthUser, dto: CreateSaleDto) {
    return this.connection.transaction(async (session) => {
      const terminal = await this.terminals
        .findOne({ _id: dto.terminalId, tenantId, deletedAt: null, active: true })
        .session(session)
        .lean();
      if (!terminal || !terminal.activatedAt) throw new BadRequestException('terminalId is not an active terminal');

      const soldAt = dto.soldAt ? new Date(dto.soldAt) : new Date();
      if (soldAt.getTime() > Date.now() + 60_000) throw new BadRequestException('soldAt cannot be in the future');

      const ids = [...new Set(dto.items.map((i) => i.productId))];
      const found = await this.products.find({ _id: { $in: ids }, tenantId, deletedAt: null }).session(session).lean();
      const byId = new Map(found.map((p) => [p._id, p]));

      // IVA por línea sobre el neto (importe - descuento); precios sin IVA
      let subtotal = 0, tax = 0, discountTotal = 0;
      const items = dto.items.map((i) => {
        const p = byId.get(i.productId);
        if (!p) throw new BadRequestException(`Product ${i.productId} not found`);
        const unitPrice = i.unitPrice ?? p.price;
        const discount = round2(i.discount ?? 0);
        const net = round2(unitPrice * i.quantity - discount);
        if (net < 0) throw new BadRequestException(`Discount exceeds the line amount for "${p.name}"`);
        subtotal += net;
        tax += round2(net * p.taxRate);
        discountTotal += discount;
        return {
          productId: p._id, barcode: p.barcode, name: p.name, unit: p.unit, unitPrice,
          unitCost: p.cost, taxRate: p.taxRate, quantity: i.quantity, discount,
          promotionId: null, promotionName: null,
        };
      });
      subtotal = round2(subtotal);
      tax = round2(tax);
      const total = round2(subtotal + tax);

      const payments = this.normalizePayments(dto.payments, total);
      const received = round2(payments.reduce((a, p) => a + p.tendered, 0));

      // Serie de folio propia del admin en esa terminal
      const counter = await this.counters.findOneAndUpdate(
        { _id: `folio:${dto.terminalId}:admin` },
        { $inc: { seq: 1 } },
        { upsert: true, new: true, session },
      );
      const folio = counter.seq;

      const open = await this.cash.findOpenForTerminal(tenantId, dto.terminalId, session);
      const saleId = randomUUID();

      const [sale] = await this.model.create(
        [{
          _id: saleId, tenantId, terminalId: dto.terminalId,
          origin: 'admin', lastWriteOrigin: 'admin', folio,
          sessionId: open?._id ?? null, // sin sesión abierta no afecta ningún corte
          soldAt, items, payments, paymentMethod: this.primary(payments),
          subtotal, tax, total, discount: round2(discountTotal), received,
          change: round2(received - total), status: 'completed',
          createdBy: user.id, createdByName: user.fullName,
        }],
        { session },
      );

      for (const it of items) {
        if (!byId.get(it.productId)!.trackStock) continue;
        await this.stock.apply(
          {
            tenantId, terminalId: dto.terminalId, origin: 'admin', productId: it.productId,
            type: 'sale', quantity: -it.quantity, reason: `VENTA A-${String(folio).padStart(6, '0')}`,
            referenceId: saleId, createdBy: user.id, occurredAt: soldAt,
          },
          session,
        );
      }
      return sale.toObject();
    });
  }

  cancelFromAdmin(tenantId: string, user: AuthUser, id: string, reason: string) {
    return this.connection.transaction(async (session) => {
      const s = await this.model.findOne({ _id: id, tenantId }).session(session).lean();
      if (!s) throw new NotFoundException(`Sale ${id} not found`);
      if (s.status === 'cancelled') throw new ConflictException('Sale already cancelled');

      const now = new Date();
      const updated = await this.model
        .findOneAndUpdate(
          { _id: id },
          {
            $set: {
              status: 'cancelled', cancelledAt: now, cancelReason: reason,
              cancelledBy: user.id, lastWriteOrigin: 'admin',
            },
          },
          { new: true, session },
        )
        .lean();

      // Repone el stock de cada movimiento 'sale' de esta venta
      const sold = await this.stock['model']
        .find({ tenantId, referenceId: id, type: 'sale' })
        .session(session)
        .lean();
      for (const m of sold) {
        await this.stock.apply(
          {
            tenantId, terminalId: s.terminalId, origin: 'admin', productId: m.productId,
            type: 'sale_cancel', quantity: -m.quantity, reason: `CANCELACIÓN: ${reason}`,
            referenceId: id, createdBy: user.id, occurredAt: now,
          },
          session,
        );
      }
      return updated;
    });
  }

  async list(tenantId: string, q: ListSalesQuery) {
    const f: Record<string, any> = { tenantId };
    if (q.terminalId) f.terminalId = q.terminalId;
    if (q.status) f.status = q.status;
    if (q.origin) f.origin = q.origin;
    if (q.from || q.to) {
      f.soldAt = {};
      if (q.from) f.soldAt.$gte = new Date(q.from);
      if (q.to) f.soldAt.$lte = new Date(q.to);
    }
    const limit = q.limit ?? 50;
    const page = q.page ?? 1;
    const [items, total] = await Promise.all([
      this.model.find(f).sort({ soldAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.model.countDocuments(f),
    ]);
    return { items, total, page, limit };
  }

  async findOne(tenantId: string, id: string) {
    const s = await this.model.findOne({ _id: id, tenantId }).lean();
    if (!s) throw new NotFoundException(`Sale ${id} not found`);
    return s;
  }

  // ── helpers ──
  private normalizePayments(payments: SalePaymentDto[], total: number) {
    const seen = new Set<string>();
    const out = payments.map((p) => {
      if (seen.has(p.method)) throw new BadRequestException(`Duplicate payment method: ${p.method}`);
      seen.add(p.method);
      const tendered = p.tendered ?? p.amount;
      if (p.method !== 'cash' && Math.abs(tendered - p.amount) > 0.001) {
        throw new BadRequestException(`${p.method} payments cannot exceed the amount`);
      }
      if (tendered + 0.001 < p.amount) throw new BadRequestException('tendered is lower than amount');
      return { method: p.method, amount: round2(p.amount), tendered: round2(tendered), reference: p.reference ?? '' };
    });
    const paid = round2(out.reduce((a, p) => a + p.amount, 0));
    if (Math.abs(paid - total) > 0.01) {
      throw new BadRequestException(`Payments (${paid}) do not match the total (${total})`);
    }
    return out;
  }

  // Método principal: el de mayor monto
  private primary(payments: { method: string; amount: number }[]) {
    return [...payments].sort((a, b) => b.amount - a.amount)[0].method;
  }
}