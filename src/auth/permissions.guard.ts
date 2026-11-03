import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, SUPER_ADMIN_ONLY } from '../common/decorators.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user;
    if (!user) return true; // ruta pública

    const targets = [ctx.getHandler(), ctx.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_ONLY, targets) && !user.isSuperAdmin) {
      throw new ForbiddenException('Super admin only');
    }
    if (user.isSuperAdmin) return true; // el super admin salta los permisos de rol

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);
    if (required?.length && !required.every((p) => user.permissions.includes(p))) {
      throw new ForbiddenException('Missing permissions');
    }
    return true;
  }
}