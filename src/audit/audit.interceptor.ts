import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { AuthUser } from '../common/auth.types.js';
import { AuditService } from './audit.service.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** 'POST /api/v1/sales/:id/cancel' -> sales.cancel · 'DELETE /api/v1/products/:id' -> products.delete */
export function describeRoute(method: string, routePath: string) {
  const tokens = routePath.replace(/^\/?api\/v\d+\//, '').replace(/^\//, '').split('/').filter(Boolean);
  const statics = tokens.filter((token) => !token.startsWith(':'));
  const endsInVerb = tokens.length > 1 && tokens[tokens.length - 2].startsWith(':') && !tokens.at(-1)!.startsWith(':');
  const verb = endsInVerb
    ? ''
    : method === 'POST'
      ? '.create'
      : method === 'DELETE'
        ? '.delete'
        : '.update';
  return { entity: statics[0] ?? 'unknown', action: `${statics.join('.')}${verb}` };
}

/**
 * Registra toda escritura exitosa de quien usa el panel. Es global a propósito: una ruta nueva
 * queda auditada sin tener que acordarse de marcarla. Lo público (login, activación) y el POS
 * (token de terminal) no traen req.user: se registran por su cuenta.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = request.user;
    if (!user || !WRITE_METHODS.has(request.method)) return next.handle();

    return next.handle().pipe(
      tap((response) => void this.record(request, user, response)),
    );
  }

  private async record(
    request: { method: string; route?: { path?: string }; params?: Record<string, string>; body?: unknown },
    user: AuthUser,
    response: unknown,
  ): Promise<void> {
    const { entity, action } = describeRoute(request.method, String(request.route?.path ?? ''));
    const result = (response ?? {}) as { _id?: unknown; name?: unknown; fullName?: unknown; folio?: unknown };
    const params = request.params ?? {};
    const entityId = params.id ?? params.code ?? (typeof result._id === 'string' ? result._id : null);

    const named = result.name ?? result.fullName ?? (result.folio ? `#${String(result.folio).padStart(6, '0')}` : '');
    const entityName = String(
      named || (entityId && request.method === 'DELETE' ? await this.audit.lookupName(entity, entityId) : ''),
    );

    await this.audit.record({
      // En /tenants el negocio es el propio registro; el super admin no lo envía en el header
      tenantId: user.tenantId ?? (entity === 'tenants' ? entityId : null),
      source: 'admin',
      actorId: user.id,
      actorName: user.fullName,
      actorIsSuperAdmin: user.isSuperAdmin,
      action,
      entity,
      entityId,
      entityName,
      detail: request.body && Object.keys(request.body as object).length > 0 ? request.body : null,
    });
  }
}
