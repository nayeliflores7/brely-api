import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { Tenant, TenantDocument } from './schemas/tenant.schema.js';

@Injectable()
export class TenantsService {
  constructor(
    @InjectModel(Tenant.name) private readonly model: Model<TenantDocument>,
  ) {}

  create(dto: CreateTenantDto) {
    return this.model.create(dto);
  }

  findAll() {
    return this.model.find({ deletedAt: null }).sort({ name: 1 }).lean();
  }

  async findOne(id: string) {
    const tenant = await this.model
      .findOne({ _id: id, deletedAt: null })
      .lean();
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  async isActive(id: string) {
    return !!(await this.model.exists({ _id: id, deletedAt: null }));
  }

  async update(id: string, dto: UpdateTenantDto) {
    const tenant = await this.model
      .findOneAndUpdate({ _id: id, deletedAt: null }, dto, { new: true })
      .lean();
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  async remove(id: string) {
    const tenant = await this.model
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        { deletedAt: new Date() },
        { new: true },
      )
      .lean();
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
  }
}
