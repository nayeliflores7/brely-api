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
      filter: (t) => ({ tenantId: t }),
      map: (d) => ({
        id: d._id, name: d.name, active: d.active,
        updatedAt: d.updatedAt, deletedAt: d.deletedAt,
      }),
    });
  }

  async create(tenantId: string, dto: CreateCategoryDto) {
    try {
      return (await this.model.create({ ...dto, tenantId })).toObject();
    } catch (e) {
      this.rethrowDuplicate(e);
    }
  }

  findAll(tenantId: string) {
    return this.model.find({ tenantId, deletedAt: null }).sort({ name: 1 }).lean();
  }

  async findOne(tenantId: string, id: string) {
    const c = await this.model.findOne({ _id: id, tenantId, deletedAt: null }).lean();
    if (!c) throw new NotFoundException(`Category ${id} not found`);
    return c;
  }

  async update(tenantId: string, id: string, dto: UpdateCategoryDto) {
    try {
      const c = await this.model
        .findOneAndUpdate({ _id: id, tenantId, deletedAt: null }, dto, { new: true })
        .lean();
      if (!c) throw new NotFoundException(`Category ${id} not found`);
      return c;
    } catch (e) {
      this.rethrowDuplicate(e);
    }
  }

  async remove(tenantId: string, id: string) {
    if (await this.products.exists({ tenantId, categoryId: id, deletedAt: null })) {
      throw new ConflictException('Category has products');
    }
    const c = await this.model.findOneAndUpdate(
      { _id: id, tenantId, deletedAt: null },
      { deletedAt: new Date(), active: false },
    );
    if (!c) throw new NotFoundException(`Category ${id} not found`);
  }

  async exists(tenantId: string, id: string, session?: ClientSession) {
    return !!(await this.model.exists({ _id: id, tenantId, deletedAt: null }).session(session ?? null));
  }

  private rethrowDuplicate(e: any): never {
    if (e?.code === 11000) throw new ConflictException('A category with that name already exists');
    throw e;
  }
}