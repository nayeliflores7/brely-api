import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { UnitsService } from './units.service.js';
import { CreateUnitDto, UpdateUnitDto } from './dto/unit.dto.js';
import { RequirePermissions, TenantId } from '../common/decorators.js';

@Controller('units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.units.findAll(tenantId);
  }

  @Post()
  @RequirePermissions('catalogs.manage')
  create(@TenantId() tenantId: string, @Body() dto: CreateUnitDto) {
    return this.units.create(tenantId, dto);
  }

  @Patch(':code')
  @RequirePermissions('catalogs.manage')
  update(@TenantId() tenantId: string, @Param('code') code: string, @Body() dto: UpdateUnitDto) {
    return this.units.update(tenantId, code, dto);
  }

  @Delete(':code')
  @HttpCode(204)
  @RequirePermissions('catalogs.manage')
  remove(@TenantId() tenantId: string, @Param('code') code: string) {
    return this.units.remove(tenantId, code);
  }
}