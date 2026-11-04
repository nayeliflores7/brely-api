import { Controller, Get } from '@nestjs/common';
import { PermissionsService } from './permissions.service.js';
import { RequirePermissions } from '../common/decorators.js';

// Catálogo fijo: lo define el código y lo siembra el seeder. Solo se asignan a roles.
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get()
  @RequirePermissions('roles.manage')
  findAll() {
    return this.permissions.findAll();
  }
}
