import { buildReport } from './report.builder.js';
import { DashboardService } from './dashboard.service.js';

const timeZone = 'America/Mexico_City';
// 21:30 del 15 de noviembre en México
const now = new Date('2026-11-16T03:30:00Z');

const sale = (soldAt: string, total = 116) => ({
  terminalId: 't1',
  soldAt: new Date(soldAt),
  status: 'completed',
  subtotal: total / 1.16,
  tax: total - total / 1.16,
  total,
  discount: 10,
  items: [{ productId: 'p', name: 'REFRESCO', unit: 'pza', unitPrice: 110, unitCost: 60, quantity: 1, discount: 10, promotionName: 'PROMO' }],
  payments: [{ method: 'cash', amount: total }],
});

const SALES = [
  sale('2026-11-15T20:00:00Z'), // hoy
  sale('2026-11-14T20:00:00Z', 232), // ayer, antes de la misma hora
  sale('2026-11-15T04:00:00Z', 58), // ayer a las 22:00: después de esta hora, no se compara
  sale('2026-11-09T20:00:00Z', 580), // dentro de los 7 días
  sale('2026-11-02T20:00:00Z', 1160), // solo en el mes
];

function setUp() {
  const queries: { from: string; to: string; includeCosts: boolean }[] = [];
  const reports = {
    timeZone: (tz?: string) => tz ?? timeZone,
    salesReport: async (_: string, q: { from: string; to: string }, includeCosts: boolean) => {
      queries.push({ ...q, includeCosts });
      const from = new Date(q.from);
      const to = new Date(q.to);
      return buildReport(
        SALES.filter((s) => s.soldAt >= from && s.soldAt <= to),
        [],
        { timeZone, includeCosts, from, to, terminalLabel: () => 'Caja 1' },
      );
    },
    lowStock: async () => ({ items: [{ name: 'ARROZ', stock: 1, minStock: 5, unit: 'pza' }], total: 12 }),
  };
  const service = new DashboardService(
    {
      aggregate: async () => [
        { _id: 'a', total: 100.005, count: 2, previousTotal: 50 },
        { _id: 'b', total: 300, count: 1, previousTotal: 0 },
      ],
    } as never,
    { find: () => ({ select: () => ({ sort: () => ({ lean: async () => [{ terminalId: 't1', number: 4, openedAt: now }] }) }) }) } as never,
    { find: () => ({ select: () => ({ lean: async () => [{ _id: 'a', enabled: true, lastError: 'Falló' }, { _id: 'b', enabled: false, lastError: 'Viejo' }] }) }) } as never,
    reports as never,
    {
      findAll: async (id?: string) => [
        { name: 'Caja 1', active: true, activatedAt: now, lastSyncedAt: now },
        { name: 'Caja 2', active: id === 'a', activatedAt: now, lastSyncFailed: true },
      ],
      options: async () => [{ _id: 't1', name: 'Caja 1', deleted: false }],
    } as never,
    {
      findAll: async () => [
        { _id: 'a', name: 'Abarrotes', deletedAt: null },
        { _id: 'b', name: 'Bodega', deletedAt: null },
        { _id: 'c', name: 'Cerrada', deletedAt: now },
        { _id: 'd', name: 'Depósito', deletedAt: null },
      ],
    } as never,
    { isConfigured: true } as never,
  );
  return { service, queries };
}

describe('DashboardService.business', () => {
  it('compara hoy contra ayer solo hasta la misma hora', async () => {
    const { today, previousTotal } = await setUp().service.business('t', timeZone, true, now);

    expect(today.total).toBe(116);
    expect(today.count).toBe(1);
    expect(previousTotal).toBe(232); // la de ayer a las 22:00 ya es posterior a esta hora
  });

  it('la semana trae 7 días y termina hoy', async () => {
    const { week } = await setUp().service.business('t', timeZone, true, now);

    expect(week).toHaveLength(7);
    expect(week[0].key).toBe('2026-11-09');
    expect(week.at(-1)).toMatchObject({ key: '2026-11-15', total: 116 });
    expect(week[0].total).toBe(580);
  });

  it('el mes empieza el día primero local', async () => {
    const { service, queries } = setUp();

    const { month } = await service.business('t', timeZone, true, now);

    expect(queries.some((q) => q.from === '2026-11-01T06:00:00.000Z')).toBe(true);
    expect(month.total).toBe(116 + 232 + 58 + 580 + 1160);
    expect(month.promotionDiscount).toBe(50);
    expect(month.profit).toBeDefined();
  });

  it('sin permiso de costos no trae utilidad', async () => {
    const { today, month } = await setUp().service.business('t', timeZone, false, now);

    expect(today).not.toHaveProperty('profit');
    expect(month).not.toHaveProperty('profit');
    expect(month).not.toHaveProperty('belowCostLoss');
  });

  it('incluye stock bajo, cajas abiertas y alertas', async () => {
    const result = await setUp().service.business('a', timeZone, true, now);

    expect(result.lowStockTotal).toBe(12);
    expect(result.openCash).toEqual([{ terminalName: 'Caja 1', number: 4, openedAt: now }]);
    expect(result.terminalAlerts.map((a) => a.name)).toEqual(['Caja 2']);
  });
});

describe('DashboardService.platform', () => {
  it('ordena por venta y omite negocios desactivados', async () => {
    const { rows } = await setUp().service.platform(timeZone, now);

    expect(rows.map((r) => r.name)).toEqual(['Bodega', 'Abarrotes', 'Depósito']);
  });

  it('suma y redondea los totales', async () => {
    const { totals } = await setUp().service.platform(timeZone, now);

    expect(totals).toMatchObject({ tenants: 3, total: 400.01, count: 3, previousTotal: 50 });
  });

  it('un negocio sin ventas aparece en ceros', async () => {
    const { rows } = await setUp().service.platform(timeZone, now);

    expect(rows.at(-1)).toMatchObject({ name: 'Depósito', total: 0, count: 0, previousTotal: 0 });
  });

  it('cuenta terminales en uso y sus alertas', async () => {
    const { rows } = await setUp().service.platform(timeZone, now);

    expect(rows.find((r) => r.tenantId === 'a')).toMatchObject({ terminals: 2 });
    expect(rows.find((r) => r.tenantId === 'a')?.alerts.map((a) => a.name)).toEqual(['Caja 2']);
    expect(rows.find((r) => r.tenantId === 'b')).toMatchObject({ terminals: 1, alerts: [] });
  });

  it('solo muestra el error del reporte si está activado', async () => {
    const { rows } = await setUp().service.platform(timeZone, now);

    expect(rows.find((r) => r.tenantId === 'a')).toMatchObject({ reportEnabled: true, reportError: 'Falló' });
    expect(rows.find((r) => r.tenantId === 'b')).toMatchObject({ reportEnabled: false, reportError: null });
  });
});
