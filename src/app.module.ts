import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TenantsModule } from './tenants/tenants.module.js';
import { RolesModule } from './roles/roles.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PermissionsModule } from './permissions/permissions.module.js';
import { SyncModule } from './sync/sync.module.js';
import { TerminalsModule } from './terminals/terminals.module.js';
import { CashModule } from './cash/cash.module.js';
import { SalesModule } from './sales/sales.module.js';
import { StockModule } from './stock/stock.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({ uri: c.getOrThrow('MONGO_URI') }),
    }),
    TenantsModule,
    RolesModule,
    UsersModule,
    AuthModule,
    PermissionsModule,
    TerminalsModule,
    SyncModule,
    StockModule,
    CashModule,
    SalesModule,
  ],
})
export class AppModule {}
