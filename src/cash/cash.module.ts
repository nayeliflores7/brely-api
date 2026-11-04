import { UsersModule } from '../users/users.module.js';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CashSession, CashSessionSchema } from './schemas/cash-session.schema.js';
import { CashMovement, CashMovementSchema } from './schemas/cash-movement.schema.js';
import { Sale, SaleSchema } from '../sales/schemas/sale.schema.js';
import { CashController } from './cash.controller.js';
import { CashService } from './cash.service.js';
import { SyncModule } from '../sync/sync.module.js';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: CashSession.name, schema: CashSessionSchema },
      { name: CashMovement.name, schema: CashMovementSchema },
      { name: Sale.name, schema: SaleSchema }, // solo lectura, para el corte
    ]),
    SyncModule,
  ],
  controllers: [CashController],
  providers: [CashService],
  exports: [CashService],
})
export class CashModule {}