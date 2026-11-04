import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema.js';
import { PriceHistory, PriceHistorySchema } from './schemas/price-history.schema.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { ProductPushHandler } from './product-push.handler.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { UnitsModule } from '../units/units.module.js';
import { SyncModule } from '../sync/sync.module.js';
import { StockModule } from '../stock/stock.module.js';
import { SuperAdminsModule } from '../super-admins/super-admins.module.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: PriceHistory.name, schema: PriceHistorySchema },
      { name: User.name, schema: UserSchema },
    ]),
    CategoriesModule,
    UnitsModule,
    SyncModule,
    StockModule,
    SuperAdminsModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, ProductPushHandler],
  exports: [ProductsService],
})
export class ProductsModule {}