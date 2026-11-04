import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import type { ClientSession } from 'mongoose';
import mongoose, { Model } from 'mongoose';
import { StockMovement, StockMovementDocument } from './schemas/stock-movement.schema.js';
import { Product, ProductDocument } from '../products/schemas/product.schema.js';
import { CreateStockMovementDto, ListStockQuery } from './dto/stock.dto.js';
import { SyncService } from '../sync/sync.service.js';
import { notMine } from '../sync/echo-filter.js';
import { round3 } from '../common/money.js';

export interface ApplyInput {
  id?: string;
  tenantId: string;
  terminalId: string;
  origin: 'pos' | 'admin';
  productId: string;
  type: string;
  quantity: number;
  reason?: string;
  referenceId?: string | null;
  createdBy?: string | null;
  occurredAt: Date;
}

@Injectable()
export class StockService implements OnModuleInit {
  constructor(
    @InjectConnection() private readonly connection: mongoose.Connection,
    @InjectModel(StockMovement.name) private readonly model: Model<StockMovementDocument>,
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    private readonly sync: SyncService,
  ) {}

  onModuleInit() {
    this.sync.registerPull('stock_movements', {
      model: this.model,
      filter: (c) => notMine(c),
      // Sin stockAfter: cada nodo calcula el suyo con su stock local
      map: (d) => ({
        id: d._id, terminalId: d.terminalId, origin: d.origin, productId: d.productId,
        type: d.type, quantity: d.quantity, reason: d.reason, referenceId: d.referenceId,
        userId: d.createdBy, createdAt: d.occurredAt,
        updatedAt: d.updatedAt, deletedAt: d.deletedAt,
      }),
    });
  }

  // Inserta el movimiento y aplica su cantidad al caché. Idempotente por id.
  async apply(m: ApplyInput, session: ClientSession) {
    const _id = m.id ?? randomUUID();
    if (await this.model.exists({ _id }).session(session)) return null;

    // timestamps:false → el producto no se re-sincroniza en cada venta
    const p = await this.products
      .findOneAndUpdate(
        { _id: m.productId, tenantId: m.tenantId },
        { $inc: { stock: m.quantity } },
        { new: true, session, timestamps: false },
      )
      .lean();
    if (!p) throw new BadRequestException(`Product ${m.productId} not found`);

    const [doc] = await this.model.create(
      [{
        _id, tenantId: m.tenantId, terminalId: m.terminalId, origin: m.origin,
        productId: m.productId, type: m.type, quantity: m.quantity,
        stockAfter: round3(p.stock), reason: m.reason ?? '',
        referenceId: m.referenceId ?? null, createdBy: m.createdBy ?? null,
        occurredAt: m.occurredAt, deletedAt: null,
      }],
      { session },
    );
    return doc.toObject();
  }

  async list(tenantId: string, q: ListStockQuery) {
    const f: Record<string, unknown> = { tenantId };
    if (q.productId) f.productId = q.productId;
    if (q.type) f.type = q.type;
    const limit = q.limit ?? 50;
    const page = q.page ?? 1;
    const [items, total] = await Promise.all([
      this.model.find(f).sort({ occurredAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.model.countDocuments(f),
    ]);
    return { items, total, page, limit };
  }

  async createManual(tenantId: string, userId: string, dto: CreateStockMovementDto) {
    const product = await this.products.findOne({ _id: dto.productId, tenantId, deletedAt: null }).lean();
    if (!product) throw new NotFoundException(`Product ${dto.productId} not found`);
    if (!product.trackStock) throw new BadRequestException('This product does not track stock');
    const needsReason =
      dto.type === 'waste' || (dto.type === 'adjustment' && dto.countedStock === undefined);
    if (needsReason && !dto.reason?.trim()) throw new BadRequestException('reason is required');

    let quantity = dto.quantity;
    if (dto.type === 'adjustment' && dto.countedStock !== undefined) {
      quantity = round3(dto.countedStock - product.stock);
    }
    if (!quantity) throw new BadRequestException('Provide quantity (or countedStock for adjustments); nothing to apply');

    if (['initial', 'purchase', 'return'].includes(dto.type) && quantity < 0) {
      throw new BadRequestException(`${dto.type} must be positive`);
    }
    if (dto.type === 'waste' && quantity > 0) throw new BadRequestException('waste must be negative');

    return this.connection.transaction((session) =>
      this.apply(
        {
          tenantId, terminalId: 'admin', origin: 'admin', productId: dto.productId,
          type: dto.type, quantity, reason: dto.reason, createdBy: userId, occurredAt: new Date(),
        },
        session,
      ),
    );
  }

  // Diferencias entre el caché (products.stock) y la suma de movimientos
  async reconcileReport(tenantId: string) {
    const sums = await this.model.aggregate([
      { $match: { tenantId } },
      { $group: { _id: '$productId', sum: { $sum: '$quantity' } } },
    ]);
    const map = new Map<string, number>(sums.map((s) => [s._id, s.sum]));
    const products = await this.products.find({ tenantId }).select('name barcode stock').lean();
    return products
      .map((p) => {
        const movementsSum = round3(map.get(p._id) ?? 0);
        return {
          productId: p._id, name: p.name, barcode: p.barcode,
          stock: p.stock, movementsSum, difference: round3(p.stock - movementsSum),
        };
      })
      .filter((r) => Math.abs(r.difference) > 0.0005);
  }

  // Repara el caché del servidor (stock := suma de movimientos). No crea movimientos.
  async reconcileRepair(tenantId: string) {
    const rows = await this.reconcileReport(tenantId);
    for (const r of rows) {
      await this.products.updateOne(
        { _id: r.productId, tenantId },
        { $set: { stock: r.movementsSum } },
        { timestamps: false },
      );
    }
    return { repaired: rows.length };
  }
}