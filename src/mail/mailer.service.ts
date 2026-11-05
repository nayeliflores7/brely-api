import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string[];
  subject: string;
  html: string;
  text: string;
}

/** Sin detalles técnicos ni datos de la cuenta: este texto se guarda y se muestra en el panel. */
export function mailErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === 'EAUTH') {
    return 'Gmail rechazó las credenciales. Revisa SMTP_USER y SMTP_APP_PASSWORD en el servidor.';
  }
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'EDNS') {
    return 'No se pudo conectar con el servidor de correo.';
  }
  if (code === 'EENVELOPE') return 'El servidor de correo rechazó algún destinatario.';
  return 'No se pudo enviar el correo.';
}

// La cuenta y su contraseña de aplicación viven solo en el .env del servidor
@Injectable()
export class MailerService {
  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return !!this.config.get('SMTP_USER') && !!this.config.get('SMTP_APP_PASSWORD');
  }

  async send(message: MailMessage): Promise<void> {
    const user = this.config.get<string>('SMTP_USER');
    const port = Number(this.config.get('SMTP_PORT') ?? 465);
    const transport = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST') ?? 'smtp.gmail.com',
      port,
      secure: this.config.get('SMTP_SECURE') !== 'false' && port === 465,
      auth: { user, pass: this.config.get<string>('SMTP_APP_PASSWORD') },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
    try {
      await transport.sendMail({ from: `Brely <${user}>`, ...message });
    } finally {
      transport.close();
    }
  }
}
