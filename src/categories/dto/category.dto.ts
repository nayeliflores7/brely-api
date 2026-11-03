import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString() @MinLength(1) @MaxLength(80)
  name: string;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}