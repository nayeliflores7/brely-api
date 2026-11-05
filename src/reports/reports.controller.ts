import { Controller, Get, Header, Query, StreamableFile } from '@nestjs/common';
import type { AuthUser } from '../common/auth.types.js';
import { CurrentUser, RequirePermissions, TenantId } from '../common/decorators.js';
import { ReportQuery } from './dto/report.dto.js';
import { ReportsService } from './reports.service.js';

const canSeeCosts = (user: AuthUser) => user.isSuperAdmin || user.permissions.includes('costs.view');

@Controller('reports')
@RequirePermissions('reports.view')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  sales(@TenantId() tenantId: string, @CurrentUser() user: AuthUser, @Query() q: ReportQuery) {
    return this.reports.salesReport(tenantId, q, canSeeCosts(user));
  }

  @Get('sales/export')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="reporte-de-ventas.xlsx"')
  async export(@TenantId() tenantId: string, @CurrentUser() user: AuthUser, @Query() q: ReportQuery) {
    return new StreamableFile(await this.reports.excel(tenantId, q, canSeeCosts(user)));
  }
}
