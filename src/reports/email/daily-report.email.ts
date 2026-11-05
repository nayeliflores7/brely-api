import { escapeHtml } from '../../mail/escape-html.js';
import type { SalesReport } from '../report.builder.js';

export interface LowStockProduct {
  name: string;
  stock: number;
  minStock: number;
  unit: string;
}

export interface TerminalAlert {
  name: string;
  problem: string;
}

export interface DailyReportData {
  tenantName: string;
  timeZone: string;
  now: Date;
  report: SalesReport;
  previousTotal: number;
  lowStock: LowStockProduct[];
  terminalAlerts: TerminalAlert[];
  isTest?: boolean;
}

const PAYMENT_LABELS: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' };
const COLORS = { primary: '#1e40af', text: '#334155', heading: '#1e293b', muted: '#64748b', border: '#e2e8f0', zebra: '#f5f7fa', danger: '#991b1b', dangerBg: '#fee2e2', warningBg: '#fef3c7', warning: '#92400e', success: '#15803d', page: '#f8fafc' };

const money = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
const qty = (n: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 }).format(n);

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

export const localDay = (date: Date, timeZone: string) => localParts(date, timeZone).day;
export const localTime = (date: Date, timeZone: string) => localParts(date, timeZone).time;

/** La medianoche de hoy en esa zona, como instante real. */
export function localDayStart(now: Date, timeZone: string): Date {
  const day = localDay(now, timeZone);
  const asUtc = new Date(`${day}T00:00:00Z`);
  const shown = localParts(asUtc, timeZone);
  const shownAsUtc = Date.parse(`${shown.day}T${shown.time}:00Z`);
  return new Date(asUtc.getTime() + (asUtc.getTime() - shownAsUtc));
}

function comparison(total: number, previous: number): string {
  if (previous <= 0) return total > 0 ? 'Ayer a esta hora no había ventas' : '';
  const change = ((total - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)} % contra ayer a esta hora (${money(previous)})`;
}

const heading = (text: string) => `<h2 style="margin:24px 0 8px;font-size:16px;font-weight:600;color:${COLORS.heading}">${escapeHtml(text)}</h2>`;

function table(headers: { label: string; right?: boolean }[], rows: string[][]): string {
  const th = headers.map((h) => `<th style="padding:8px 10px;background:#f1f5f9;font-size:13px;font-weight:600;text-align:${h.right ? 'right' : 'left'};color:${COLORS.text}">${escapeHtml(h.label)}</th>`).join('');
  const body = rows.map((row, r) => `<tr style="background:${r % 2 ? COLORS.zebra : '#ffffff'}">${row.map((cell, i) => `<td style="padding:8px 10px;border-top:1px solid #f1f5f9;font-size:13px;color:${COLORS.text};text-align:${headers[i].right ? 'right' : 'left'}">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid ${COLORS.border}"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

const kpi = (label: string, value: string, note: string, color = COLORS.heading) => `<td width="50%" style="padding:12px 14px;border:1px solid ${COLORS.border};background:#ffffff;vertical-align:top"><div style="font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:${COLORS.muted}">${escapeHtml(label)}</div><div style="margin:4px 0;font-size:24px;font-weight:700;color:${color}">${escapeHtml(value)}</div><div style="font-size:12px;color:${COLORS.muted}">${escapeHtml(note)}</div></td>`;

const notice = (text: string, background: string, color: string) => `<p style="margin:12px 0 0;padding:10px 12px;background:${background};color:${color};font-size:13px;border-radius:6px">${escapeHtml(text)}</p>`;

export function renderDailyReport(data: DailyReportData) {
  const { report, timeZone, now } = data;
  const { totals } = report;
  const date = new Intl.DateTimeFormat('es-MX', { timeZone, dateStyle: 'full' }).format(now);
  const time = localTime(now, timeZone);
  const compared = comparison(totals.total, data.previousTotal);
  const p = 'profitability' in report ? report.profitability : null;
  const prefix = data.isTest ? '[Prueba] ' : '';
  const subject = `${prefix}${data.tenantName}: ${money(totals.total)} en ${totals.count} ${totals.count === 1 ? 'venta' : 'ventas'}`;

  const sections: string[] = [];

  sections.push(`<table role="presentation" width="100%" cellspacing="6" cellpadding="0" style="margin-top:12px"><tr>
    ${kpi('Total vendido', money(totals.total), compared || 'Con IVA', COLORS.primary)}
    ${kpi('Ventas', String(totals.count), totals.cancelledCount ? `${totals.cancelledCount} canceladas por ${money(totals.cancelledTotal)}` : 'Sin cancelaciones')}
  </tr><tr>
    ${kpi('Ticket promedio', money(totals.average), 'Con IVA')}
    ${p ? kpi('Utilidad', money(p.profit), `Margen de ${p.margin.toFixed(1)} %, sin IVA`, p.profit < 0 ? COLORS.danger : COLORS.heading) : kpi('Descuentos', money(totals.discount), 'Sin IVA')}
  </tr></table>`);

  if (data.terminalAlerts.length > 0) {
    sections.push(notice(`Puede faltar información: ${data.terminalAlerts.map((t) => `${t.name} (${t.problem})`).join(', ')}.`, COLORS.warningBg, COLORS.warning));
  }

  if (report.byTerminal.length > 0) {
    sections.push(heading('Por terminal'), table([{ label: 'Terminal' }, { label: 'Ventas', right: true }, { label: 'Total', right: true }], report.byTerminal.map((t) => [t.name, String(t.count), money(t.total)])));
  }
  if (report.byPayment.length > 0) {
    sections.push(heading('Formas de pago'), table([{ label: 'Forma de pago' }, { label: 'Importe', right: true }], report.byPayment.map((r) => [PAYMENT_LABELS[r.method] ?? r.method, money(r.amount)])));
  }

  if (report.promotions.rows.length > 0) {
    sections.push(heading('Promociones'), `<p style="margin:0 0 8px;font-size:13px;color:${COLORS.text}">Dejaron de entrar <strong>${escapeHtml(money(report.promotions.discount))}</strong> sin IVA, a precio de venta.${p ? ` Sin promociones la utilidad habría sido de ${escapeHtml(money(p.profitWithoutPromotions))}.` : ''}</p>`);
    sections.push(table([{ label: 'Promoción' }, { label: 'Piezas', right: true }, { label: 'Dejó de entrar', right: true }], report.promotions.rows.map((r) => [r.name, qty(r.units), money(r.discount)])));
  }
  if (p && p.belowCostLoss > 0) {
    sections.push(notice(`De tu bolsillo: ${money(p.belowCostLoss)} por vender bajo costo (${p.belowCost.map((b) => b.name).slice(0, 5).join(', ')}).`, COLORS.dangerBg, COLORS.danger));
  }
  if (p && p.linesWithoutCost > 0) {
    sections.push(notice(`${p.linesWithoutCost} líneas vendidas no tienen costo capturado: la utilidad se ve mayor a la real.`, COLORS.warningBg, COLORS.warning));
  }

  if (report.topProducts.length > 0) {
    sections.push(heading('Más vendidos'), table([{ label: 'Producto' }, { label: 'Cantidad', right: true }, { label: 'Vendido sin IVA', right: true }], report.topProducts.slice(0, 5).map((r) => [r.name, `${qty(r.quantity)} ${r.unit}`, money(r.amount)])));
  }

  if (report.cash.differences.length > 0) {
    sections.push(heading('Cortes con diferencia'), table([{ label: 'Terminal' }, { label: 'Turno', right: true }, { label: 'Diferencia', right: true }], report.cash.differences.map((d) => [d.terminalName, `#${d.number}`, money(d.difference)])));
  }

  if (data.lowStock.length > 0) {
    sections.push(heading('Stock bajo'), table([{ label: 'Producto' }, { label: 'Existencia', right: true }, { label: 'Mínimo', right: true }], data.lowStock.map((l) => [l.name, `${qty(l.stock)} ${l.unit}`, qty(l.minStock)])));
  }

  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:16px;background:${COLORS.page};font-family:Arial,Helvetica,sans-serif;color:${COLORS.text}">
<div style="max-width:600px;margin:0 auto;padding:20px;background:#ffffff;border:1px solid ${COLORS.border};border-radius:12px">
<div style="font-size:13px;font-weight:600;color:${COLORS.primary}">${data.isTest ? 'Correo de prueba · ' : ''}Resumen del día</div>
<h1 style="margin:4px 0 2px;font-size:22px;font-weight:700;color:#0f172a">${escapeHtml(data.tenantName)}</h1>
<div style="font-size:13px;color:${COLORS.muted}">${escapeHtml(date)}, hasta las ${escapeHtml(time)}</div>
${sections.join('\n')}
<p style="margin:24px 0 0;padding-top:12px;border-top:1px solid ${COLORS.border};font-size:12px;color:${COLORS.muted}">Enviado por Brely. Las ventas de una terminal aparecen aquí cuando esa terminal sincroniza.</p>
</div></body></html>`;

  const text = [
    `${prefix}Resumen del día: ${data.tenantName}`,
    `${date}, hasta las ${time}`,
    '',
    `Total vendido: ${money(totals.total)}`,
    compared,
    `Ventas: ${totals.count}. Canceladas: ${totals.cancelledCount}.`,
    `Ticket promedio: ${money(totals.average)}`,
    ...(p ? [`Utilidad: ${money(p.profit)}`] : []),
    `Dejó de entrar por promociones: ${money(report.promotions.discount)}`,
    ...(p && p.belowCostLoss > 0 ? [`De tu bolsillo, por vender bajo costo: ${money(p.belowCostLoss)}`] : []),
    ...report.byTerminal.map((t) => `${t.name}: ${money(t.total)}`),
    ...data.terminalAlerts.map((t) => `Puede faltar información de ${t.name}: ${t.problem}`),
    ...data.lowStock.map((l) => `Stock bajo: ${l.name} (${qty(l.stock)} ${l.unit})`),
  ].filter((line, i) => line !== '' || i === 2).join('\n');

  return { subject, html, text };
}
