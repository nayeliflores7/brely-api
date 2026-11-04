import { Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientSession } from 'mongoose';
import { UnitsService } from './units.service.js';
import { CreateUnitDto } from './dto/unit.dto.js';
import { SyncService } from '../sync/sync.service.js';
import { asRejection, parsePayload } from '../sync/payload.util.js';
import { PushHandler, PushOp, RejectedOpError, SyncContext } from '../sync/sync.types.js';

@Injectable()
export class UnitPushHandler implements PushHandler, OnModuleInit {
  readonly entity = 'unit';

  constructor(
    private readonly units: UnitsService,
    private readonly sync: SyncService,
  ) {}

  onModuleInit() {
    this.sync.register(this);
  }

  async handle(ctx: SyncContext, op: PushOp, session: ClientSession) {
    if (op.action !== 'create' && op.action !== 'update') {
      throw new RejectedOpError(`Unknown action: ${op.action}`);
    }

    const { code, ...fields } = await parsePayload(CreateUnitDto, op.payload);
    await asRejection(async () => {
      if (op.action === 'update' && (await this.units.existsGlobal(code, session))) {
        throw new RejectedOpError('Global units cannot be modified');
      }
      return (await this.units.existsOwn(ctx.tenantId, code, session))
        ? this.units.update(ctx.tenantId, code, fields, session)
        : this.units.create(ctx.tenantId, { code, ...fields }, session);
    });
  }
}
