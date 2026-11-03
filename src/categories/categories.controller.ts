import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CategoriesService } from './categories.service.js';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto.js';
import { RequirePermissions, TenantId } from '../common/decorators.js';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.categories.findAll(tenantId);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.categories.findOne(tenantId, id);
  }

  @Post()
  @RequirePermissions('catalogs.manage')
  create(@TenantId() tenantId: string, @Body() dto: CreateCategoryDto) {
    return this.categories.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions('catalogs.manage')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('catalogs.manage')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.categories.remove(tenantId, id);
  }
}