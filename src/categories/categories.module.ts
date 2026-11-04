import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Category, CategorySchema } from './schemas/category.schema.js';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';
import { CategoryPushHandler } from './category-push.handler.js';
import { SyncModule } from '../sync/sync.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    SyncModule,
  ],
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoryPushHandler],
  exports: [CategoriesService],
})
export class CategoriesModule {}