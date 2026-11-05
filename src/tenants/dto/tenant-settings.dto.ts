import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export const DEFAULT_TENANT_SETTINGS = {
  ticketFooter: 'GRACIAS POR SU COMPRA',
  defaultTaxRate: 0.16,
  printTicket: 'ask',
  paperWidth: 80,
};

export class TenantSettingsDto {
  @IsOptional() @IsString() @MaxLength(200)
  ticketFooter?: string;

  // Las mismas tasas que ofrece el formulario de producto
  @IsOptional() @IsIn([0, 0.08, 0.16])
  defaultTaxRate?: number;

  @IsOptional() @IsIn(['ask', 'always', 'never'])
  printTicket?: 'ask' | 'always' | 'never';

  @IsOptional() @IsIn([58, 80])
  paperWidth?: 58 | 80;

  // Inicio de los códigos que genera el sistema: VEN-7K3M9Q2X
  @IsOptional() @Matches(/^[A-Z0-9]{1,6}$/)
  barcodePrefix?: string;
}
