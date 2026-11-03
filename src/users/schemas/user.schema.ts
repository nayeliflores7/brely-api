import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ type: String, default: () => randomUUID() })
  _id: string;

  @Prop({ type: String, required: true, index: true })
  tenantId: string;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ type: String, required: true, ref: 'Role' })
  roleId: string;

  // Credencial admin web (opcional)
  @Prop({ type: String, lowercase: true, trim: true })
  email?: string;

  @Prop({ type: String, select: false })
  passwordHash?: string;

  // Credencial POS (opcional). Mismo esquema que el POS: scrypt + salt
  @Prop({ type: String, select: false })
  pinHash?: string;

  @Prop({ type: String, select: false })
  pinSalt?: string;

  @Prop({ default: true })
  active: boolean;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Email único global entre usuarios no borrados que tengan email
UserSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: 'string' }, deletedAt: { $type: 'null' } },
  },
);
UserSchema.index({ tenantId: 1, updatedAt: 1 });