import { BadRequestException, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PermissionEntity, PermissionDocument } from './schemas/permission.schema.js';
import { PERMISSION_CATALOG } from '../roles/permissions.js';

@Injectable()
export class PermissionsService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(PermissionEntity.name) private readonly model: Model<PermissionDocument>,
  ) {}

  async onApplicationBootstrap() {
    await this.seedCatalog();
  }

  // Solo crea los permisos que falten: lo que ya está en la BD no se toca
  async seedCatalog() {
    await this.model.bulkWrite(
      PERMISSION_CATALOG.map(({ key, name, description, scope }) => ({
        updateOne: {
          filter: { _id: key },
          update: { $setOnInsert: { name, description, scope, active: true, deletedAt: null } },
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
}
