import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StockMovementDocument = HydratedDocument<StockMovement>;
export const STOCK_TYPES = ['initial', 'sale', 'sale_cancel', 'purchase', 'return', 'adjustment', 'waste'] as const;

@Schema({ collection: 'stock_movements', timestamps: true })
export class StockMovement {
  @Prop({ type: String })
  _id: string;

  @Prop({ type: String, required: true }) tenantId: string;
  @Prop({ type: String, required: true }) terminalId: string; // 'admin' si no viene de una caja
  @Prop({ type: String, required: true, enum: ['pos', 'admin'] }) origin: 'pos' | 'admin';
  @Prop({ type: String, required: true }) productId: string;
  @Prop({ type: String, required: true, enum: STOCK_TYPES }) type: string;
  @Prop({ required: true }) quantity: number; // con signo
  @Prop({ required: true }) stockAfter: number; // stock del servidor; no se replica al POS
  @Prop({ default: '' }) reason: string;
  @Prop({ type: String, default: null }) referenceId: string | null;
  @Prop({ type: String, default: null }) createdBy: string | null;
  @Prop({ type: Date, required: true }) occurredAt: Date;
  @Prop({ type: Date, default: null }) deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);
StockMovementSchema.index({ tenantId: 1, productId: 1, occurredAt: -1 });
StockMovementSchema.index({ tenantId: 1, updatedAt: 1 });
StockMovementSchema.index({ referenceId: 1 });