import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SaleDocument = HydratedDocument<Sale>;

@Schema({ _id: false })
export class SaleItem {
  @Prop({ type: String, required: true }) productId: string;
  @Prop({ type: String, required: true }) barcode: string;
  @Prop({ type: String, required: true }) name: string;
  @Prop({ type: String, default: 'pza' }) unit: string;
  @Prop({ required: true }) unitPrice: number;
  @Prop({ default: 0 }) unitCost: number;
  @Prop({ default: 0.16 }) taxRate: number;
  @Prop({ required: true }) quantity: number;
  @Prop({ default: 0 }) discount: number;
  @Prop({ type: String, default: null }) promotionId: string | null;
  @Prop({ type: String, default: null }) promotionName: string | null;
}
const SaleItemSchema = SchemaFactory.createForClass(SaleItem);

@Schema({ _id: false })
export class SalePayment {
  @Prop({ type: String, required: true, enum: ['cash', 'card', 'transfer'] }) method: string;
  @Prop({ required: true }) amount: number;   // neto de cambio
  @Prop({ required: true }) tendered: number; // lo que entregó el cliente
  @Prop({ default: '' }) reference: string;
}
const SalePaymentSchema = SchemaFactory.createForClass(SalePayment);

@Schema({ collection: 'sales', timestamps: true })
export class Sale {
  @Prop({ type: String })
  _id: string;

  @Prop({ type: String, required: true }) tenantId: string;
  @Prop({ type: String, required: true }) terminalId: string;
  @Prop({ type: String, required: true, enum: ['pos', 'admin'] }) origin: 'pos' | 'admin';
  @Prop({ type: String, required: true, enum: ['pos', 'admin'] }) lastWriteOrigin: 'pos' | 'admin';
  @Prop({ required: true }) folio: number;
  @Prop({ type: String, default: null }) sessionId: string | null;

  // Hora real de la venta (createdAt de mongoose = hora en que llegó al servidor)
  @Prop({ type: Date, required: true }) soldAt: Date;

  @Prop({ type: [SaleItemSchema], default: [] }) items: SaleItem[];
  @Prop({ type: [SalePaymentSchema], default: [] }) payments: SalePayment[];

  @Prop({ required: true }) subtotal: number;
  @Prop({ required: true }) tax: number;
  @Prop({ required: true }) total: number;
  @Prop({ default: 0 }) discount: number;
  @Prop({ type: String, required: true, enum: ['cash', 'card', 'transfer'] }) paymentMethod: string;
  @Prop({ required: true }) received: number;
  @Prop({ required: true }) change: number;

  @Prop({ type: String, default: 'completed', enum: ['completed', 'cancelled'] }) status: string;
  @Prop({ type: Date, default: null }) cancelledAt: Date | null;
  @Prop({ default: '' }) cancelReason: string;
  @Prop({ type: String, default: null }) cancelledBy: string | null;

  @Prop({ type: String, default: null }) createdBy: string | null;
  @Prop({ default: '' }) createdByName: string;
  @Prop({ type: Date, default: null }) deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const SaleSchema = SchemaFactory.createForClass(Sale);
// Dos series de folio por terminal: la del POS y la del admin
SaleSchema.index({ terminalId: 1, origin: 1, folio: 1 }, { unique: true });
SaleSchema.index({ tenantId: 1, soldAt: -1 });
SaleSchema.index({ sessionId: 1 });
SaleSchema.index({ tenantId: 1, updatedAt: 1 });