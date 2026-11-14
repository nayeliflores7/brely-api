import { buildReport } from '../report.builder.js';
import { escapeHtml } from '../../mail/escape-html.js';
import { localDay, localDayStart, localTime, renderDailyReport } from './daily-report.email.js';
import { mailErrorMessage } from '../../mail/mailer.service.js';
import { terminalAlerts } from '../terminal-alerts.js';
import { isDue } from './report-email.service.js';

const timeZone = 'America/Mexico_City';
// 21:30 del 4 de noviembre en México (UTC-6)
const now = new Date('2026-11-05T03:30:00Z');

const sale = (values = {}) => ({
  terminalId: 't1',
  soldAt: new Date('2026-11-04T20:00:00Z'),
  status: 'completed',
  subtotal: 20,
  tax: 3.2,
  total: 23.2,
  discount: 10,
  items: [{ productId: 'p', name: 'REFRESCO', unit: 'pza', unitPrice: 10, unitCost: 6, quantity: 3, discount: 10, promotionName: '3X2' }],
  payments: [{ method: 'cash', amount: 23.2 }],
  ...values,
});

const report = (includeCosts = true, sales: ReturnType<typeof sale>[] = [sale()]) =>
  buildReport(sales, [], {
    timeZone,
    includeCosts,
    from: localDayStart(now, timeZone),
    to: now,
    terminalLabel: () => 'Caja 1',
  });

const render = (values = {}) =>
  renderDailyReport({
    tenantName: 'Mi Tienda',
    timeZone,
    now,
    report: report(),
    previousTotal: 0,
    lowStock: [],
    terminalAlerts: [],
    ...values,
  });

describe('fechas en la zona del negocio', () => {
  it('usa el día y la hora locales', () => {
    expect(localDay(now, timeZone)).toBe('2026-11-04');
    expect(localTime(now, timeZone)).toBe('21:30');
  });

  it('calcula la medianoche local como instante real', () => {
    expect(localDayStart(now, timeZone).toISOString()).toBe('2026-11-04T06:00:00.000Z');
  });

  it('funciona en otra zona horaria', () => {
    expect(localDayStart(now, 'Asia/Tokyo').toISOString()).toBe('2026-11-04T15:00:00.000Z');
  });
});

describe('isDue', () => {
  const settings = { time: '21:00', timeZone, lastSentOn: null, lastAttemptAt: null };

  it('toca después de la hora', () => {
    expect(isDue(settings, now)).toBe(true);
  });

  it('no toca antes de la hora', () => {
    expect(isDue({ ...settings, time: '22:00' }, now)).toBe(false);
  });

  it('no se envía dos veces el mismo día', () => {
    expect(isDue({ ...settings, lastSentOn: '2026-11-04' }, now)).toBe(false);
  });

  it('al día siguiente vuelve a tocar', () => {
    expect(isDue({ ...settings, lastSentOn: '2026-11-03' }, now)).toBe(true);
  });

  it('un fallo se reintenta hasta 15 minutos después, sin insistir cada minuto', () => {
    expect(isDue({ ...settings, lastAttemptAt: new Date(now.getTime() - 60_000) }, now)).toBe(false);
    expect(isDue({ ...settings, lastAttemptAt: new Date(now.getTime() - 16 * 60_000) }, now)).toBe(true);
  });
});

describe('terminalAlerts', () => {
  const base = { name: 'Caja', active: true, activatedAt: new Date() };

  it('avisa de rechazos, fallos, atrasos y falta de reporte', () => {
    const alerts = terminalAlerts(
      [
        { ...base, name: 'A', lastSyncedAt: now, syncRejected: 2 },
        { ...base, name: 'B', lastSyncedAt: now, lastSyncFailed: true },
        { ...base, name: 'C', lastSyncedAt: new Date(now.getTime() - 3_600_000) },
        { ...base, name: 'D' },
      ],
      now,
    );

    expect(alerts.map((a) => a.name)).toEqual(['A', 'B', 'C', 'D']);
    expect(alerts[0].problem).toContain('2 operaciones');
  });

  it('no avisa de terminales al día, deshabilitadas o sin activar', () => {
    expect(
      terminalAlerts(
        [
          { ...base, lastSyncedAt: now },
          { ...base, active: false },
          { ...base, activatedAt: null as never },
        ],
        now,
      ),
    ).toEqual([]);
  });
});

describe('renderDailyReport', () => {
  it('resume el día en el asunto', () => {
    expect(render().subject).toBe('Mi Tienda: $23.20 en 1 venta');
  });

  it('incluye ventas, utilidad y promociones', () => {
    const { html, text } = render();

    expect(html).toContain('$23.20');
    expect(html).toContain('Utilidad');
    expect(html).toContain('3X2');
    expect(html).toContain('hasta las 21:30');
    expect(text).toContain('Dejó de entrar por promociones: $10.00');
  });

  it('sin costos no menciona utilidad', () => {
    const { html, text } = render({ report: report(false) });

    expect(html).not.toContain('Utilidad');
    expect(text).not.toContain('Utilidad');
  });

  it('compara contra ayer a la misma hora', () => {
    expect(render({ previousTotal: 20 }).html).toContain('+16.0 % contra ayer');
    expect(render({ previousTotal: 46.4 }).html).toContain('-50.0 % contra ayer');
  });

  it('un día sin ventas también se puede leer', () => {
    const { subject, html } = render({ report: report(true, []) });

    expect(subject).toBe('Mi Tienda: $0.00 en 0 ventas');
    expect(html).not.toContain('Por terminal');
  });

  it('avisa si puede faltar información y del stock bajo', () => {
    const { html } = render({
      terminalAlerts: [{ name: 'Caja 2', problem: 'lleva más de 10 minutos sin sincronizar' }],
      lowStock: [{ name: 'ARROZ', stock: 1, minStock: 5, unit: 'pza' }],
    });

    expect(html).toContain('Puede faltar información');
    expect(html).toContain('ARROZ');
  });

  it('el correo de prueba se identifica', () => {
    const { subject, html } = render({ isTest: true });

    expect(subject.startsWith('[Prueba] ')).toBe(true);
    expect(html).toContain('Correo de prueba');
  });

  it('escapa los nombres: nada de lo capturado se interpreta como HTML', () => {
    const { html } = render({
      tenantName: '<script>alert(1)</script>',
      lowStock: [{ name: '<img src=x onerror=y>', stock: 0, minStock: 1, unit: 'pza' }],
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(escapeHtml(`a&"'`)).toBe('a&amp;&quot;&#39;');
  });
});

describe('mailErrorMessage', () => {
  it('explica el motivo sin detalles técnicos', () => {
    expect(mailErrorMessage({ code: 'EAUTH', response: '535 secreto' })).toContain('credenciales');
    expect(mailErrorMessage({ code: 'ETIMEDOUT' })).toContain('conectar');
    expect(mailErrorMessage(new Error('secreto'))).toBe('No se pudo enviar el correo.');
    expect(mailErrorMessage({ code: 'EAUTH', response: '535 secreto' })).not.toContain('secreto');
  });
});

describe('correo diario: descuentos dados en caja', () => {
  const manual = sale({
    discount: 10,
    manualDiscount: 10,
    discountReason: 'PRODUCTO MALTRATADO',
    createdByName: 'ANA',
    items: [{ productId: 'p', name: 'REFRESCO', unit: 'pza', unitPrice: 20, unitCost: 6, quantity: 1, discount: 10, manualDiscount: 10, promotionName: null }],
  });

  it('con descuentos, lista cuánto, quién y por qué', () => {
    const { html, text } = render({ report: report(true, [manual]) });

    expect(html).toContain('Descuentos dados en caja');
    expect(html).toContain('ANA');
    expect(html).toContain('PRODUCTO MALTRATADO');
    expect(text).toContain('Descuentos dados en caja: $10.00 en 1 ventas');
    // No son promociones: esa sección no aparece
    expect(html).not.toContain('Dejaron de entrar');
  });

  it('sin descuentos no ocupa lugar en el correo', () => {
    const { html, text } = render({ report: report(true, [sale({ discount: 0, items: [{ productId: 'p', name: 'REFRESCO', unit: 'pza', unitPrice: 10, unitCost: 6, quantity: 1, discount: 0, promotionName: null }] })]) });

    expect(html).not.toContain('Descuentos dados en caja');
    expect(text).not.toContain('Descuentos dados en caja');
  });

  it('el motivo se escapa: no puede meter HTML en el correo', () => {
    const { html } = render({ report: report(true, [sale({ ...manual, discountReason: '<b>x</b>' })]) });

    expect(html).not.toContain('<b>x</b>');
  });
});
