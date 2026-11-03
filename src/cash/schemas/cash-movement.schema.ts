import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CashMovementDocument = HydratedDocument<CashMovement>;

@Schema({ collection: 'cash_movements', timestamps: true })
export class CashMovement {
  @Prop({ type: String })
  _id: string;

  @Prop({ type: String, required: true }) tenantId: string;
  @Prop({ type: String, required: true }) terminalId: string;
  @Prop({ type: String, required: true }) sessionId: string;
  @Prop({ type: String, required: true, enum: ['pos', 'admin'] }) origin: 'pos' | 'admin';
  @Prop({ type: String, required: true, enum: ['in', 'out'] }) type: 'in' | 'out';
  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) reason: string;
  @Prop({ type: String, default: null }) createdBy: string | null;
  @Prop({ type: Date, required: true }) occurredAt: Date;
  @Prop({ type: Date, default: null }) deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const CashMovementSchema = SchemaFactory.createForClass(CashMovement);
CashMovementSchema.index({ sessionId: 1 });
CashMovementSchema.index({ tenantId: 1, updatedAt: 1 });