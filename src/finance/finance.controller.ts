import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../common/auth.types.js';
import { CurrentUser, RequirePermissions, TenantId } from '../common/decorators.js';
import { CreateFixedExpenseDto, ProductProfitQuery, SummaryQuery, UpdateFixedExpenseDto } from './dto/fixed-expense.dto.js';
import { FinanceService } from './finance.service.js';

@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('summary')
  @RequirePermissions('finance.view')
  summary(@TenantId() tenantId: string, @Query() q: SummaryQuery) {
    return this.finance.summary(tenantId, q.tz);
  }

  @Get('products')
  @RequirePermissions('finance.view')
  products(@TenantId() tenantId: string, @Query() q: ProductProfitQuery) {
    return this.finance.productProfit(tenantId, q.period, q.tz);
  }

  @Get('expenses')
  @RequirePermissions('finance.view')
  list(@TenantId() tenantId: string) {
    return this.finance.listExpenses(tenantId);
  }

  @Post('expenses')
  @RequirePermissions('finance.manage')
  create(@TenantId() tenantId: string, @CurrentUser() user: AuthUser, @Body() dto: CreateFixedExpenseDto) {
    return this.finance.createExpense(tenantId, user.id, dto);
  }

  @Patch('expenses/:id')
  @RequirePermissions('finance.manage')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateFixedExpenseDto) {
    return this.finance.updateExpense(tenantId, id, dto);
  }

  @Delete('expenses/:id')
  @HttpCode(200)
  @RequirePermissions('finance.manage')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.finance.removeExpense(tenantId, id);
  }
}
