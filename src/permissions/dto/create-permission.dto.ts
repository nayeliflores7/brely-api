import {
  IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength,
} from 'class-validator';

export class CreatePermissionDto {
  @Matches(/^[a-z]+(\.[a-z_]+)+$/, { message: 'key must look like "module.action"' })
  @MaxLength(60)
  key: string;

  @IsString() @MinLength(2) @MaxLength(80)
  name: string;

  @IsOptional() @IsString() @MaxLength(200)
  description?: string;

  @IsIn(['admin', 'pos'])
  scope: 'admin' | 'pos';

  // Agrega el permiso a los roles de sistema con acceso admin (los "Propietario")
  @IsOptional() @IsBoolean()
  grantToOwners?: boolean;
}