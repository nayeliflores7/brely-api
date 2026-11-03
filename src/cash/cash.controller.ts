import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CashService } from './cash.service.js';
import { CloseSessionDto, CreateCashMovementDto, ListSessionsQuery } from './dto/cash.dto.js';
import { CurrentUser, RequirePermissions, TenantId } from '../common/decorators.js';
import type { AuthUser } from '../common/auth.types.js';

@Controller('cash')
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Get('sessions')
  @RequirePermissions('sales.view')
  sessions(@TenantId() tenantId: string, @Query() q: ListSessionsQuery) {
    return this.cash.listSessions(tenantId, q);
  }

  @Get('sessions/:id')
  @RequirePermissions('sales.view')
  detail(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.cash.detail(tenantId, id);
  }

  @Post('sessions/:id/close')
  @HttpCode(200)
  @RequirePermissions('cash.manage')
  close(
    @TenantId() tenantId: string,
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: CloseSessionDto,
  ) {
    return this.cash.closeFromAdmin(tenantId, u.id, id, dto);
  }

  @Post('movements')
  @RequirePermissions('cash.movements')
  movement(@TenantId() tenantId: string, @CurrentUser() u: AuthUser, @Body() dto: CreateCashMovementDto) {
    return this.cash.addMovementFromAdmin(tenantId, u.id, dto);
  }
}