import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { SalesService } from './sales.service.js';
import { CancelSaleDto, CreateSaleDto, ListSalesQuery } from './dto/sale.dto.js';
import { CurrentUser, RequirePermissions, TenantId } from '../common/decorators.js';
import type { AuthUser } from '../common/auth.types.js';

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @RequirePermissions('sales.view')
  list(@TenantId() tenantId: string, @Query() q: ListSalesQuery) {
    return this.sales.list(tenantId, q);
  }

  @Get(':id')
  @RequirePermissions('sales.view')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.sales.findOne(tenantId, id);
  }

  @Post()
  @RequirePermissions('sales.create')
  create(@TenantId() tenantId: string, @CurrentUser() u: AuthUser, @Body() dto: CreateSaleDto) {
    return this.sales.createFromAdmin(tenantId, u, dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('sales.cancel')
  cancel(
    @TenantId() tenantId: string,
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: CancelSaleDto,
  ) {
    return this.sales.cancelFromAdmin(tenantId, u, id, dto.reason);
  }
}