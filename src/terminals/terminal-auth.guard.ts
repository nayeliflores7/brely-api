import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TerminalsService } from './terminals.service.js';
import { TenantsService } from '../tenants/tenants.service.js';
import type { TerminalContext } from '../common/auth.types.js';

@Injectable()
export class TerminalAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly terminals: TerminalsService,
    private readonly tenants: TenantsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const [type, token] = (req.headers.authorization ?? '').split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException();

    let p: { sub: string; tenantId: string; scope?: string; tv?: number };
    try {
      p = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }
    if (p.scope !== 'terminal') throw new UnauthorizedException();

    const t = await this.terminals.findForAuth(p.sub);
    if (
      !t || !t.active || !t.activatedAt ||
      t.tenantId !== p.tenantId || t.tokenVersion !== p.tv
    ) {
      throw new UnauthorizedException();
    }
    if (!(await this.tenants.isActive(t.tenantId))) throw new UnauthorizedException();

    const terminal: TerminalContext = { id: t._id, tenantId: t.tenantId };
    req.terminal = terminal;
    this.terminals.touch(t);
    return true;
  }
}