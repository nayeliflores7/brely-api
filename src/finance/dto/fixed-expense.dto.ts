import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { EXPENSE_FREQUENCIES, PROFIT_PERIODS, type ExpenseFrequency, type ProfitPeriod } from '../finance.js';

export class CreateFixedExpenseDto {
  @IsString() @MinLength(2) @MaxLength(80)
  name: string;

  // Lo que se paga cada vez; la frecuencia dice cada cuándo
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(10_000_000)
  amount: number;

  @IsIn(EXPENSE_FREQUENCIES)
  frequency: ExpenseFrequency;

  @IsOptional() @IsString() @MaxLength(200)
  notes?: string;
}

export class UpdateFixedExpenseDto extends PartialType(CreateFixedExpenseDto) {}

export class SummaryQuery {
  // Zona horaria de quien consulta: define dónde empieza el mes
  @IsOptional() @IsString() @MaxLength(64)
  tz?: string;
}

export class ProductProfitQuery {
  // month: este mes · last30: los últimos 30 días · lastMonth: el mes pasado completo
  @IsOptional() @IsIn(PROFIT_PERIODS)
  period?: ProfitPeriod;

  @IsOptional() @IsString() @MaxLength(64)
  tz?: string;
}
