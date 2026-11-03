import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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

  @IsOptional() @IsString()
  logo?: string;
}