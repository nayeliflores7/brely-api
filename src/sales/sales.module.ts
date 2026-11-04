import { UsersModule } from '../users/users.module.js';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Sale, SaleSchema } from './schemas/sale.schema.js';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import { Terminal, TerminalSchema } from '../terminals/schemas/terminal.schema.js';
import { Counter, CounterSchema } from '../common/counter.schema.js';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';
import {
  CashMovementPushHandler, CashSessionPushHandler, SalePushHandler, StockMovementPushHandler,
} from './push-handlers.js';
import { StockModule } from '../stock/stock.module.js';
import { CashModule } from '../cash/cash.module.js';
import { SyncModule } from '../sync/sync.module.js';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: Sale.name, schema: SaleSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Terminal.name, schema: TerminalSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
    StockModule,
    CashModule,
    SyncModule,
  ],
  controllers: [SalesController],
  providers: [
    SalesService,
    SalePushHandler, CashSessionPushHandler, CashMovementPushHandler, StockMovementPushHandler,
  ],
})
export class SalesModule {}