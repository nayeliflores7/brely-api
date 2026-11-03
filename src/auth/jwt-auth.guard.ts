import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC } from '../common/decorators.js';
import type { AuthUser } from '../common/auth.types.js';
import { UsersService } from '../users/users.service.js';
import { RolesService } from '../roles/roles.service.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { SuperAdminsService } from '../super-admins/super-admins.service.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly roles: RolesService,
    private readonly tenants: TenantsService,
    private readonly superAdmins: SuperAdminsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const [type, token] = (req.headers.authorization ?? '').split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException();

    let payload: {
      sub: string;
      tenantId?: string;
      scope?: 'platform' | 'terminal';
    };

    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }

    if (payload.scope === 'terminal') throw new UnauthorizedException();

    // ── Super admin ──
    if (payload.scope === 'platform') {
      const admin = await this.superAdmins.findActiveById(payload.sub);
      if (!admin) throw new UnauthorizedException();

      let tenantId: string | null = null;
      const header = req.headers['x-tenant-id'];
      if (typeof header === 'string' && header) {
        if (!(await this.tenants.isActive(header))) {
          throw new NotFoundException(`Tenant ${header} not found`);
        }
        tenantId = header;
      }

      const su: AuthUser = {
        id: admin._id,
        tenantId, // tenant "objetivo" validado, o null
        roleId: null,
        fullName: admin.fullName,
        permissions: [],
        isSuperAdmin: true,
      };
      req.user = su;
      return true;
    }

    // ── Usuario de tenant ──
    const user = await this.users.findActiveById(payload.sub);
    if (!user || user.tenantId !== payload.tenantId)
      throw new UnauthorizedException();
    if (!(await this.tenants.isActive(user.tenantId)))
      throw new UnauthorizedException();

    const role = await this.roles.findOneOrNull(user.tenantId, user.roleId);
    if (!role || !role.permissions.includes('admin.access'))
      throw new UnauthorizedException();

    const authUser: AuthUser = {
      id: user._id,
      tenantId: user.tenantId,
      roleId: user.roleId,
      fullName: user.fullName,
      permissions: role.permissions,
      isSuperAdmin: false,
    };
    req.user = authUser;
    return true;
  }
}
