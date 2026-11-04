import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsNumber, IsOptional,
  IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

export class SalePaymentDto {
  @IsIn(['cash', 'card', 'transfer']) method: 'cash' | 'card' | 'transfer';
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsNumber() @Min(0) tendered?: number;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}

// ── Push del POS (se ignoran terminalId, paymentMethod, status, etc.) ──
export class PushSaleItemDto {
  @IsString() @MaxLength(64) productId: string;
  @IsString() @MaxLength(64) barcode: string;
  @IsString() @MaxLength(200) name: string;
  @IsString() @MaxLength(20) unit: string;
  @IsNumber() @Min(0) unitPrice: number;
  @IsOptional() @IsNumber() @Min(0) unitCost?: number;
  @IsNumber() @Min(0) @Max(1) taxRate: number;
  @IsNumber() @Min(0.0001) quantity: number;
  @IsOptional() @IsNumber() @Min(0) discount?: number;
  @IsOptional() @IsString() @MaxLength(64) promotionId?: string | null;
  @IsOptional() @IsString() @MaxLength(200) promotionName?: string | null;
}

export class PushSaleDto {
  @IsString() @MaxLength(64) id: string;
  @IsInt() @Min(1) folio: number;
  @IsOptional() @IsString() @MaxLength(64) sessionId?: string | null;
  @IsISO8601() createdAt: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(300)
  @ValidateNested({ each: true }) @Type(() => PushSaleItemDto)
  items: PushSaleItemDto[];

  @IsNumber() subtotal: number;
  @IsNumber() tax: number;
  @IsNumber() total: number;
  @IsOptional() @IsNumber() @Min(0) discount?: number;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3)
  @ValidateNested({ each: true }) @Type(() => SalePaymentDto)
  payments: SalePaymentDto[];

  @IsNumber() @Min(0) received: number;
  @IsNumber() @Min(0) change: number;

  @IsOptional() @IsString() @MaxLength(64) userId?: string;
  @IsOptional() @IsString() @MaxLength(120) userName?: string;
}

export class PushCancelDto {
  @IsString() @MaxLength(64) id: string;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
  @IsISO8601() cancelledAt: string;
  @IsOptional() @IsString() @MaxLength(64) userId?: string;
}

// ── REST del admin ──
export class AdminSaleItemDto {
  @IsString() productId: string;
  @IsNumber() @Min(0.0001) quantity: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number; // por defecto, el precio del catálogo
  @IsOptional() @IsNumber() @Min(0) discount?: number;
}

export class CreateSaleDto {
  @IsString() terminalId: string;
  @IsOptional() @IsISO8601() soldAt?: string; // para registrar ventas a posteriori

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(300)
  @ValidateNested({ each: true }) @Type(() => AdminSaleItemDto)
  items: AdminSaleItemDto[];

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3)
  @ValidateNested({ each: true }) @Type(() => SalePaymentDto)
  payments: SalePaymentDto[];
}

export class CancelSaleDto {
  @IsString() @MinLength(2) @MaxLength(200) reason: string;
}

export class ListSalesQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) folio?: number;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsString() terminalId?: string;
  @IsOptional() @IsIn(['completed', 'cancelled']) status?: string;
  @IsOptional() @IsIn(['pos', 'admin']) origin?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}