import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PasswordResetDocument = HydratedDocument<PasswordReset>;

@Schema({ collection: 'password_resets', timestamps: { createdAt: true, updatedAt: false } })
export class PasswordReset {
  // SHA-256 del token: quien lea la base de datos no obtiene un enlace utilizable
  @Prop({ type: String })
  _id: string;

  @Prop({ type: String, required: true, index: true })
  accountId: string;

  @Prop({ type: Boolean, required: true })
  isSuperAdmin: boolean;

  @Prop({ type: String, default: null })
  tenantId: string | null;

  // El correo al que se envió: si la cuenta cambia de correo, el enlace deja de servir
  @Prop({ type: String, required: true })
  email: string;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  createdAt: Date;
}

export const PasswordResetSchema = SchemaFactory.createForClass(PasswordReset);
PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
