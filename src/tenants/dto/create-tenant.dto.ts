import { Type } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { TenantSettingsDto } from './tenant-settings.dto.js';

export class CreateTenantDto {
  @IsString() @MinLength(2) @MaxLength(120)
  name: string;

  @IsOptional() @IsString() @MaxLength(200)
  legalName?: string;

  @IsOptional() @IsString() @MaxLength(20)
  taxId?: string;

  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(300)
  address?: string;

  // Solo imágenes: el POS lo inserta tal cual en el HTML del ticket. null lo quita.
  @IsOptional() @IsString() @MaxLength(700_000)
  @Matches(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
  logo?: string | null;

  @IsOptional() @ValidateNested() @Type(() => TenantSettingsDto)
  settings?: TenantSettingsDto;
}