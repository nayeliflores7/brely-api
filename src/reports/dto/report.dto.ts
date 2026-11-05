import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReportQuery {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsString() @MaxLength(64) terminalId?: string;
  // Zona horaria de quien consulta: define a qué día pertenece cada venta
  @IsOptional() @IsString() @MaxLength(64) tz?: string;
}
