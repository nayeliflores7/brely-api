import { Controller, Get, Query } from '@nestjs/common';
import type { AuthUser } from '../common/auth.types.js';
import { CurrentUser, RequirePermissions, SuperAdminOnly, TenantId } from '../common/decorators.js';
import { DashboardService } from './dashboard.service.js';
import { ReportQuery } from './dto/report.dto.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermissions('reports.view')
  business(@TenantId() tenantId: string, @CurrentUser() user: AuthUser, @Query() q: ReportQuery) {
    return this.dashboard.business(tenantId, q.tz, user.isSuperAdmin || user.permissions.includes('costs.view'));
  }

  @Get('platform')
  @SuperAdminOnly()
  platform(@Query() q: ReportQuery) {
    return this.dashboard.platform(q.tz);
  }
}
