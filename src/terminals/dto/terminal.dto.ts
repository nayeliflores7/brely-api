import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTerminalDto {
  @IsString() @MinLength(2) @MaxLength(80)
  name: string;
}

export class UpdateTerminalDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80)
  name?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

export class ActivateDto {
  @IsString() @MinLength(8) @MaxLength(12)
  code: string;

  @IsOptional() @IsString() @MaxLength(200)
  deviceInfo?: string;
}