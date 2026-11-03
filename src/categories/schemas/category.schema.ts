import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { HydratedDocument } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

@Schema({ collection: 'categories', timestamps: true })
export class Category {
  @Prop({ type: String, default: () => randomUUID() })
  _id: string;

  @Prop({ type: String, required: true })
  tenantId: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: true })
  active: boolean;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
CategorySchema.index(
  { tenantId: 1, name: 1 },
  {
    unique: true,
    collation: { locale: 'es', strength: 2 },
    partialFilterExpression: { deletedAt: { $type: 'null' } },
  },
);
CategorySchema.index({ tenantId: 1, updatedAt: 1 });