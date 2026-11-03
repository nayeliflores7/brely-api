import {
  ArrayUnique, IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength,
} from 'class-validator';

export class CreateRoleDto {
  @IsString() @MinLength(2) @MaxLength(60)
  name: string;

  @IsOptional() @IsString() @MaxLength(200)
  description?: string;

  @IsArray() @ArrayUnique() @IsString({ each: true })
  permissions: string[];

  // Solo lo respeta el super admin
  @IsOptional() @IsBoolean()
  isSystem?: boolean;
}