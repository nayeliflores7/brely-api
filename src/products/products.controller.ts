import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { CreateProductWithStockDto, ListProductsQuery, UpdateProductDto } from './dto/product.dto.js';
import { CurrentUser, RequirePermissions, TenantId } from '../common/decorators.js';
import type { AuthUser } from '../common/auth.types.js';

// Igual que en el POS: los costos son para quien tiene costs.view o administra productos
function forViewer<T extends { cost: number }>(product: T, user: AuthUser): T {
  const seesCosts =
    user.isSuperAdmin ||
    user.permissions.includes('costs.view') ||
    user.permissions.includes('products.manage');
  return seesCosts ? product : { ...product, cost: 0 };
}

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  async findAll(
    @TenantId() tenantId: string,
    @CurrentUser() u: AuthUser,
    @Query() q: ListProductsQuery,
  ) {
    const result = await this.products.findAll(tenantId, q);
    return { ...result, items: result.items.map((p) => forViewer(p, u)) };
  }

  @Get(':id')
  async findOne(@TenantId() tenantId: string, @CurrentUser() u: AuthUser, @Param('id') id: string) {
    return forViewer(await this.products.findOne(tenantId, id), u);
  }

  @Get(':id/price-history')
  @RequirePermissions('products.manage')
  priceHistory(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.products.priceHistory(tenantId, id);
  }

  @Post()
  @RequirePermissions('products.create')
  create(
    @TenantId() tenantId: string,
    @CurrentUser() u: AuthUser,
    @Body() dto: CreateProductWithStockDto,
  ) {
    return this.products.createWithStock(tenantId, dto, u.id);
  }

  @Patch(':id')
  @RequirePermissions('products.manage')
  update(
    @TenantId() tenantId: string,
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(tenantId, id, dto, { userId: u.id });
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('products.manage')
  remove(@TenantId() tenantId: string, @CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.products.remove(tenantId, id, { userId: u.id });
  }
}