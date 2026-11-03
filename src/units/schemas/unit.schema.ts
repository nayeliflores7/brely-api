import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UnitDocument = HydratedDocument<Unit>;

@Schema({ collection: 'units', timestamps: true })
export class Unit {
  @Prop({ type: String })
  _id: string; // 'global:kg' | '<tenantId>:<code>'

  @Prop({ type: String, default: null })
  tenantId: string | null; // null = unidad global

  @Prop({ type: String, required: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  abbreviation: string;

  @Prop({ default: false })
  allowsDecimals: boolean;

  @Prop({ default: true })
  active: boolean;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const UnitSchema = SchemaFactory.createForClass(Unit);
UnitSchema.index({ tenantId: 1, code: 1 }, { unique: true });
UnitSchema.index({ updatedAt: 1 });