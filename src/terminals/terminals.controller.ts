import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { TerminalsService, type TerminalWithCode } from './terminals.service.js';
import { ActivateDto, CreateTerminalDto, UpdateTerminalDto } from './dto/terminal.dto.js';
import { Public, RequirePermissions, TenantId } from '../common/decorators.js';

@Controller('terminals')
export class TerminalsController {
  constructor(private readonly terminals: TerminalsService) {}

  // El POS canjea el código (sin JWT)
  @Public()
  @Post('activate')
  @HttpCode(200)
  activate(@Body() dto: ActivateDto) {
    return this.terminals.activate(dto);
  }

  @Post()
  @RequirePermissions('terminals.manage')
  create(@TenantId() tenantId: string, @Body() dto: CreateTerminalDto): Promise<TerminalWithCode> {
    return this.terminals.create(tenantId, dto);
  }

  @Get()
  @RequirePermissions('terminals.manage')
  findAll(@TenantId() tenantId: string) {
    return this.terminals.findAll(tenantId);
  }

  @Patch(':id')
  @RequirePermissions('terminals.manage')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateTerminalDto) {
    return this.terminals.update(tenantId, id, dto);
  }

  @Post(':id/reset-activation')
  @HttpCode(200)
  @RequirePermissions('terminals.manage')
  reset(@TenantId() tenantId: string, @Param('id') id: string): Promise<TerminalWithCode> {
    return this.terminals.resetActivation(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('terminals.manage')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.terminals.remove(tenantId, id);
  }
}