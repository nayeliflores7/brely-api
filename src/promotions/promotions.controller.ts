import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { RequirePermissions, TenantId } from '../common/decorators.js';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto.js';
import { PromotionsService } from './promotions.service.js';

@Controller('promotions')
@RequirePermissions('promotions.manage')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.promotions.findAll(tenantId);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreatePromotionDto) {
    return this.promotions.create(tenantId, dto);
  }

  @Patch(':id')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotions.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.promotions.remove(tenantId, id);
  }
}
