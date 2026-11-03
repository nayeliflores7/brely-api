import {
  BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession } from 'mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from './schemas/product.schema.js';
import { PriceHistory, PriceHistoryDocument } from './schemas/price-history.schema.js';
import { CreateProductDto, ListProductsQuery, UpdateProductDto } from './dto/product.dto.js';
import { CategoriesService } from '../categories/categories.service.js';
import { UnitsService } from '../units/units.service.js';
import { SyncService } from '../sync/sync.service.js';

export interface WriteOpts {
  id?: string;               // solo create desde el POS
  userId?: string | null;
  session?: ClientSession;
}

@Injectable()
export class ProductsService implements OnModuleInit {
  constructor(
    @InjectModel(Product.name) private readonly model: Model<ProductDocument>,
    @InjectModel(PriceHistory.name) private readonly history: Model<PriceHistoryDocument>,
    private readonly categories: CategoriesService,
    private readonly units: UnitsService,
    private readonly sync: SyncService,
  ) {}

  onModuleInit() {
    this.sync.registerPull('products', {
      model: this.model,
      filter: (t) => ({ tenantId: t }),
      // Sin "stock": el POS lleva el suyo y nunca se sobrescribe desde aquí
      map: (d) => ({
        id: d._id, barcode: d.barcode, name: d.name, description: d.description,
        categoryId: d.categoryId, unit: d.unit, price: d.price, cost: d.cost,
        taxRate: d.taxRate, trackStock: d.trackStock, minStock: d.minStock,
        active: d.active, updatedAt: d.updatedAt, deletedAt: d.deletedAt,
      }),
    });
  }

  async findAll(tenantId: string, q: ListProductsQuery) {
    const filter: Record<string, unknown> = { tenantId, deletedAt: null };
    if (q.categoryId) filter.categoryId = q.categoryId;
    if (q.q) {
      const rx = new RegExp(q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { barcode: rx }];
    }
    const limit = q.limit ?? 50;
    const page = q.page ?? 1;
    const [items, total] = await Promise.all([
      this.model.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  async findOne(tenantId: string, id: string) {
    const p = await this.model.findOne({ _id: id, tenantId, deletedAt: null }).lean();
    if (!p) throw new NotFoundException(`Product ${id} not found`);
    return p;
  }

  findAnyById(id: string, session?: ClientSession) {
    return this.model.findById(id).session(session ?? null).lean();
  }

  priceHistory(tenantId: string, productId: string) {
    return this.history.find({ tenantId, productId }).sort({ changedAt: -1 }).limit(200).lean();
  }

  async create(tenantId: string, dto: CreateProductDto, opts: WriteOpts = {}) {
    const { session } = opts;
    await this.assertRefs(tenantId, dto, session);
    try {
      const [doc] = await this.model.create(
        [{ ...(opts.id ? { _id: opts.id } : {}), ...dto, tenantId, stock: 0 }],
        { session },
      );
      await this.history.create(
        [{
          tenantId, productId: doc._id, price: dto.price, cost: dto.cost,
          changedAt: new Date(), changedBy: opts.userId ?? null,
        }],
        { session },
      );
      return doc.toObject();
    } catch (e) {
      this.rethrowDuplicate(e);
    }
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto, opts: WriteOpts = {}) {
    const { session } = opts;
    const current = await this.model
      .findOne({ _id: id, tenantId, deletedAt: null })
      .session(session ?? null)
      .lean();
    if (!current) throw new NotFoundException(`Product ${id} not found`);
    await this.assertRefs(tenantId, dto, session);

    try {
      const updated = await this.model
        .findOneAndUpdate({ _id: id, tenantId }, { $set: dto }, { new: true, session })
        .lean();

      const priceChanged = updated!.price !== current.price || updated!.cost !== current.cost;
      if (priceChanged) {
        await this.history.create(
          [{
            tenantId, productId: id, price: updated!.price, cost: updated!.cost,
            changedAt: new Date(), changedBy: opts.userId ?? null,
          }],
          { session },
        );
      }
      return updated;
    } catch (e) {
      this.rethrowDuplicate(e);
    }
  }

  async remove(tenantId: string, id: string, opts: WriteOpts = {}) {
    const p = await this.model.findOneAndUpdate(
      { _id: id, tenantId, deletedAt: null },
      { deletedAt: new Date(), active: false },
      { session: opts.session },
    );
    if (!p) throw new NotFoundException(`Product ${id} not found`);
  }

  private async assertRefs(
    tenantId: string,
    dto: { categoryId?: string | null; unit?: string },
    session?: ClientSession,
  ) {
    if (dto.categoryId && !(await this.categories.exists(tenantId, dto.categoryId, session))) {
      throw new BadRequestException('categoryId does not exist in this tenant');
    }
    if (dto.unit && !(await this.units.exists(tenantId, dto.unit, session))) {
      throw new BadRequestException(`unit "${dto.unit}" does not exist`);
    }
  }

  private rethrowDuplicate(e: any): never {
    if (e?.code === 11000) {
      throw new ConflictException(
        e.keyPattern?.barcode ? 'A product with that barcode already exists' : 'Duplicate product',
      );
    }
    throw e;
  }
}