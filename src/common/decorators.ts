import {
  BadRequestException, createParamDecorator, ExecutionContext, SetMetadata,
} from '@nestjs/common';
import type { AuthUser, TerminalContext } from './auth.types.js';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...p: string[]) => SetMetadata(PERMISSIONS_KEY, p);

export const SUPER_ADMIN_ONLY = 'superAdminOnly';
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN_ONLY, true);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

// Usuario normal: tenant del token. Super admin: tenant del header x-tenant-id.
export const TenantId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const user: AuthUser = ctx.switchToHttp().getRequest().user;
  if (!user.tenantId) {
    throw new BadRequestException('x-tenant-id header is required for super admin');
  }
  return user.tenantId;
});

export const CurrentTerminal = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TerminalContext => ctx.switchToHttp().getRequest().terminal,
);