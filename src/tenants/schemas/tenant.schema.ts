import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { HydratedDocument } from 'mongoose';

export type TenantDocument = HydratedDocument<Tenant>;

@Schema({ collection: 'tenants', timestamps: true })
export class Tenant {
  @Prop({ type: String, default: () => randomUUID() })
  _id: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '', trim: true })
  legalName: string;

  @Prop({ default: '', trim: true })
  taxId: string;

  @Prop({ default: '' })
  phone: string;

  @Prop({ default: '' })
  address: string;

  @Prop({ type: String, default: null })
  logo: string | null;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  // Los gestiona mongoose (timestamps: true). Sirven de cursor para el pull.
  createdAt: Date;
  updatedAt: Date;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
TenantSchema.index({ updatedAt: 1 });