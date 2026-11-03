import {
  IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf,
} from 'class-validator';

export class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(120)
  fullName: string;

  @IsString()
  roleId: string;

  @IsOptional() @IsEmail()
  email?: string;

  @ValidateIf((o) => o.email !== undefined || o.password !== undefined)
  @IsString() @MinLength(8) @MaxLength(100)
  password?: string;

  @IsOptional() @Matches(/^\d{4,6}$/, { message: 'pin must be 4 to 6 digits' })
  pin?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;
}