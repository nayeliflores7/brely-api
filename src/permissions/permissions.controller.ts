import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { PermissionsService } from './permissions.service.js';
import { CreatePermissionDto } from './dto/create-permission.dto.js';
import { UpdatePermissionDto } from './dto/update-permission.dto.js';
import { RequirePermissions, SuperAdminOnly } from '../common/decorators.js';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  // Los admins de tenant lo necesitan para armar sus roles
  @Get()
  @RequirePermissions('roles.manage')
  findAll() {
    return this.permissions.findAll();
  }

  @Post()
  @SuperAdminOnly()
  create(@Body() dto: CreatePermissionDto) {
    return this.permissions.create(dto);
  }

  @Patch(':key')
  @SuperAdminOnly()
  update(@Param('key') key: string, @Body() dto: UpdatePermissionDto) {
    return this.permissions.update(key, dto);
  }

  @Delete(':key')
  @SuperAdminOnly()
  @HttpCode(204)
  remove(@Param('key') key: string) {
    return this.permissions.remove(key);
  }
}