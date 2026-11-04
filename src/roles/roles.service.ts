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
import { OWNER_ROLE_NAME, SYSTEM_ROLES } from './permissions.js';
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

  // Los roles base conservan su nombre, porque el seeder los identifica por él. Al propietario
  // nunca se le quitan permisos: así un negocio no puede quedarse sin quien lo administre.
  async update(tenantId: string, id: string, dto: UpdateRoleDto) {
    const current = await this.findOne(tenantId, id);
    if (current.isSystem && dto.name !== undefined && dto.name !== current.name) {
      throw new BadRequestException('System roles cannot be renamed');
    }
    if (current.isSystem && current.name === OWNER_ROLE_NAME && dto.permissions) {
      throw new BadRequestException('The owner role always has every permission');
    }
    if (dto.permissions) await this.perms.assertAllExist(dto.permissions);
    const { isSystem: _isSystem, ...changes } = dto;
    try {
      return await this.model
        .findOneAndUpdate({ _id: id, tenantId, deletedAt: null }, changes, {
          new: true,
        })
        .lean();
    } catch (e) {
      this.rethrowDuplicate(e);
    }
  }

  // La verificación de "rol en uso" la hace UsersService antes de llamar aquí (ver RolesController)
  async softDelete(tenantId: string, id: string) {
    const role = await this.findOne(tenantId, id);
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted');
    }
    await this.model.updateOne(
      { _id: id, tenantId },
      { deletedAt: new Date() },
    );
  }

  // Roles base de un negocio. Se puede repetir: solo crea los que falten y no cambia los que ya
  // existen, para respetar sus switches. La excepción es el propietario, que por regla siempre
  // tiene todos los permisos y por eso recibe los nuevos.
  async seedSystemRoles(tenantId: string) {
    const all = await this.perms.activeKeys();
    const roles = [];
    for (const { name, description, permissions } of SYSTEM_ROLES) {
      const keys = permissions === 'all' ? all : [...permissions];
      const existing = await this.model
        .findOne({ tenantId, name, deletedAt: null })
        .collation({ locale: 'es', strength: 2 })
        .lean();

      if (existing) {
        // Solo si falta alguno: escribir cambiaría updatedAt y las terminales lo descargarían de nuevo
        const missing = keys.filter((key) => !existing.permissions.includes(key));
        if (name === OWNER_ROLE_NAME && missing.length > 0) {
          await this.model.updateOne(
            { _id: existing._id },
            { $addToSet: { permissions: { $each: missing } } },
          );
        }
        roles.push(existing);
      } else {
        const doc = await this.model.create({
          name,
          description,
          permissions: keys,
          tenantId,
          isSystem: true,
        });
        roles.push(doc.toObject());
      }
    }
    return roles;
  }

  private rethrowDuplicate(e: any): never {
    if (e?.code === 11000)
      throw new ConflictException('A role with that name already exists');
    throw e;
  }
}
