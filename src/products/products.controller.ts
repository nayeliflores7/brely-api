import {
  Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { AdjustPriceDto, CreateProductWithStockDto, ListProductsQuery, UpdateProductDto } from './dto/product.dto.js';
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

// Ajustar precios: quien administra productos o quien tiene el permiso propio. El super admin siempre puede.
function assertCanAdjustPrice(user: AuthUser) {
  const allowed =
    user.isSuperAdmin || user.permissions.includes('products.manage') || user.permissions.includes('products.price');
  if (!allowed) throw new ForbiddenException('Missing permissions');
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
  priceHistory(@TenantId() tenantId: string, @CurrentUser() u: AuthUser, @Param('id') id: string) {
    assertCanAdjustPrice(u);
    return this.products.priceHistory(tenantId, id);
  }

  // Solo precio, costo e IVA: no deja tocar nada más del producto
  @Patch(':id/price')
  adjustPrice(
    @TenantId() tenantId: string,
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdjustPriceDto,
  ) {
    assertCanAdjustPrice(u);
    const { price, cost, taxRate } = dto;
    return this.products.update(
      tenantId,
      id,
      { ...(price !== undefined && { price }), ...(cost !== undefined && { cost }), ...(taxRate !== undefined && { taxRate }) },
      { userId: u.id },
    );
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