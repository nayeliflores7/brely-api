import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { HydratedDocument } from 'mongoose';

export type TerminalDocument = HydratedDocument<Terminal>;

@Schema({ collection: 'terminals', timestamps: true })
export class Terminal {
  @Prop({ type: String, default: () => randomUUID() })
  _id: string;

  @Prop({ type: String, required: true })
  tenantId: string;

  @Prop({ required: true, trim: true })
  name: string;

  // SHA-256 del código; se borra al activar
  @Prop({ type: String, select: false })
  activationCodeHash?: string;

  @Prop({ type: Date })
  activationExpiresAt?: Date;

  @Prop({ type: Date, default: null })
  activatedAt: Date | null;

  @Prop({ type: Date, default: null })
  lastSeenAt: Date | null;

  @Prop({ default: '' })
  deviceInfo: string;

  // Subirlo invalida el token anterior (reinstalación, robo del equipo)
  @Prop({ default: 0 })
  tokenVersion: number;

  @Prop({ default: true })
  active: boolean;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const TerminalSchema = SchemaFactory.createForClass(Terminal);
TerminalSchema.index(
  { activationCodeHash: 1 },
  { unique: true, partialFilterExpression: { activationCodeHash: { $type: 'string' } } },
);
TerminalSchema.index({ tenantId: 1, updatedAt: 1 });