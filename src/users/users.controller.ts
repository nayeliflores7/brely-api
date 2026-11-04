import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';
import { RequirePermissions, TenantId  } from '../common/decorators.js';


@Controller('users')
@RequirePermissions('users.manage')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateUserDto) {
    return this.users.create(tenantId, dto);
  }

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.users.findAll(tenantId);
  }

  @Get('role-options')
  roleOptions(@TenantId() tenantId: string) {
    return this.users.roleOptions(tenantId);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.users.findOne(tenantId, id);
  }

  @Patch(':id')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.users.remove(tenantId, id);
  }
}
