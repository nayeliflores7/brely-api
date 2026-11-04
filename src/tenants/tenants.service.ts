import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { DEFAULT_TENANT_SETTINGS } from './dto/tenant-settings.dto.js';
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
    // Incluye los desactivados para poder restaurarlos. Sin logo: pesa y el listado no lo usa.
    return this.model.find().select('-logo').sort({ name: 1 }).lean();
  }

  async findOne(id: string) {
    const tenant = await this.model
      .findOne({ _id: id, deletedAt: null })
      .lean();
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  // Lo que cualquiera del panel necesita al capturar, sin los datos del negocio
  async defaults(id: string) {
    const tenant = await this.findOne(id);
    return { defaultTaxRate: tenant.settings?.defaultTaxRate ?? DEFAULT_TENANT_SETTINGS.defaultTaxRate };
  }

  async isActive(id: string) {
    return !!(await this.model.exists({ _id: id, deletedAt: null }));
  }

  async update(id: string, { settings, ...fields }: UpdateTenantDto) {
    // Campo por campo: guardar un ajuste no debe borrar los demás
    const changes: Record<string, unknown> = { ...fields };
    for (const [key, value] of Object.entries(settings ?? {})) {
      if (value !== undefined) changes[`settings.${key}`] = value;
    }
    const tenant = await this.model
      .findOneAndUpdate({ _id: id, deletedAt: null }, changes, { new: true })
      .lean();
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  async restore(id: string) {
    const tenant = await this.model
      .findOneAndUpdate({ _id: id }, { deletedAt: null }, { new: true })
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
