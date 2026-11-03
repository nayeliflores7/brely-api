import {
  BadRequestException, ConflictException, Injectable, NotFoundException, OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PermissionEntity, PermissionDocument } from './schemas/permission.schema.js';
import { Role, RoleDocument } from '../roles/schemas/role.schema.js';
import { ADMIN_PERMISSIONS, POS_PERMISSIONS } from '../roles/permissions.js';
import { CreatePermissionDto } from './dto/create-permission.dto.js';
import { UpdatePermissionDto } from './dto/update-permission.dto.js';

@Injectable()
export class PermissionsService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(PermissionEntity.name) private readonly model: Model<PermissionDocument>,
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
  ) {}

  // Siembra los permisos del código si no existen. No pisa lo que edites después.
  async onApplicationBootstrap() {
    const rows = [
      ...ADMIN_PERMISSIONS.map((k) => ({ k, scope: 'admin' as const })),
      ...POS_PERMISSIONS.map((k) => ({ k, scope: 'pos' as const })),
    ];
    await this.model.bulkWrite(
      rows.map(({ k, scope }) => ({
        updateOne: {
          filter: { _id: k },
          update: { $setOnInsert: { _id: k, name: k, description: '', scope, active: true, deletedAt: null } },
          upsert: true,
        },
      })),
    );
  }

  findAll() {
    return this.model.find({ deletedAt: null }).sort({ scope: 1, _id: 1 }).lean();
  }

  async activeKeys(): Promise<string[]> {
    return this.model.find({ deletedAt: null, active: true }).distinct('_id');
  }

  async assertAllExist(keys: string[]) {
    const valid = new Set(await this.activeKeys());
    const unknown = keys.filter((k) => !valid.has(k));
    if (unknown.length) throw new BadRequestException(`Unknown permissions: ${unknown.join(', ')}`);
  }

  async create(dto: CreatePermissionDto) {
    if (await this.model.exists({ _id: dto.key })) {
      throw new ConflictException(`Permission ${dto.key} already exists`);
    }
    await this.model.create({
      _id: dto.key,
      name: dto.name,
      description: dto.description ?? '',
      scope: dto.scope,
    });
    if (dto.grantToOwners) {
      await this.roleModel.updateMany(
        { isSystem: true, deletedAt: null, permissions: 'admin.access' },
        { $addToSet: { permissions: dto.key } },
      );
    }
    return this.model.findById(dto.key).lean();
  }

  async update(key: string, dto: UpdatePermissionDto) {
    if (dto.active === false && (ADMIN_PERMISSIONS as readonly string[]).includes(key)) {
      throw new BadRequestException('Core admin permissions cannot be deactivated');
    }
    const p = await this.model
      .findOneAndUpdate({ _id: key, deletedAt: null }, dto, { new: true })
      .lean();
    if (!p) throw new NotFoundException(`Permission ${key} not found`);
    return p;
  }

  async remove(key: string) {
    if ((ADMIN_PERMISSIONS as readonly string[]).includes(key)) {
      throw new BadRequestException('Core admin permissions cannot be deleted');
    }
    const p = await this.model.findOneAndUpdate(
      { _id: key, deletedAt: null },
      { deletedAt: new Date(), active: false },
    );
    if (!p) throw new NotFoundException(`Permission ${key} not found`);
    // Lo retira de todos los roles (updatedAt cambia, así que el pull lo sincroniza)
    await this.roleModel.updateMany({ permissions: key }, { $pull: { permissions: key } });
  }
}