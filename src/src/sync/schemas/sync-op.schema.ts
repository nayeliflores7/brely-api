import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SyncOpDocument = HydratedDocument<SyncOp>;

// Registro de operaciones ya aplicadas: _id = opId del outbox del POS
@Schema({ collection: 'sync_ops', timestamps: { createdAt: true, updatedAt: false } })
export class SyncOp {
  @Prop({ type: String })
  _id: string;

  @Prop({ type: String, required: true })
  tenantId: string;

  @Prop({ type: String, required: true })
  terminalId: string;

  @Prop({ type: String, required: true })
  entity: string;

  @Prop({ type: String, required: true })
  action: string;

  createdAt: Date;
}

export const SyncOpSchema = SchemaFactory.createForClass(SyncOp);
SyncOpSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // 90 días