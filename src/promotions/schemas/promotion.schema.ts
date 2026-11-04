import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { HydratedDocument } from 'mongoose';

export type PromotionDocument = HydratedDocument<Promotion>;
export const PROMOTION_TYPES = ['buy_x_pay_y', 'bundle_price', 'percent', 'amount'] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

@Schema({ collection: 'promotions', timestamps: true })
export class Promotion {
  @Prop({ type: String, default: () => randomUUID() })
  _id: string;

  @Prop({ required: true })
  tenantId: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, required: true, enum: PROMOTION_TYPES })
  type: PromotionType;

  // Exactamente uno de los dos
  @Prop({ type: String, default: null })
  productId: string | null;

  @Prop({ type: String, default: null })
  categoryId: string | null;

  @Prop({ type: Number, default: null })
  buyQty: number | null;

  @Prop({ type: Number, default: null })
  payQty: number | null;

  @Prop({ type: Number, default: null })
  bundleQty: number | null;

  @Prop({ type: Number, default: null })
  bundlePrice: number | null;

  // 0.10 = 10 %
  @Prop({ type: Number, default: null })
  percent: number | null;

  // Por pieza
  @Prop({ type: Number, default: null })
  amount: number | null;

  @Prop({ type: Date, default: null })
  startsAt: Date | null;

  @Prop({ type: Date, default: null })
  endsAt: Date | null;

  // 0 = domingo; null = todos los días
  @Prop({ type: [Number], default: null })
  weekdays: number[] | null;

  @Prop({ default: true })
  active: boolean;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const PromotionSchema = SchemaFactory.createForClass(Promotion);
PromotionSchema.index({ tenantId: 1, deletedAt: 1 });
PromotionSchema.index({ tenantId: 1, updatedAt: 1 });
