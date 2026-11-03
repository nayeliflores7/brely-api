import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { CreateProductDto, ListProductsQuery, UpdateProductDto } from './dto/product.dto.js';
import { CurrentUser, RequirePermissions, TenantId } from '../common/decorators.js';
import type { AuthUser } from '../common/auth.types.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  findAll(@TenantId() tenantId: string, @Query() q: ListProductsQuery) {
    return this.products.findAll(tenantId, q);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.products.findOne(tenantId, id);
  }

  @Get(':id/price-history')
  priceHistory(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.products.priceHistory(tenantId, id);
  }

  @Post()
  @RequirePermissions('products.create')
  create(@TenantId() tenantId: string, @CurrentUser() u: AuthUser, @Body() dto: CreateProductDto) {
    return this.products.create(tenantId, dto, { userId: u.id });
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