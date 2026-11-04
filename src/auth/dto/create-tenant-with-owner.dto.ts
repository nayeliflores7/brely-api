import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateTenantDto } from '../../tenants/dto/create-tenant.dto.js';

export class TenantOwnerDto {
  @IsString() @MinLength(2) @MaxLength(120)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString() @MinLength(8) @MaxLength(100)
  password: string;

  @IsOptional() @Matches(/^\d{6}$/, { message: 'pin must be 6 digits' })
  pin?: string;
}

export class CreateTenantWithOwnerDto extends CreateTenantDto {
  @IsDefined() @ValidateNested() @Type(() => TenantOwnerDto)
  owner: TenantOwnerDto;
}
