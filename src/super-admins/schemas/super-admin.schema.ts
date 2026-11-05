import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { HydratedDocument } from 'mongoose';

export type SuperAdminDocument = HydratedDocument<SuperAdmin>;

@Schema({ collection: 'super_admins', timestamps: true })
export class SuperAdmin {
  @Prop({ type: String, default: () => randomUUID() })
  _id: string;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true, unique: true })
  email: string;

  @Prop({ type: String, required: true, select: false })
  passwordHash: string;

  @Prop({ default: true })
  active: boolean;

  // Las sesiones emitidas antes de esto ya no valen: se fija al restablecer la contraseña
  @Prop({ type: Date, default: null, select: false })
  sessionsValidFrom: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const SuperAdminSchema = SchemaFactory.createForClass(SuperAdmin);