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

// Cada módulo de negocio (ventas, productos...) registra un handler para su entidad
export interface PushHandler {
  entity: string;
  handle(ctx: SyncContext, op: PushOp): Promise<void>;
}

// El handler la lanza cuando la operación nunca podrá aplicarse (dato inválido)
export class RejectedOpError extends Error {}

export type PushStatus = 'ok' | 'rejected' | 'unsupported' | 'error' | 'skipped';
export interface PushResult {
  opId: string;
  status: PushStatus;
  error?: string;
}