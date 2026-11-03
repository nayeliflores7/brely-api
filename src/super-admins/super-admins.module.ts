import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SuperAdmin, SuperAdminSchema } from './schemas/super-admin.schema.js';
import { SuperAdminsService } from './super-admins.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: SuperAdmin.name, schema: SuperAdminSchema }])],
  providers: [SuperAdminsService],
  exports: [SuperAdminsService],
})
export class SuperAdminsModule {}