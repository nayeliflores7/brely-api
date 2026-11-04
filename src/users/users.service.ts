import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as argon2 from 'argon2';
import { hashPin } from '../common/pin.util.js';
import { Role, RoleDocument } from '../roles/schemas/role.schema.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { User, UserDocument } from './schemas/user.schema.js';
import { SuperAdminsService } from '../super-admins/super-admins.service.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly model: Model<UserDocument>,
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
    private readonly superAdmins: SuperAdminsService,
  ) {}

  async create(tenantId: string, dto: CreateUserDto) {
    if (!dto.email && !dto.pin) {
      throw new BadRequestException(
        'Provide email+password (admin) and/or pin (POS)',
      );
    }
    if (dto.email && !dto.password)
      throw new BadRequestException('password is required with email');
    await this.assertRole(tenantId, dto.roleId);

    const data: Partial<User> = {
      tenantId,
      fullName: dto.fullName,
      roleId: dto.roleId,
      active: dto.active ?? true,
    };
    if (dto.email) {
      await this.assertEmailFree(dto.email);
      data.email = dto.email;
      data.passwordHash = await argon2.hash(dto.password!);
    }
    if (dto.pin) {
      const { hash, salt } = hashPin(dto.pin);
      data.pinHash = hash;
      data.pinSalt = salt;
    }

    try {
      const doc = await this.model.create(data);
      return this.findOne(tenantId, doc._id);
    } catch (e) {
      this.rethrowDuplicate(e);
    }
  }

  private async assertEmailFree(email: string) {
    if (await this.superAdmins.emailExists(email)) {
      throw new ConflictException('Email already in use');
    }
  }

  async findAll(tenantId: string) {
    const users = await this.model
      .find({ tenantId, deletedAt: null })
      .select('+pinHash')
      .sort({ fullName: 1 })
      .lean();
    return users.map((user) => this.toView(user));
  }

  async findOne(tenantId: string, id: string) {
    const user = await this.model
      .findOne({ _id: id, tenantId, deletedAt: null })
      .select('+pinHash')
      .lean();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return this.toView(user);
  }

  // Lo mínimo para asignar un rol: quien gestiona usuarios no siempre puede gestionar roles
  async roleOptions(tenantId: string) {
    const roles = await this.roleModel
      .find({ tenantId, deletedAt: null })
      .select('name permissions')
      .sort({ name: 1 })
      .lean();
    return roles.map((role) => ({
      _id: role._id,
      name: role.name,
      adminAccess: role.permissions.includes('admin.access'),
    }));
  }

  // Lista blanca de credenciales: se informa si hay PIN, pero nunca sale ningún hash
  private toView<T extends { pinHash?: string; pinSalt?: string; passwordHash?: string }>(
    user: T,
  ) {
    const { pinHash, pinSalt, passwordHash, ...rest } = user;
    return { ...rest, hasPin: !!pinHash };
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    await this.findOne(tenantId, id);
    const demoting = dto.active === false || dto.roleId !== undefined;
    if (demoting) await this.assertNotLastOwner(tenantId, id);
    if (dto.roleId) await this.assertRole(tenantId, dto.roleId);
    if (dto.email) await this.assertEmailFree(dto.email);

    const set: Record<string, unknown> = {};
    if (dto.fullName !== undefined) set.fullName = dto.fullName;
    if (dto.roleId !== undefined) set.roleId = dto.roleId;
    if (dto.active !== undefined) set.active = dto.active;
    if (dto.email !== undefined) set.email = dto.email.toLowerCase();
    if (dto.password) set.passwordHash = await argon2.hash(dto.password);
    if (dto.pin) {
      const { hash, salt } = hashPin(dto.pin);
      set.pinHash = hash;
      set.pinSalt = salt;
    }

    try {
      await this.model.updateOne(
        { _id: id, tenantId, deletedAt: null },
        { $set: set },
      );
    } catch (e) {
      this.rethrowDuplicate(e);
    }
    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.assertNotLastOwner(tenantId, id);
    await this.model.updateOne(
      { _id: id, tenantId },
      { deletedAt: new Date(), active: false },
    );
  }

  // Nombres para mostrar a partir de los ids guardados en ventas, cortes y movimientos.
  // Incluye usuarios dados de baja: el registro histórico conserva quién lo hizo.
  async displayNames(ids: (string | null | undefined)[]) {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    const users = await this.model.find({ _id: { $in: unique } }).select('fullName').lean();
    const names = new Map<string, string>(users.map((user) => [user._id, user.fullName]));
    for (const id of unique.filter((id) => !names.has(id))) {
      const admin = await this.superAdmins.findActiveById(id);
      if (admin) names.set(id, admin.fullName);
    }
    return names;
  }

  countByRole(tenantId: string, roleId: string) {
    return this.model.countDocuments({ tenantId, roleId, deletedAt: null });
  }

  // Lo usará Auth: devuelve el usuario con el hash de contraseña
  findByEmailForLogin(email: string) {
    return this.model
      .findOne({ email: email.toLowerCase(), deletedAt: null, active: true })
      .select('+passwordHash')
      .lean();
  }

  private async assertRole(tenantId: string, roleId: string) {
    const ok = await this.roleModel.exists({
      _id: roleId,
      tenantId,
      deletedAt: null,
    });
    if (!ok)
      throw new BadRequestException('roleId does not exist in this tenant');
  }

  private rethrowDuplicate(e: any): never {
    if (e?.code === 11000) throw new ConflictException('Email already in use');
    throw e;
  }

  findActiveById(id: string) {
    return this.model
      .findOne({ _id: id, active: true, deletedAt: null })
      .lean();
  }

  async emailExists(email: string) {
    return !!(await this.model.exists({
      email: email.toLowerCase(),
      deletedAt: null,
    }));
  }

  // Protege al último owner del tenant
  private async assertNotLastOwner(tenantId: string, userId: string) {
    const ownerRoleIds = await this.roleModel
      .find({
        tenantId,
        deletedAt: null,
        permissions: { $all: ['admin.access', 'users.manage'] },
      })
      .distinct('_id');

    const user = await this.model
      .findOne({ _id: userId, tenantId, deletedAt: null })
      .lean();
    if (!user || !ownerRoleIds.includes(user.roleId)) return;

    const others = await this.model.countDocuments({
      tenantId,
      _id: { $ne: userId },
      roleId: { $in: ownerRoleIds },
      active: true,
      deletedAt: null,
      email: { $type: 'string' },
    });
    if (!others)
      throw new ConflictException(
        'Cannot remove, deactivate or demote the last owner',
      );
  }
}
