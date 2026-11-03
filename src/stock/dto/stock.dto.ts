import { Type } from 'class-transformer';
import {
  IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Max, MaxLength, Min, NotEquals,
} from 'class-validator';
import { STOCK_TYPES } from '../schemas/stock-movement.schema.js';

export class StockMovementPushDto {
  @IsString() @MaxLength(64) id: string;
  @IsString() @MaxLength(64) productId: string;
  @IsIn(STOCK_TYPES) type: string;
  @IsNumber() @NotEquals(0) quantity: number;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
  @IsOptional() @IsString() @MaxLength(64) referenceId?: string | null;
  @IsOptional() @IsString() @MaxLength(64) userId?: string;
  @IsISO8601() createdAt: string;
}

// Alta manual desde el admin. Para 'adjustment' puedes mandar countedStock (conteo físico)
// y la API calcula la diferencia.
export class CreateStockMovementDto {
  @IsString() productId: string;

  @IsIn(['initial', 'purchase', 'return', 'adjustment', 'waste'])
  type: 'initial' | 'purchase' | 'return' | 'adjustment' | 'waste';

  @IsOptional() @IsNumber() @NotEquals(0) quantity?: number;
  @IsOptional() @IsNumber() @Min(0) countedStock?: number;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

export class ListStockQuery {
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsIn(STOCK_TYPES) type?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}