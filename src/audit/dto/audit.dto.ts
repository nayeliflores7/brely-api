import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListAuditQuery {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsIn(['admin', 'pos']) source?: 'admin' | 'pos';
  @IsOptional() @IsString() @MaxLength(40) entity?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class ListPlatformAuditQuery extends ListAuditQuery {
  @IsOptional() @IsString() tenantId?: string;
}

// Lo que llega del outbox del POS
export class AuditPushDto {
  @IsString() @MaxLength(64) id: string;
  @IsOptional() @IsString() @MaxLength(64) userId?: string | null;
  @IsString() @MaxLength(60) action: string;
  @IsString() @MaxLength(60) entity: string;
  @IsOptional() @IsString() @MaxLength(64) entityId?: string | null;
  @IsOptional() @IsString() detail?: string | null;
  @IsISO8601() createdAt: string;
}
