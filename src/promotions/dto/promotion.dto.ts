import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PROMOTION_TYPES } from '../schemas/promotion.schema.js';
import type { PromotionType } from '../schemas/promotion.schema.js';

export class CreatePromotionDto {
  @IsString() @MinLength(1) @MaxLength(120)
  name: string;

  @IsIn(PROMOTION_TYPES)
  type: PromotionType;

  @IsOptional() @IsString() @MaxLength(64)
  productId?: string | null;

  @IsOptional() @IsString() @MaxLength(64)
  categoryId?: string | null;

  @IsOptional() @IsNumber()
  buyQty?: number | null;

  @IsOptional() @IsNumber()
  payQty?: number | null;

  @IsOptional() @IsNumber()
  bundleQty?: number | null;

  @IsOptional() @IsNumber()
  bundlePrice?: number | null;

  @IsOptional() @IsNumber()
  percent?: number | null;

  @IsOptional() @IsNumber()
  amount?: number | null;

  @IsOptional() @IsISO8601()
  startsAt?: string | null;

  @IsOptional() @IsISO8601()
  endsAt?: string | null;

  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true })
  weekdays?: number[] | null;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

export class UpdatePromotionDto extends PartialType(CreatePromotionDto) {}
