import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { AuditService } from '../audit/audit.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { RolesService } from '../roles/roles.service.js';
import { SuperAdminsService } from '../super-admins/super-admins.service.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { UsersService } from '../users/users.service.js';
import { renderPasswordChangedEmail, renderPasswordResetEmail } from './password-reset.email.js';
import { PasswordReset, PasswordResetDocument } from './password-reset.schema.js';

const VALID_MINUTES = 60;
const COOLDOWN_MS = 60_000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectModel(PasswordReset.name) private readonly model: Model<PasswordResetDocument>,
    private readonly users: UsersService,
    private readonly superAdmins: SuperAdminsService,
    private readonly roles: RolesService,
    private readonly tenants: TenantsService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Nunca lanza ni dice si el correo existe. El controlador no lo espera: así el tiempo de
   * respuesta tampoco delata si se envió algo.
   */
  async request(email: string): Promise<void> {
    try {
      const account = await this.findAccount(email.toLowerCase());
      if (!account) return;
      if (!this.mailer.isConfigured) {
        this.logger.warn('No se envió el enlace de contraseña: falta configurar la cuenta de correo');
        return;
      }
      // Un límite por cuenta: el formulario es público y no debe servir para llenar un buzón
      const recent = await this.model.exists({
        accountId: account.id,
        createdAt: { $gt: new Date(Date.now() - COOLDOWN_MS) },
      });
      if (recent) return;

      const token = randomBytes(32).toString('hex');
      await this.model.deleteMany({ accountId: account.id }); // solo vale el enlace más reciente
      await this.model.create({
        _id: hashToken(token),
        accountId: account.id,
        isSuperAdmin: account.isSuperAdmin,
        tenantId: account.tenantId,
        email: account.email,
        expiresAt: new Date(Date.now() + VALID_MINUTES * 60_000),
      });

      const url = `${this.panelUrl()}/restablecer-contrasena?token=${token}`;
      await this.mailer.send({
        to: [account.email],
        ...renderPasswordResetEmail(account.fullName, url, VALID_MINUTES),
      });
      await this.recordAudit('auth.password_reset_requested', account);
    } catch (error) {
      this.logger.error(`No se pudo enviar el enlace de contraseña: ${(error as { code?: string }).code ?? 'error'}`);
    }
  }

  async reset(token: string, newPassword: string): Promise<void> {
    // Borrar y leer en un solo paso: dos envíos simultáneos no pueden usar el mismo enlace
    const pending = await this.model
      .findOneAndDelete({ _id: hashToken(token), expiresAt: { $gt: new Date() } })
      .lean();
    if (!pending) throw new BadRequestException('Invalid or expired link');

    const store = pending.isSuperAdmin ? this.superAdmins : this.users;
    const account = await store.findForPassword(pending.accountId);
    if (!account || account.email !== pending.email) {
      throw new BadRequestException('Invalid or expired link');
    }

    await store.resetPassword(pending.accountId, await argon2.hash(newPassword));
    await this.recordAudit('auth.password_reset', {
      id: pending.accountId,
      tenantId: pending.tenantId,
      fullName: account.fullName,
      isSuperAdmin: pending.isSuperAdmin,
    });
    void this.mailer
      .send({ to: [pending.email], ...renderPasswordChangedEmail(account.fullName) })
      .catch(() => this.logger.error('No se pudo enviar el aviso de contraseña cambiada'));
  }

  // Solo cuentas que de verdad pueden entrar al panel: lo demás no recibe nada
  private async findAccount(email: string) {
    const admin = await this.superAdmins.findByEmailForLogin(email);
    if (admin) {
      return { id: admin._id, tenantId: null, fullName: admin.fullName, email: admin.email, isSuperAdmin: true };
    }
    const user = await this.users.findByEmailForLogin(email);
    if (!user?.email || !(await this.tenants.isActive(user.tenantId))) return null;
    const role = await this.roles.findOneOrNull(user.tenantId, user.roleId);
    if (!role?.permissions.includes('admin.access')) return null;
    return { id: user._id, tenantId: user.tenantId, fullName: user.fullName, email: user.email, isSuperAdmin: false };
  }

  // De aquí sale el enlace, nunca de la petición: un encabezado falso no puede desviarlo
  private panelUrl(): string {
    const configured =
      this.config.get<string>('PANEL_URL') ?? this.config.get<string>('CORS_ORIGINS')?.split(',')[0];
    return (configured?.trim() || 'http://localhost:4200').replace(/\/+$/, '');
  }

  private recordAudit(
    action: string,
    account: { id: string; tenantId: string | null; fullName: string; isSuperAdmin: boolean },
  ) {
    return this.audit.record({
      tenantId: account.tenantId,
      source: 'admin',
      actorId: account.id,
      actorName: account.fullName,
      actorIsSuperAdmin: account.isSuperAdmin,
      action,
      entity: 'auth',
      entityId: account.id,
      entityName: account.fullName,
    });
  }
}
