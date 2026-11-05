import type { TerminalAlert } from './email/daily-report.email.js';

const SYNC_LATE_MS = 10 * 60_000;

/** Alertas de terminales en uso: sus ventas sin sincronizar no están en los reportes. */
export function terminalAlerts(
  terminals: { name: string; active: boolean; activatedAt: Date | null; lastSyncedAt?: Date | null; syncRejected?: number; lastSyncFailed?: boolean }[],
  now: Date,
): TerminalAlert[] {
  const alerts: TerminalAlert[] = [];
  for (const terminal of terminals) {
    if (!terminal.active || !terminal.activatedAt) continue;
    if (terminal.syncRejected) alerts.push({ name: terminal.name, problem: `${terminal.syncRejected} operaciones rechazadas` });
    else if (terminal.lastSyncFailed) alerts.push({ name: terminal.name, problem: 'su última sincronización falló' });
    else if (!terminal.lastSyncedAt) alerts.push({ name: terminal.name, problem: 'aún no reporta sincronización' });
    else if (now.getTime() - new Date(terminal.lastSyncedAt).getTime() > SYNC_LATE_MS) alerts.push({ name: terminal.name, problem: 'lleva más de 10 minutos sin sincronizar' });
  }
  return alerts;
}
