import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import { ReportsModule } from '../reports/reports.module.js';
import { Sale, SaleSchema } from '../sales/schemas/sale.schema.js';
import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';
import { FixedExpense, FixedExpenseSchema } from './schemas/fixed-expense.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FixedExpense.name, schema: FixedExpenseSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Sale.name, schema: SaleSchema },
    ]),
    ReportsModule,
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
