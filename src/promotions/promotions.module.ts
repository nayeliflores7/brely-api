import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Category, CategorySchema } from '../categories/schemas/category.schema.js';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import { SyncModule } from '../sync/sync.module.js';
import { PromotionPushHandler } from './promotion-push.handler.js';
import { PromotionsController } from './promotions.controller.js';
import { PromotionsService } from './promotions.service.js';
import { Promotion, PromotionSchema } from './schemas/promotion.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Promotion.name, schema: PromotionSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Category.name, schema: CategorySchema },
    ]),
    SyncModule,
  ],
  controllers: [PromotionsController],
  providers: [PromotionsService, PromotionPushHandler],
})
export class PromotionsModule {}
