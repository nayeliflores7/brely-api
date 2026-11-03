import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { HydratedDocument } from 'mongoose';

export type PriceHistoryDocument = HydratedDocument<PriceHistory>;

// Append-only. Solo la escribe la API
@Schema({ collection: 'price_history', timestamps: false })
export class PriceHistory {
  @Prop({ type: String, default: () => randomUUID() })
  _id: string;

  @Prop({ type: String, required: true })
  tenantId: string;

  @Prop({ type: String, required: true })
  productId: string;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true })
  cost: number;

  @Prop({ type: Date, required: true })
  changedAt: Date; // hora del servidor

  @Prop({ type: String, default: null })
  changedBy: string | null;
}

export const PriceHistorySchema = SchemaFactory.createForClass(PriceHistory);
PriceHistorySchema.index({ productId: 1, changedAt: -1 });