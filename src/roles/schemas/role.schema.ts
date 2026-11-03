import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { HydratedDocument } from 'mongoose';

export type RoleDocument = HydratedDocument<Role>;

@Schema({ collection: 'roles', timestamps: true })
export class Role {
  @Prop({ type: String, default: () => randomUUID() })
  _id: string;

  @Prop({ type: String, required: true, index: true })
  tenantId: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: false })
  isSystem: boolean;

  // Reemplaza la tabla role_permissions
  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const RoleSchema = SchemaFactory.createForClass(Role);
RoleSchema.index(
  { tenantId: 1, name: 1 },
  {
    unique: true,
    collation: { locale: 'es', strength: 2 }, // case-insensitive
    partialFilterExpression: { deletedAt: { $type: 'null' } },
  },
);
RoleSchema.index({ tenantId: 1, updatedAt: 1 });