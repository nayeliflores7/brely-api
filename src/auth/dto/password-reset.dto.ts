import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail() @MaxLength(254)
  email: string;
}

export class ResetPasswordDto {
  @IsString() @Length(64, 64)
  token: string;

  @IsString() @MinLength(8) @MaxLength(100)
  newPassword: string;
}
