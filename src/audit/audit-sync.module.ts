import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuditPushHandler } from './audit-push.handler.js';
import { AuditModule } from './audit.module.js';

@Module({
  imports: [AuditModule, SyncModule, UsersModule],
  providers: [AuditPushHandler],
})
export class AuditSyncModule {}
