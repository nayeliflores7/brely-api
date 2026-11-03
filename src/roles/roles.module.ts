import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';
import { Role, RoleSchema } from './schemas/role.schema.js';
import { UsersModule } from '../users/users.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Role.name, schema: RoleSchema }]),
    forwardRef(() => UsersModule),
    PermissionsModule
  ],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}