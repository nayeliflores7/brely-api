import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PermissionDocument = HydratedDocument<PermissionEntity>;

// La clave es el _id (ej. 'sales.cancel'), igual que en el POS
@Schema({ collection: 'permissions', timestamps: true })
export class PermissionEntity {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: String, required: true, enum: ['admin', 'pos'] })
  scope: 'admin' | 'pos';

  @Prop({ default: true })
  active: boolean;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const PermissionSchema = SchemaFactory.createForClass(PermissionEntity);
PermissionSchema.index({ updatedAt: 1 });