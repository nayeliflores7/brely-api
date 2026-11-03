import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';
import { SyncOp, SyncOpSchema } from './schemas/sync-op.schema.js';
import { Tenant, TenantSchema } from '../tenants/schemas/tenant.schema.js';
import { Role, RoleSchema } from '../roles/schemas/role.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { PermissionEntity, PermissionSchema } from '../permissions/schemas/permission.schema.js';
import { AuthModule } from '../auth/auth.module.js';
import { TerminalsModule } from '../terminals/terminals.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SyncOp.name, schema: SyncOpSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Role.name, schema: RoleSchema },
      { name: User.name, schema: UserSchema },
      { name: PermissionEntity.name, schema: PermissionSchema },
    ]),
    // El TerminalAuthGuard se instancia aquí, así que necesita sus dependencias
    AuthModule,
    TerminalsModule,
    TenantsModule,
  ],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService], // los módulos de ventas, productos... registran su handler aquí
})
export class SyncModule {}