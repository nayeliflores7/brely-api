import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { RequirePermissions, TenantId } from '../common/decorators.js';
import { RestockQuery } from './dto/restock.dto.js';
import { DEFAULT_RESTOCK_MARGIN, RestockService } from './restock.service.js';
import { DEFAULT_COVER_DAYS } from './restock.js';

// Lo mismo que se necesita para ver las existencias: no hace falta poder ver reportes
@Controller('stock/restock')
@RequirePermissions('inventory.view')
export class RestockController {
  constructor(private readonly restock: RestockService) {}

  @Get()
  list(@TenantId() tenantId: string, @Query() q: RestockQuery) {
    return this.restock.list(tenantId, q.margin ?? DEFAULT_RESTOCK_MARGIN, q.days ?? DEFAULT_COVER_DAYS);
  }

  @Get('export')
  async export(@TenantId() tenantId: string, @Query() q: RestockQuery) {
    const file = await this.restock.pdf(tenantId, q.margin ?? DEFAULT_RESTOCK_MARGIN, q.days ?? DEFAULT_COVER_DAYS, q.tz);
    return new StreamableFile(file, { type: 'application/pdf', disposition: 'attachment; filename="lista-de-resurtido.pdf"' });
  }
}
