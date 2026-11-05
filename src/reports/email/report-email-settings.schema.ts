import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ReportEmailSettingsDocument = HydratedDocument<ReportEmailSettings>;

// Colección aparte y no dentro del negocio: cambiar esto no debe mandar el negocio (con su logo) a cada terminal
@Schema({ collection: 'report_email_settings', timestamps: true })
export class ReportEmailSettings {
  // Uno por negocio: el _id es el tenantId
  @Prop({ type: String })
  _id: string;

  @Prop({ default: false })
  enabled: boolean;

  // Hora local del negocio, "21:00"
  @Prop({ default: '21:00' })
  time: string;

  @Prop({ default: 'America/Mexico_City' })
  timeZone: string;

  @Prop({ type: [String], default: [] })
  recipients: string[];

  @Prop({ default: true })
  includeCosts: boolean;

  // "2026-11-04" en la hora del negocio: evita enviar dos veces el mismo día
  @Prop({ type: String, default: null })
  lastSentOn: string | null;

  @Prop({ type: Date, default: null })
  lastSentAt: Date | null;

  @Prop({ type: Date, default: null })
  lastAttemptAt: Date | null;

  @Prop({ type: String, default: null })
  lastError: string | null;

  @Prop({ type: Date, default: null })
  lastTestAt: Date | null;
}

export const ReportEmailSettingsSchema = SchemaFactory.createForClass(ReportEmailSettings);
ReportEmailSettingsSchema.index({ enabled: 1 });
