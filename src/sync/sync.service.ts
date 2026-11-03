import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { Tenant, TenantDocument } from '../tenants/schemas/tenant.schema.js';
import { Role, RoleDocument } from '../roles/schemas/role.schema.js';
import { User, UserDocument } from '../users/schemas/user.schema.js';
import {
  PermissionEntity,
  PermissionDocument,
} from '../permissions/schemas/permission.schema.js';
import {
  PullDef,
  PushHandler,
  PushOp,
  PushResult,
  RejectedOpError,
  SyncContext,
} from './sync.types.js';
import { SyncOp, SyncOpDocument } from '../src/sync/schemas/sync-op.schema.js';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly handlers = new Map<string, PushHandler>();
  private readonly pullable: Record<string, PullDef>;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(SyncOp.name) private readonly ops: Model<SyncOpDocument>,
    @InjectModel(Tenant.name) tenants: Model<TenantDocument>,
    @InjectModel(Role.name) roles: Model<RoleDocument>,
    @InjectModel(User.name) users: Model<UserDocument>,
    @InjectModel(PermissionEntity.name) permissions: Model<PermissionDocument>,
  ) {
    this.pullable = {
      tenant: {
        model: tenants,
        filter: (c) => ({ _id: c.tenantId }),
        map: (d) => ({
          id: d._id,
          name: d.name,
          legalName: d.legalName,
          taxId: d.taxId,
          phone: d.phone,
          address: d.address,
          logo: d.logo,
          updatedAt: d.updatedAt,
          deletedAt: d.deletedAt,
        }),
      },
      permissions: {
        model: permissions,
        filter: () => ({ scope: 'pos' }),
        map: (d) => ({
          id: d._id,
          name: d.name,
          description: d.description,
          active: d.active,
          updatedAt: d.updatedAt,
          deletedAt: d.deletedAt,
        }),
      },
      roles: {
        model: roles,
        filter: (c) => ({ tenantId: c.tenantId }),
        map: (d) => ({
          id: d._id,
          tenantId: d.tenantId,
          name: d.name,
          description: d.description,
          isSystem: d.isSystem,
          permissions: d.permissions,
          updatedAt: d.updatedAt,
          deletedAt: d.deletedAt,
        }),
      },
      users: {
        model: users,
        // Solo usuarios con PIN: el resto es exclusivo del web admin
        filter: (c) => ({ tenantId: c.tenantId, pinHash: { $type: 'string' } }),
        select: '+pinHash +pinSalt',
        map: (d) => ({
          id: d._id,
          tenantId: d.tenantId,
          fullName: d.fullName,
          roleId: d.roleId,
          pinHash: d.pinHash,
          pinSalt: d.pinSalt,
          active: d.active,
          updatedAt: d.updatedAt,
          deletedAt: d.deletedAt,
          // email y passwordHash: jamás
        }),
      },
    };
  }

  register(handler: PushHandler) {
    this.handlers.set(handler.entity, handler);
  }

  registerPull(entity: string, def: PullDef) {
    this.pullable[entity] = def;
  }

  // ───────────── PUSH ─────────────
  async push(ctx: SyncContext, ops: PushOp[]) {
    const results: PushResult[] = [];
    let blocked = false;

    for (const op of ops) {
      if (blocked) {
        results.push({ opId: op.opId, status: 'skipped' });
        continue;
      }
      try {
        // Aplicar la operación y registrarla es atómico: todo o nada
        const outcome = await this.connection.transaction(async (session) => {
          const done = await this.ops.findById(op.opId).session(session).lean();
          if (done) {
            if (done.tenantId !== ctx.tenantId)
              throw new RejectedOpError('opId already used');
            return 'ok' as const; // duplicado: ya aplicada
          }
          const handler = this.handlers.get(op.entity);
          if (!handler) return 'unsupported' as const;

          await handler.handle(ctx, op, session);
          await this.ops.create(
            [
              {
                _id: op.opId,
                tenantId: ctx.tenantId,
                terminalId: ctx.terminalId,
                entity: op.entity,
                action: op.action,
              },
            ],
            { session },
          );
          return 'ok' as const;
        });

        results.push(
          outcome === 'ok'
            ? { opId: op.opId, status: 'ok' }
            : {
                opId: op.opId,
                status: 'unsupported',
                error: `No handler for ${op.entity}`,
              },
        );
      } catch (e) {
        if (e instanceof RejectedOpError) {
          results.push({ opId: op.opId, status: 'rejected', error: e.message });
        } else {
          this.logger.error(
            `push ${op.opId} (${op.entity}.${op.action}) failed`,
            (e as Error).stack,
          );
          results.push({
            opId: op.opId,
            status: 'error',
            error: 'Internal error',
          });
          blocked = true; // respeta el orden: el POS reintenta desde aquí
        }
      }
    }
    return { results };
  }

  // ───────────── PULL ─────────────
  async pull(
    ctx: SyncContext,
    cursors: Record<string, string | null>,
    limit = 500,
  ) {
    const changes: Record<
      string,
      { items: unknown[]; cursor: string | null; hasMore: boolean }
    > = {};

    for (const [entity, cursor] of Object.entries(cursors)) {
      const def = this.pullable[entity];
      if (!def) throw new BadRequestException(`Unknown entity: ${entity}`);

      const conds: Record<string, unknown>[] = [def.filter(ctx)];
      if (cursor) {
        const [iso, id] = cursor.split('|');
        const t = new Date(iso);
        if (isNaN(+t) || !id)
          throw new BadRequestException(`Invalid cursor for ${entity}`);
        conds.push({
          $or: [{ updatedAt: { $gt: t } }, { updatedAt: t, _id: { $gt: id } }],
        });
      }

      let q = def.model
        .find({ $and: conds })
        .sort({ updatedAt: 1, _id: 1 })
        .limit(limit + 1);
      if (def.select) q = q.select(def.select);
      const rows: any[] = await q.lean();

      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      changes[entity] = {
        items: page.map(def.map),
        cursor: last
          ? `${new Date(last.updatedAt).toISOString()}|${last._id}`
          : cursor,
        hasMore,
      };
    }
    return { changes, serverTime: new Date().toISOString() };
  }
}
