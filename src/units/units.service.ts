import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
  OnApplicationBootstrap, OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession } from 'mongoose';
import { Model } from 'mongoose';
import { Unit, UnitDocument } from './schemas/unit.schema.js';
import { Product, ProductDocument } from '../products/schemas/product.schema.js';
import { CreateUnitDto, UpdateUnitDto } from './dto/unit.dto.js';
import { SyncService } from '../sync/sync.service.js';

const DEFAULTS = [
  { code: 'pza', name: 'PIEZA', abbreviation: 'pza', allowsDecimals: false },
  { code: 'kg', name: 'KILOGRAMO', abbreviation: 'kg', allowsDecimals: true },
  { code: 'g', name: 'GRAMO', abbreviation: 'g', allowsDecimals: true },
  { code: 'l', name: 'LITRO', abbreviation: 'L', allowsDecimals: true },
  { code: 'ml', name: 'MILILITRO', abbreviation: 'ml', allowsDecimals: true },
  { code: 'm', name: 'METRO', abbreviation: 'm', allowsDecimals: true },
  { code: 'caja', name: 'CAJA', abbreviation: 'caja', allowsDecimals: false },
];

@Injectable()
export class UnitsService implements OnModuleInit, OnApplicationBootstrap {
  constructor(
    @InjectModel(Unit.name) private readonly model: Model<UnitDocument>,
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    private readonly sync: SyncService,
  ) {}

  onModuleInit() {
    this.sync.registerPull('units', {
      model: this.model,
      filter: (t) => ({ $or: [{ tenantId: null }, { tenantId: t }] }),
      map: (d) => ({
        id: d.code, code: d.code, name: d.name, abbreviation: d.abbreviation,
        allowsDecimals: d.allowsDecimals, active: d.active,
        updatedAt: d.updatedAt, deletedAt: d.deletedAt,
      }),
    });
  }

  // Siembra las unidades globales sin pisar ediciones posteriores
  async onApplicationBootstrap() {
    await this.model.bulkWrite(
      DEFAULTS.map((u) => ({
        updateOne: {
          filter: { _id: `global:${u.code}` },
          update: { $setOnInsert: { _id: `global:${u.code}`, tenantId: null, active: true, deletedAt: null, ...u } },
          upsert: true,
        },
      })),
    );
  }

  findAll(tenantId: string) {
    return this.model
      .find({ $or: [{ tenantId: null }, { tenantId }], deletedAt: null })
      .sort({ name: 1 })
      .lean();
  }

  async create(tenantId: string, dto: CreateUnitDto) {
    const _id = `${tenantId}:${dto.code}`;
    if (await this.model.exists({ _id: `global:${dto.code}` })) {
      throw new ConflictException(`Unit code "${dto.code}" is reserved`);
    }
    const existing = await this.model.findById(_id).lean();
    if (existing && !existing.deletedAt) throw new ConflictException(`Unit "${dto.code}" already exists`);

    // Si estaba borrada, se reactiva
    return this.model
      .findOneAndUpdate(
        { _id },
        { $set: { ...dto, tenantId, deletedAt: null, active: dto.active ?? true } },
        { new: true, upsert: true },
      )
      .lean();
  }

  async update(tenantId: string, code: string, dto: UpdateUnitDto) {
    const u = await this.model
      .findOneAndUpdate({ _id: `${tenantId}:${code}`, deletedAt: null }, dto, { new: true })
      .lean();
    if (!u) {
      if (await this.model.exists({ _id: `global:${code}` })) {
        throw new BadRequestException('Global units cannot be modified');
      }
      throw new NotFoundException(`Unit ${code} not found`);
    }
    return u;
  }

  async remove(tenantId: string, code: string) {
    if (await this.products.exists({ tenantId, unit: code, deletedAt: null })) {
      throw new ConflictException('Unit is used by products');
    }
    const u = await this.model.findOneAndUpdate(
      { _id: `${tenantId}:${code}`, deletedAt: null },
      { deletedAt: new Date(), active: false },
    );
    if (!u) throw new NotFoundException(`Unit ${code} not found (global units cannot be deleted)`);
  }

  async exists(tenantId: string, code: string, session?: ClientSession) {
    return !!(await this.model
      .exists({ code, $or: [{ tenantId: null }, { tenantId }], deletedAt: null, active: true })
      .session(session ?? null));
  }
}