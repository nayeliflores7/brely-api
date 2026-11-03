import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Unit, UnitSchema } from './schemas/unit.schema.js';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import { UnitsController } from './units.controller.js';
import { UnitsService } from './units.service.js';
import { SyncModule } from '../sync/sync.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Unit.name, schema: UnitSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    SyncModule,
  ],
  controllers: [UnitsController],
  providers: [UnitsService],
  exports: [UnitsService],
})
export class UnitsModule {}