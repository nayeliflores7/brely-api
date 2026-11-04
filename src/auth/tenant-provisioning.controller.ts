import { Body, Controller, Post } from '@nestjs/common';
import { SuperAdminOnly } from '../common/decorators.js';
import { AuthService } from './auth.service.js';
import { CreateTenantWithOwnerDto } from './dto/create-tenant-with-owner.dto.js';

// Aquí y no en TenantsController: crear un negocio también siembra roles y crea a su propietario,
// y TenantsModule no puede depender de esos módulos sin crear un ciclo
@Controller('tenants')
export class TenantProvisioningController {
  constructor(private readonly auth: AuthService) {}

  @Post()
  @SuperAdminOnly()
  create(@Body() dto: CreateTenantWithOwnerDto) {
    return this.auth.createTenant(dto);
  }
}
