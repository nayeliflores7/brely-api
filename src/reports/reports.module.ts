import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CashSession, CashSessionSchema } from '../cash/schemas/cash-session.schema.js';
import { Sale, SaleSchema } from '../sales/schemas/sale.schema.js';
import { AuditModule } from '../audit/audit.module.js';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { TerminalsModule } from '../terminals/terminals.module.js';
import { MailModule } from '../mail/mail.module.js';
import { ReportEmailController } from './email/report-email.controller.js';
import { ReportEmailService } from './email/report-email.service.js';
import { ReportEmailSettings, ReportEmailSettingsSchema } from './email/report-email-settings.schema.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sale.name, schema: SaleSchema },
      { name: CashSession.name, schema: CashSessionSchema },
      { name: Product.name, schema: ProductSchema },
      { name: ReportEmailSettings.name, schema: ReportEmailSettingsSchema },
    ]),
    AuditModule,
    MailModule,
    TenantsModule,
    TerminalsModule,
  ],
  controllers: [ReportsController, ReportEmailController, DashboardController],
  providers: [ReportsService, ReportEmailService, DashboardService],
})
export class ReportsModule {}
