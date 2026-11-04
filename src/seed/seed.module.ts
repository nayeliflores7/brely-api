import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { RolesModule } from '../roles/roles.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { SeederService } from './seeder.service.js';

@Module({
  imports: [PermissionsModule, RolesModule, TenantsModule],
  providers: [SeederService],
  exports: [SeederService],
})
export class SeedModule {}
