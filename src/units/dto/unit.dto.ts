import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateUnitDto {
  @Matches(/^[a-z0-9_]{1,20}$/, { message: 'code must be lowercase letters, digits or _' })
  code: string;

  @IsString() @MinLength(1) @MaxLength(60)
  name: string;

  @IsString() @MinLength(1) @MaxLength(10)
  abbreviation: string;

  @IsOptional() @IsBoolean()
  allowsDecimals?: boolean;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

export class UpdateUnitDto extends PartialType(OmitType(CreateUnitDto, ['code'] as const)) {}