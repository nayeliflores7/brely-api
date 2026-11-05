import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { RequirePermissions, TenantId } from '../../common/decorators.js';
import { SaveReportEmailDto } from './report-email.dto.js';
import { ReportEmailService } from './report-email.service.js';

@Controller('reports/email-settings')
@RequirePermissions('settings.manage')
export class ReportEmailController {
  constructor(private readonly email: ReportEmailService) {}

  @Get()
  get(@TenantId() tenantId: string) {
    return this.email.get(tenantId);
  }

  @Put()
  save(@TenantId() tenantId: string, @Body() dto: SaveReportEmailDto) {
    return this.email.save(tenantId, dto);
  }

  @Post('test')
  @HttpCode(200)
  test(@TenantId() tenantId: string) {
    return this.email.sendTest(tenantId);
  }
}
