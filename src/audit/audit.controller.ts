import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions, SuperAdminOnly, TenantId } from '../common/decorators.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { AuditService } from './audit.service.js';
import { ListAuditQuery, ListPlatformAuditQuery } from './dto/audit.dto.js';

// Solo lectura: la bitácora no se edita ni se borra
@Controller('audit')
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly tenants: TenantsService,
  ) {}

  @Get()
  @RequirePermissions('audit.view')
  list(@TenantId() tenantId: string, @Query() q: ListAuditQuery) {
    return this.audit.listForTenant(tenantId, q);
  }

  // Todos los negocios, y lo que no pertenece a ninguno, como el login del super admin
  @Get('platform')
  @SuperAdminOnly()
  async platform(@Query() q: ListPlatformAuditQuery) {
    const [result, tenants] = await Promise.all([
      this.audit.listPlatform(q),
      this.tenants.findAll(),
    ]);
    const names = new Map(tenants.map((tenant) => [tenant._id, tenant.name]));
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        tenantName: item.tenantId ? (names.get(item.tenantId) ?? '') : '',
      })),
    };
  }
}
