import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { StockService } from './stock.service.js';
import { CreateStockMovementDto, ListStockQuery } from './dto/stock.dto.js';
import { CurrentUser, RequirePermissions, TenantId } from '../common/decorators.js';
import type { AuthUser } from '../common/auth.types.js';

@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get('movements')
  @RequirePermissions('inventory.view')
  list(@TenantId() tenantId: string, @Query() q: ListStockQuery) {
    return this.stock.list(tenantId, q);
  }

  @Post('movements')
  @RequirePermissions('stock.adjust')
  create(@TenantId() tenantId: string, @CurrentUser() u: AuthUser, @Body() dto: CreateStockMovementDto) {
    return this.stock.createManual(tenantId, u.id, dto);
  }

  @Get('reconcile')
  @RequirePermissions('stock.adjust')
  report(@TenantId() tenantId: string) {
    return this.stock.reconcileReport(tenantId);
  }

  @Post('reconcile')
  @HttpCode(200)
  @RequirePermissions('stock.adjust')
  repair(@TenantId() tenantId: string) {
    return this.stock.reconcileRepair(tenantId);
  }
}