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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: PriceHistory.name, schema: PriceHistorySchema },
    ]),
    CategoriesModule,
    UnitsModule,
    SyncModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, ProductPushHandler],
  exports: [ProductsService],
})
export class ProductsModule {}