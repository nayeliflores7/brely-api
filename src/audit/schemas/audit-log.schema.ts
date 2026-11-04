import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { HydratedDocument } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

// Solo se agregan registros: no hay forma de editarlos ni borrarlos desde la API
@Schema({ collection: 'audit_logs', timestamps: false })
export class AuditLog {
  @Prop({ type: String, default: () => randomUUID() })
  _id: string;

  // null: acciones de plataforma que no pertenecen a un negocio (p. ej. login del super admin)
  @Prop({ type: String, default: null })
  tenantId: string | null;

  @Prop({ type: String, required: true, enum: ['admin', 'pos'] })
  source: 'admin' | 'pos';

  @Prop({ type: String, default: null })
  terminalId: string | null;

  @Prop({ type: String, default: null })
  actorId: string | null;

  // Se guarda el nombre de ese momento: el registro no cambia si después renombran al usuario
  @Prop({ default: '' })
  actorName: string;

  @Prop({ default: false })
  actorIsSuperAdmin: boolean;

  @Prop({ required: true })
  action: string;

  @Prop({ required: true })
  entity: string;

  @Prop({ type: String, default: null })
  entityId: string | null;

  @Prop({ default: '' })
  entityName: string;

  @Prop({ type: Object, default: null })
  detail: unknown;

  @Prop({ type: Date, required: true })
  occurredAt: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ tenantId: 1, occurredAt: -1 });
AuditLogSchema.index({ occurredAt: -1 });
AuditLogSchema.index({ entity: 1, entityId: 1 });
