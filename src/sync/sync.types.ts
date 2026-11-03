import type { ClientSession, Model } from 'mongoose';

export interface SyncContext {
  tenantId: string;
  terminalId: string;
}

export interface PushOp {
  opId: string;
  entity: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PushHandler {
  entity: string;
  handle(ctx: SyncContext, op: PushOp, session: ClientSession): Promise<void>;
}

export interface PullDef {
  model: Model<any>;
  filter: (ctx: SyncContext) => Record<string, unknown>;
  select?: string;
  // Lista blanca explícita: lo que no está aquí nunca sale hacia el POS
  map: (d: any) => Record<string, unknown>;
}

// El handler la lanza cuando la operación nunca podrá aplicarse (dato inválido)
export class RejectedOpError extends Error {}

export type PushStatus = 'ok' | 'rejected' | 'unsupported' | 'error' | 'skipped';
export interface PushResult {
  opId: string;
  status: PushStatus;
  error?: string;
}