import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { TenantsService } from './tenants.service.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import {
  RequirePermissions,
  SuperAdminOnly,
  TenantId,
} from '../common/decorators.js';

@Controller('tenants')
@RequirePermissions('settings.manage')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  // Rutas fijas ("me") antes que ":id"
  @Get('me')
  me(@TenantId() tenantId: string) {
    return this.tenants.findOne(tenantId);
  }

  @Get('me/defaults')
  @RequirePermissions()
  defaults(@TenantId() tenantId: string) {
    return this.tenants.defaults(tenantId);
  }

  @Patch('me')
  updateMe(@TenantId() tenantId: string, @Body() dto: UpdateTenantDto) {
    return this.tenants.update(tenantId, dto);
  }

  @Get()
  @SuperAdminOnly()
  findAll() {
    return this.tenants.findAll();
  }

  @Get(':id')
  @SuperAdminOnly()
  findOne(@Param('id') id: string) {
    return this.tenants.findOne(id);
  }

  @Patch(':id')
  @SuperAdminOnly()
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenants.update(id, dto);
  }

  @Post(':id/restore')
  @SuperAdminOnly()
  @HttpCode(200)
  restore(@Param('id') id: string) {
    return this.tenants.restore(id);
  }

  @Delete(':id')
  @SuperAdminOnly()
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.tenants.remove(id);
  }
}
