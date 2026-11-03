import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { PERMISSIONS } from './permissions.js';
import { Role, RoleDocument } from './schemas/role.schema.js';
import { PermissionsService } from '../permissions/permissions.service.js';

@Injectable()
export class RolesService {
  constructor(
    @InjectModel(Role.name) private readonly model: Model<RoleDocument>,
    private readonly perms: PermissionsService,
  ) {}

  async create(tenantId: string, dto: CreateRoleDto, asSuperAdmin = false) {
    await this.perms.assertAllExist(dto.permissions);
    try {
      const doc = await this.model.create({
        ...dto,
        tenantId,
        isSystem: asSuperAdmin ? (dto.isSystem ?? false) : false,
      });
      return doc.toObject();
    } catch (e) {
      this.rethrowDuplicate(e);
    }
  }

  findOneOrNull(tenantId: string, id: string) {
    return this.model.findOne({ _id: id, tenantId, deletedAt: null }).lean();
  }

  findAll(tenantId: string) {
    return this.model
      .find({ tenantId, deletedAt: null })
      .sort({ name: 1 })
      .lean();
  }

  async findOne(tenantId: string, id: string) {
    const role = await this.model
      .findOne({ _id: id, tenantId, deletedAt: null })
      .lean();
    if (!role) throw new NotFoundException(`Role ${id} not found`);
    return role;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateRoleDto,
    asSuperAdmin = false,
  ) {
    const current = await this.findOne(tenantId, id);
    if (current.isSystem && !asSuperAdmin) {
      throw new BadRequestException('System roles cannot be modified');
    }
    if (dto.permissions) await this.perms.assertAllExist(dto.permissions);
    const { isSystem, ...rest } = dto;
    const set =
      asSuperAdmin && isSystem !== undefined ? { ...rest, isSystem } : rest;
    try {
      return await this.model
        .findOneAndUpdate({ _id: id, tenantId, deletedAt: null }, set, {
          new: true,
        })
        .lean();
    } catch (e) {
      this.rethrowDuplicate(e);
    }
  }

  // La verificación de "rol en uso" la hace UsersService antes de llamar aquí (ver RolesController)
  async softDelete(tenantId: string, id: string, asSuperAdmin = false) {
    const role = await this.findOne(tenantId, id);
    if (role.isSystem && !asSuperAdmin) {
      throw new BadRequestException('System roles cannot be deleted');
    }
    await this.model.updateOne(
      { _id: id, tenantId },
      { deletedAt: new Date() },
    );
  }

  // Roles base para un tenant nuevo (se llamará desde el registro)
  async seedSystemRoles(tenantId: string) {
    const all = await this.perms.activeKeys();
    const defs = [
      { name: 'Propietario', description: 'Acceso total', permissions: all },
      {
        name: 'Cajero',
        description: 'Operación de caja',
        permissions: ['cash.movements', 'inventory.view'],
      },
    ];
    const created = [];
    for (const d of defs) {
      created.push(
        (
          await this.model.create({ ...d, tenantId, isSystem: true })
        ).toObject(),
      );
    }
    return created;
  }

  private rethrowDuplicate(e: any): never {
    if (e?.code === 11000)
      throw new ConflictException('A role with that name already exists');
    throw e;
  }
}
