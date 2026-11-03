import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CashSessionDocument = HydratedDocument<CashSession>;

@Schema({ collection: 'cash_sessions', timestamps: true })
export class CashSession {
  @Prop({ type: String })
  _id: string;

  @Prop({ type: String, required: true }) tenantId: string;
  @Prop({ type: String, required: true }) terminalId: string;
  @Prop({ required: true }) number: number;
  @Prop({ type: String, required: true, enum: ['open', 'closed'] }) status: 'open' | 'closed';
  @Prop({ type: String, required: true, enum: ['pos', 'admin'] }) origin: 'pos' | 'admin';
  @Prop({ type: String, required: true, enum: ['pos', 'admin'] }) lastWriteOrigin: 'pos' | 'admin';

  @Prop({ type: Date, required: true }) openedAt: Date;
  @Prop({ required: true }) openingFloat: number;
  @Prop({ type: String, default: null }) openedBy: string | null;

  @Prop({ type: Date, default: null }) closedAt: Date | null;
  @Prop({ type: Number, default: null }) countedCash: number | null;
  @Prop({ type: Number, default: null }) difference: number | null;
  @Prop({ default: '' }) notes: string;
  @Prop({ type: Object, default: null }) summary: Record<string, number> | null;
  @Prop({ type: String, default: null }) closedBy: string | null;
  @Prop({ type: Date, default: null }) deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const CashSessionSchema = SchemaFactory.createForClass(CashSession);
CashSessionSchema.index({ terminalId: 1, number: 1 }, { unique: true });
// Una sola sesión abierta por terminal, garantizado por la BD
CashSessionSchema.index(
  { terminalId: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } },
);
CashSessionSchema.index({ tenantId: 1, updatedAt: 1 });