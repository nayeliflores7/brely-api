import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { RolesService } from '../roles/roles.service.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { UsersService } from '../users/users.service.js';
import { LoginDto } from './dto/login.dto.js';
import { CreateTenantWithOwnerDto } from './dto/create-tenant-with-owner.dto.js';
import { SuperAdminsService } from '../super-admins/super-admins.service.js';

@Injectable()
export class AuthService {
  // Hash falso para que el tiempo de respuesta sea igual si el email no existe
  private readonly dummyHash = argon2.hash(randomUUID());

  constructor(
    private readonly users: UsersService,
    private readonly superAdmins: SuperAdminsService,
    private readonly roles: RolesService,
    private readonly tenants: TenantsService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    // 1) ¿Es super admin?
    const sa = await this.superAdmins.findByEmailForLogin(dto.email);
    if (sa) {
      const ok = await argon2
        .verify(sa.passwordHash, dto.password)
        .catch(() => false);
      if (!ok) throw new UnauthorizedException('Invalid credentials');
      const accessToken = await this.jwt.signAsync({
        sub: sa._id,
        scope: 'platform',
      });
      return {
        accessToken,
        user: {
          id: sa._id,
          tenantId: null,
          fullName: sa.fullName,
          permissions: [],
          isSuperAdmin: true,
        },
      };
    }

    // 2) Usuario de tenant (tu código actual, sin cambios)
    const user = await this.users.findByEmailForLogin(dto.email);
    const ok = await argon2
      .verify(user?.passwordHash ?? (await this.dummyHash), dto.password)
      .catch(() => false);
    if (!user || !ok) throw new UnauthorizedException('Invalid credentials');
    if (!(await this.tenants.isActive(user.tenantId))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const role = await this.roles.findOneOrNull(user.tenantId, user.roleId);
    if (!role?.permissions.includes('admin.access')) {
      throw new ForbiddenException('This user cannot access the admin');
    }
    return this.issue(user._id, user.tenantId, user.fullName, role.permissions);
  }

  // Crea tenant + roles base + primer owner
  // Solo el super admin da de alta negocios. Crea el negocio, sus roles base y su propietario.
  async createTenant({ owner, ...fields }: CreateTenantWithOwnerDto) {
    if (
      (await this.users.emailExists(owner.email)) ||
      (await this.superAdmins.emailExists(owner.email))
    ) {
      throw new ConflictException('Email already in use');
    }

    const tenant = await this.tenants.create(fields);
    try {
      const [ownerRole] = await this.roles.seedSystemRoles(tenant._id);
      await this.users.create(tenant._id, { ...owner, roleId: ownerRole._id });
      return tenant.toObject();
    } catch (e) {
      await this.tenants.remove(tenant._id).catch(() => undefined); // compensación (sin transacción)
      throw e;
    }
  }

  private async issue(
    userId: string,
    tenantId: string,
    fullName: string,
    permissions: string[],
  ) {
    const accessToken = await this.jwt.signAsync({ sub: userId, tenantId });
    return {
      accessToken,
      user: { id: userId, tenantId, fullName, permissions },
    };
  }
}
