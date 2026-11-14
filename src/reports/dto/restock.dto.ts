import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RestockQuery {
  // Cuánto por encima del mínimo se considera "por agotarse": 0 = solo los que ya están en alerta
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) margin?: number;
  // Para cuántos días de ventas debe alcanzar lo que se compre
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(90) days?: number;
  @IsOptional() @IsString() @MaxLength(64) tz?: string;
}
