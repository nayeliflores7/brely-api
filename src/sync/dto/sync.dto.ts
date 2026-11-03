import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsInt, IsISO8601, IsObject, IsOptional, IsString,
  Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class PushOpDto {
  @IsString() @MaxLength(64)
  opId: string;

  @IsString() @MaxLength(40)
  entity: string;

  @IsString() @MaxLength(40)
  action: string;

  @IsObject()
  payload: Record<string, unknown>;

  @IsISO8601()
  createdAt: string;
}

export class PushDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PushOpDto)
  ops: PushOpDto[];
}

export class PullDto {
  // { roles: null, users: "2026-11-03T10:00:00.000Z|abc" }  (null = desde el inicio)
  @IsObject()
  cursors: Record<string, string | null>;

  @IsOptional() @IsInt() @Min(1) @Max(1000)
  limit?: number;
}