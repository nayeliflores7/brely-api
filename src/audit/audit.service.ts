import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { ClientSession } from 'mongoose';
import mongoose, { Model } from 'mongoose';
import { ListAuditQuery, ListPlatformAuditQuery } from './dto/audit.dto.js';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema.js';

const SECRET_KEYS = /^(password|passwordHash|pin|pinHash|pinSalt|token|accessToken|activationCode|activationCodeHash|secret)$/i;
const OMITTED_KEYS = /^(logo)$/i;
const MAX_DETAIL_LENGTH = 20_000;

// Dónde buscar el nombre cuando no viene en la respuesta (un DELETE, o lo que llega del POS)
const NAME_SOURCES: Record<string, { collection: string; field: string }> = {
  products: { collection: 'products', field: 'name' },
  sales: { collection: 'sales', field: 'folio' },
  categories: { collection: 'categories', field: 'name' },
  promotions: { collection: 'promotions', field: 'name' },
  users: { collection: 'users', field: 'fullName' },
  roles: { collection: 'roles', field: 'name' },
  terminals: { collection: 'terminals', field: 'name' },
  tenants: { collection: 'tenants', field: 'name' },
};

export interface AuditEntry {
  id?: string;
  tenantId: string | null;
  source: 'admin' | 'pos';
  terminalId?: string | null;
  actorId: string | null;
  actorName: string;
  actorIsSuperAdmin?: boolean;
  action: string;
  entity: string;
  entityId?: string | null;
  entityName?: string;
  detail?: unknown;
  occurredAt?: Date;
}

/** Quita contraseñas, PIN y tokens, a cualquier profundidad, antes de guardar. */
export function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  const clean: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (OMITTED_KEYS.test(key)) continue;
    clean[key] = SECRET_KEYS.test(key) ? '[oculto]' : sanitize(item);
  }
  return clean;
}

function boundedDetail(detail: unknown): unknown {
  if (detail === undefined || detail === null) return null;
  const clean = sanitize(detail);
  return JSON.stringify(clean).length > MAX_DETAIL_LENGTH ? { truncated: true } : clean;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name) private readonly model: Model<AuditLogDocument>,
    @InjectConnection() private readonly connection: mongoose.Connection,
  ) {}

  /**
   * Registra sin interrumpir la operación: la acción ya ocurrió, y un fallo aquí no debe
   * convertirla en un error para quien la hizo. Por eso nunca lanza.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.model.create(this.toDocument(entry));
    } catch (error) {
      this.logger.error(`No se pudo auditar ${entry.action}`, (error as Error).stack);
    }
  }

  /** Para el push del POS: es parte de su transacción, y es idempotente por id. */
  async recordInSession(entry: AuditEntry & { id: string }, session: ClientSession): Promise<void> {
    if (await this.model.exists({ _id: entry.id }).session(session)) return;
    await this.model.create([this.toDocument(entry)], { session });
  }

  private toDocument(entry: AuditEntry) {
    return {
      ...(entry.id ? { _id: entry.id } : {}),
      tenantId: entry.tenantId,
      source: entry.source,
      terminalId: entry.terminalId ?? null,
      actorId: entry.actorId,
      actorName: entry.actorName,
      actorIsSuperAdmin: entry.actorIsSuperAdmin ?? false,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      entityName: entry.entityName ?? '',
      detail: boundedDetail(entry.detail),
      occurredAt: entry.occurredAt ?? new Date(),
    };
  }

  async lookupName(entity: string, id: string): Promise<string> {
    const source = NAME_SOURCES[entity];
    if (!source) return '';
    const doc = await this.connection
      .collection<{ _id: string }>(source.collection)
      .findOne({ _id: id }, { projection: { [source.field]: 1 } });
    const value = (doc as Record<string, unknown> | null)?.[source.field];
    if (value === undefined || value === null) return '';
    return entity === 'sales' ? `#${String(value).padStart(6, '0')}` : String(value);
  }

  listForTenant(tenantId: string, q: ListAuditQuery) {
    return this.list({ tenantId }, q);
  }

  listPlatform(q: ListPlatformAuditQuery) {
    return this.list(q.tenantId ? { tenantId: q.tenantId } : {}, q);
  }

  private async list(scope: Record<string, unknown>, q: ListAuditQuery) {
    const filter: Record<string, unknown> = { ...scope };
    if (q.source) filter.source = q.source;
    if (q.entity) filter.entity = q.entity;
    if (q.from || q.to) {
      filter.occurredAt = {
        ...(q.from ? { $gte: new Date(q.from) } : {}),
        ...(q.to ? { $lte: new Date(q.to) } : {}),
      };
    }
    if (q.q) {
      const rx = new RegExp(q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ actorName: rx }, { entityName: rx }, { action: rx }];
    }
    const limit = q.limit ?? 50;
    const page = q.page ?? 1;
    const [items, total] = await Promise.all([
      this.model.find(filter).sort({ occurredAt: -1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);
    return { items: await this.withTerminalNames(items), total, page, limit };
  }

  private async withTerminalNames<T extends { terminalId: string | null }>(items: T[]) {
    const ids = [...new Set(items.map((item) => item.terminalId).filter((id): id is string => !!id))];
    if (ids.length === 0) return items;
    const terminals = await this.connection
      .collection<{ _id: string; name: string }>('terminals')
      .find({ _id: { $in: ids } }, { projection: { name: 1 } })
      .toArray();
    const names = new Map(terminals.map((terminal) => [terminal._id, terminal.name]));
    return items.map((item) => ({
      ...item,
      terminalName: item.terminalId ? (names.get(item.terminalId) ?? '') : '',
    }));
  }
}
