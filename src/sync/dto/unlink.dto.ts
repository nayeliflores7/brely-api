import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class UnlinkDto {
  // Quién lo autorizó con su PIN en el POS
  @IsString() @MaxLength(200)
  userName: string;

  // Las que la nube rechazó y se borraron con el equipo
  @IsInt() @Min(0)
  rejected: number;
}
