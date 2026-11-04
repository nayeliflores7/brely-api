import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { RolesService } from './roles.service.js';
import { UsersService } from '../users/users.service.js';
import {
  CurrentUser,
  RequirePermissions,
  TenantId,
} from '../common/decorators.js';
import type { AuthUser } from '../common/auth.types.js';

@Controller('roles')
@RequirePermissions('roles.manage')
export class RolesController {
  constructor(
    private readonly roles: RolesService,
    private readonly users: UsersService,
  ) {}

  @Post()
  create(
    @TenantId() tenantId: string,
    @CurrentUser() u: AuthUser,
    @Body() dto: CreateRoleDto,
  ) {
    return this.roles.create(tenantId, dto, u.isSuperAdmin);
  }

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.roles.findAll(tenantId);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.roles.findOne(tenantId, id);
  }

  @Patch(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.roles.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@TenantId() tenantId: string, @Param('id') id: string) {
    if (await this.users.countByRole(tenantId, id)) {
      throw new ConflictException('Role is assigned to active users');
    }
    return this.roles.softDelete(tenantId, id);
  }
}
