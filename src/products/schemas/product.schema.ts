import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { HydratedDocument } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

@Schema({ collection: 'products', timestamps: true })
export class Product {
  @Prop({ type: String, default: () => randomUUID() })
  _id: string;

  @Prop({ type: String, required: true })
  tenantId: string;

  @Prop({ type: String, required: true, trim: true })
  barcode: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: String, default: null })
  categoryId: string | null;

  @Prop({ type: String, default: 'pza' })
  unit: string;

  @Prop({ default: 0 })
  price: number;

  @Prop({ default: 0 })
  cost: number;

  @Prop({ default: 0.16 })
  taxRate: number;

  @Prop({ default: true })
  trackStock: boolean;

  // Solo lo modifican los stock_movements
  @Prop({ default: 0 })
  stock: number;

  @Prop({ default: 0 })
  minStock: number;

  @Prop({ default: true })
  active: boolean;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
// Un producto borrado libera su código de barras
ProductSchema.index(
  { tenantId: 1, barcode: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $type: 'null' } } },
);
ProductSchema.index({ tenantId: 1, updatedAt: 1 });
ProductSchema.index({ tenantId: 1, categoryId: 1 });