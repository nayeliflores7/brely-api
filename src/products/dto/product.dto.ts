import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';

export class CreateProductDto {
  @IsString() @MinLength(1) @MaxLength(64)
  barcode: string;

  @IsString() @MinLength(1) @MaxLength(200)
  name: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @IsString()
  categoryId?: string | null;

  @IsOptional() @IsString() @MaxLength(20)
  unit?: string;

  @IsNumber() @Min(0)
  price: number;

  @IsNumber() @Min(0)
  cost: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  taxRate?: number;

  @IsOptional() @IsBoolean()
  trackStock?: boolean;

  @IsOptional() @IsNumber() @Min(0)
  minStock?: number;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

// Alta desde el panel: el POS registra su stock inicial con un movimiento propio
export class CreateProductWithStockDto extends CreateProductDto {
  @IsOptional() @IsNumber() @Min(0)
  initialStock?: number;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

// Lo que llega en el payload del outbox (el id lo genera el POS)
export class ProductPushDto extends CreateProductDto {
  @IsString() @MaxLength(64)
  id: string;

  @IsOptional() @IsString() @MaxLength(64)
  userId?: string;
}

export class ProductDeletePushDto {
  @IsString() @MaxLength(64)
  id: string;

  @IsOptional() @IsString() @MaxLength(64)
  userId?: string;
}

export class ListProductsQuery {
  @IsOptional() @IsString() @MaxLength(100)
  q?: string;

  @IsOptional() @IsString()
  categoryId?: string;

  @IsOptional() @IsIn(['name', 'barcode', 'price', 'stock', 'active'])
  sort?: 'name' | 'barcode' | 'price' | 'stock' | 'active';

  @IsOptional() @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
}