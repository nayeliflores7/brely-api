import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { SalesService } from './sales.service.js';
import { CancelSaleDto, CreateSaleDto, ListSalesQuery } from './dto/sale.dto.js';
import { CurrentUser, RequirePermissions, TenantId } from '../common/decorators.js';
import type { AuthUser } from '../common/auth.types.js';

// Igual que en el POS: la utilidad de una venta solo es para quien tiene costs.view
function forViewer<T extends { items: { unitCost: number }[] }>(sale: T, user: AuthUser): T {
  if (user.isSuperAdmin || user.permissions.includes('costs.view')) return sale;
  return { ...sale, items: sale.items.map((item) => ({ ...item, unitCost: 0 })) };
}

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @RequirePermissions('sales.view')
  async list(
    @TenantId() tenantId: string,
    @CurrentUser() u: AuthUser,
    @Query() q: ListSalesQuery,
  ) {
    const result = await this.sales.list(tenantId, q);
    return { ...result, items: result.items.map((sale) => forViewer(sale, u)) };
  }

  @Get(':id')
  @RequirePermissions('sales.view')
  async findOne(@TenantId() tenantId: string, @CurrentUser() u: AuthUser, @Param('id') id: string) {
    return forViewer(await this.sales.findOne(tenantId, id), u);
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