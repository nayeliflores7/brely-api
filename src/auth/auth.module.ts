import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { MailModule } from '../mail/mail.module.js';
import { PasswordReset, PasswordResetSchema } from './password-reset.schema.js';
import { PasswordResetService } from './password-reset.service.js';
import { RolesModule } from '../roles/roles.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthController } from './auth.controller.js';
import { TenantProvisioningController } from './tenant-provisioning.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PermissionsGuard } from './permissions.guard.js';
import { SuperAdminsModule } from '../super-admins/super-admins.module.js';

@Module({
  imports: [
    UsersModule,
    SuperAdminsModule,
    RolesModule,
    TenantsModule,
    AuditModule,
    MailModule,
    MongooseModule.forFeature([{ name: PasswordReset.name, schema: PasswordResetSchema }]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        secret: c.getOrThrow<string>('JWT_SECRET'),
        // 24 horas si el .env no indica otra cosa
        signOptions: { expiresIn: Number(c.get('JWT_EXPIRES_IN_SECONDS') ?? 86400) },
      }),
    }),
  ],
  controllers: [AuthController, TenantProvisioningController],
  providers: [
    AuthService,
    PasswordResetService,
    // El orden importa: primero autentica, luego autoriza
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [JwtModule]
})
export class AuthModule {}