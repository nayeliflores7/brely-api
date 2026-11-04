import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession } from 'mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema.js';
import { Product, ProductDocument } from '../products/schemas/product.schema.js';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto.js';
import { SyncService } from '../sync/sync.service.js';

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    @InjectModel(Category.name) private readonly model: Model<CategoryDocument>,
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    private readonly sync: SyncService,
  ) {}

  onModuleInit() {
    this.sync.registerPull('categories', {
      model: this.model,
      filter: (c) => ({ tenantId: c.tenantId }),
      map: (d) => ({
        id: d._id, name: d.name, active: d.active,
        updatedAt: d.updatedAt, deletedAt: d.deletedAt,
      }),
    });
  }

  async create(
    tenantId: string,
    dto: CreateCategoryDto,
    opts: { id?: string; session?: ClientSession } = {},
  ) {
    try {
      const [doc] = await this.model.create(
        [{ ...dto, tenantId, ...(opts.id ? { _id: opts.id } : {}) }],
        { session: opts.session },
      );
      return doc.toObject();
    } catch (e) {
      this.rethrowDuplicate(e);
    }
  }

  async findAll(tenantId: string) {
    const [categories, counts] = await Promise.all([
      this.model.find({ tenantId, deletedAt: null }).sort({ name: 1 }).lean(),
      this.products.aggregate<{ _id: string; n: number }>([
        { $match: { tenantId, deletedAt: null, categoryId: { $ne: null } } },
        { $group: { _id: '$categoryId', n: { $sum: 1 } } },
      ]),
    ]);
    const usage = new Map(counts.map((row) => [row._id, row.n]));
    return categories.map((c) => ({ ...c, productCount: usage.get(c._id) ?? 0 }));
  }

  // Para buscar productos por el nombre de su categoría
  async idsMatching(tenantId: string, name: RegExp): Promise<string[]> {
    return this.model.find({ tenantId, deletedAt: null, name }).distinct('_id');
  }

  async findOne(tenantId: string, id: string) {
    const c = await this.model.findOne({ _id: id, tenantId, deletedAt: null }).lean();
    if (!c) throw new NotFoundException(`Category ${id} not found`);
    return c;
  }

  // Para el push del POS: incluye borradas y de otros tenants
  findAnyById(id: string, session?: ClientSession) {
    return this.model.findById(id).session(session ?? null).lean();
  }

  async update(tenantId: string, id: string, dto: UpdateCategoryDto, session?: ClientSession) {
    try {
      const c = await this.model
        .findOneAndUpdate({ _id: id, tenantId, deletedAt: null }, dto, { new: true, session })
        .lean();
      if (!c) throw new NotFoundException(`Category ${id} not found`);
      return c;
    } catch (e) {
      this.rethrowDuplicate(e);
    }
  }

  async remove(tenantId: string, id: string, session?: ClientSession) {
    if (
      await this.products
        .exists({ tenantId, categoryId: id, deletedAt: null })
        .session(session ?? null)
    ) {
      throw new ConflictException('Category has products');
    }
    const c = await this.model.findOneAndUpdate(
      { _id: id, tenantId, deletedAt: null },
      { deletedAt: new Date(), active: false },
      { session },
    );
    if (!c) throw new NotFoundException(`Category ${id} not found`);
  }

  async existsActive(tenantId: string, id: string, session?: ClientSession) {
    return !!(await this.model
      .exists({ _id: id, tenantId, deletedAt: null, active: true })
      .session(session ?? null));
  }

  private rethrowDuplicate(e: any): never {
    if (e?.code === 11000) throw new ConflictException('A category with that name already exists');
    throw e;
  }
}