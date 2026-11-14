import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { HydratedDocument } from 'mongoose';
import { EXPENSE_FREQUENCIES, type ExpenseFrequency } from '../finance.js';

export type FixedExpenseDocument = HydratedDocument<FixedExpense>;

/** Un gasto que se paga aunque no se venda nada: renta, luz, sueldos. Solo del panel: el POS no lo usa. */
@Schema({ collection: 'fixed_expenses', timestamps: true })
export class FixedExpense {
  @Prop({ type: String, default: () => randomUUID() })
  _id: string;

  @Prop({ type: String, required: true })
  tenantId: string;

  @Prop({ required: true, trim: true })
  name: string;

  /** Lo que se paga cada vez, con la frecuencia de abajo. */
  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ type: String, required: true, enum: EXPENSE_FREQUENCIES, default: 'monthly' })
  frequency: ExpenseFrequency;

  @Prop({ default: '' })
  notes: string;

  @Prop({ type: String, default: null })
  createdBy: string | null;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const FixedExpenseSchema = SchemaFactory.createForClass(FixedExpense);
FixedExpenseSchema.index({ tenantId: 1, deletedAt: 1 });
