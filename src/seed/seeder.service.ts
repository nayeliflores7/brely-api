import { Injectable, Logger } from '@nestjs/common';
import { PermissionsService } from '../permissions/permissions.service.js';
import { RolesService } from '../roles/roles.service.js';
import { TenantsService } from '../tenants/tenants.service.js';

@Injectable()
export class SeederService {
  private readonly logger = new Logger(SeederService.name);

  constructor(
    private readonly permissions: PermissionsService,
    private readonly roles: RolesService,
    private readonly tenants: TenantsService,
  ) {}

  // Se puede repetir sin duplicar ni cambiar lo que ya existe: solo crea lo que falta.
  // Los permisos nuevos llegan al propietario; a los demás roles se les activan con sus switches.
  async run() {
    await this.permissions.seedCatalog();

    const tenants = await this.tenants.findAll();
    for (const tenant of tenants) {
      await this.roles.seedSystemRoles(tenant._id);
      this.logger.log(`Roles base listos en: ${tenant.name}`);
    }
    return { tenants: tenants.length };
  }
}
