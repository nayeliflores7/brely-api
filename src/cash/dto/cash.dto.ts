import { Type } from 'class-transformer';
import {
  IsIn, IsInt, IsISO8601, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

export class CashSessionOpenPushDto {
  @IsString() @MaxLength(64) id: string;
  @IsInt() @Min(1) number: number;
  @IsNumber() @Min(0) openingFloat: number;
  @IsOptional() @IsString() @MaxLength(64) userId?: string;
}

export class CashSessionClosePushDto {
  @IsString() @MaxLength(64) id: string;
  @IsISO8601() closedAt: string;
  @IsNumber() countedCash: number;
  @IsNumber() difference: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsObject() summary: Record<string, number>;
  @IsOptional() @IsString() @MaxLength(64) userId?: string;
}

export class CashMovementPushDto {
  @IsString() @MaxLength(64) id: string;
  @IsIn(['in', 'out']) type: 'in' | 'out';
  @IsNumber() @Min(0.01) amount: number;
  @IsString() @MaxLength(200) reason: string;
  @IsISO8601() createdAt: string;
  @IsString() @MaxLength(64) sessionId: string;
  @IsOptional() @IsString() @MaxLength(64) userId?: string;
}

export class CreateCashMovementDto {
  @IsString() sessionId: string;
  @IsIn(['in', 'out']) type: 'in' | 'out';
  @IsNumber() @Min(0.01) amount: number;
  @IsString() @MaxLength(200) reason: string;
}

export class CloseSessionDto {
  @IsNumber() @Min(0) countedCash: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ListSessionsQuery {
  @IsOptional() @IsString() terminalId?: string;
  @IsOptional() @IsIn(['open', 'closed']) status?: 'open' | 'closed';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}