import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class SaveReportEmailDto {
  @IsBoolean()
  enabled: boolean;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  time: string;

  @IsString() @MaxLength(64)
  timeZone: string;

  @IsArray() @ArrayMaxSize(10) @IsEmail({}, { each: true })
  recipients: string[];

  @IsBoolean()
  includeCosts: boolean;
}
