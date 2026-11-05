import { buildReport, ReportSale } from './report.builder.js';

// Ejemplo de la conversación: producto de $10 que costó $6
const item = (values: Partial<ReportSale['items'][number]> = {}) => ({
  productId: 'p1',
  name: 'REFRESCO',
  unit: 'pza',
  unitPrice: 10,
  unitCost: 6,
  quantity: 1,
  discount: 0,
  promotionName: null,
  ...values,
});

function sale(items: ReportSale['items'], values: Partial<ReportSale> = {}): ReportSale {
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity - i.discount, 0);
  const discount = items.reduce((sum, i) => sum + i.discount, 0);
  const tax = Math.round(subtotal * 16) / 100;
  return {
    terminalId: 't1',
    soldAt: new Date('2026-11-04T18:00:00Z'),
    status: 'completed',
    subtotal,
    tax,
    total: subtotal + tax,
    discount,
    items,
    payments: [{ method: 'cash', amount: subtotal + tax }],
    ...values,
  };
}

const options = {
  timeZone: 'America/Mexico_City',
  includeCosts: true,
  from: new Date('2026-11-04T06:00:00Z'),
  to: new Date('2026-11-05T05:59:59Z'),
  terminalLabel: (id: string) => `Caja ${id}`,
};

const withCosts = (sales: ReportSale[], extra: object = {}) => {
  const report = buildReport(sales, [], { ...options, ...extra });
  if (!('profitability' in report)) throw new Error('sin costos');
  return report;
};

describe('buildReport', () => {
  it('3x2 de $10 con costo $6: entran $20, dejan de entrar $10 y se ganan $2', () => {
    const report = withCosts([sale([item({ quantity: 3, discount: 10, promotionName: '3X2' })])]);

    expect(report.totals).toMatchObject({ gross: 30, discount: 10, subtotal: 20, tax: 3.2, total: 23.2, count: 1 });
    expect(report.profitability).toMatchObject({
      cost: 18,
      profit: 2,
      profitWithoutPromotions: 12,
      margin: 10,
      belowCostLoss: 0,
    });
    expect(report.promotions.rows).toEqual([{ name: '3X2', units: 3, discount: 10, sales: 1 }]);
  });

  it('2x1 de $10 con costo $6: se vendió bajo costo y se pierden $2', () => {
    const report = withCosts([sale([item({ quantity: 2, discount: 10, promotionName: '2X1' })])]);

    expect(report.profitability).toMatchObject({ cost: 12, profit: -2, belowCostLoss: 2 });
    expect(report.profitability.belowCost).toEqual([
      { productId: 'p1', name: 'REFRESCO', quantity: 2, amount: 10, cost: 12, loss: 2 },
    ]);
  });

  it('un producto sin costo no cuenta como pérdida, pero se avisa', () => {
    const report = withCosts([sale([item({ unitCost: 0, quantity: 2, discount: 15, promotionName: 'X' })])]);

    expect(report.profitability).toMatchObject({ linesWithoutCost: 1, belowCostLoss: 0, cost: 0, profit: 5 });
  });

  it('las canceladas no suman, solo se cuentan aparte', () => {
    const report = withCosts([sale([item()]), sale([item({ quantity: 5, discount: 10, promotionName: 'X' })], { status: 'cancelled' })]);

    expect(report.totals).toMatchObject({ count: 1, total: 11.6, discount: 0, cancelledCount: 1, cancelledTotal: 46.4 });
    expect(report.promotions.rows).toEqual([]);
    expect(report.profitability.cost).toBe(6);
  });

  it('sin permiso de costos no viaja nada de utilidad', () => {
    const report = buildReport([sale([item()])], [], { ...options, includeCosts: false });

    expect(report).not.toHaveProperty('profitability');
    expect(JSON.stringify(report)).not.toContain('profit');
    expect(JSON.stringify(report)).not.toContain('cost');
  });

  it('agrupa por terminal, forma de pago y producto', () => {
    const report = withCosts([
      sale([item()], { terminalId: 't1', payments: [{ method: 'cash', amount: 11.6 }] }),
      sale([item({ productId: 'p2', name: 'OTRO', unitPrice: 20, quantity: 2 })], {
        terminalId: 't2',
        payments: [{ method: 'card', amount: 30 }, { method: 'cash', amount: 16.4 }],
      }),
    ]);

    expect(report.byTerminal.map((t) => [t.name, t.count, t.total])).toEqual([['Caja t2', 1, 46.4], ['Caja t1', 1, 11.6]]);
    expect(report.byPayment).toEqual([{ method: 'card', amount: 30 }, { method: 'cash', amount: 28 }]);
    expect(report.topProducts.map((p) => [p.name, p.quantity, p.amount])).toEqual([['OTRO', 2, 40], ['REFRESCO', 1, 10]]);
  });

  it('usa el día de la zona horaria, no el de UTC', () => {
    // 2 de la mañana en UTC del día 5: en México todavía es el 4 por la noche
    const report = withCosts([sale([item()], { soldAt: new Date('2026-11-05T02:00:00Z') })]);

    expect(report.timeline).toEqual([{ key: '2026-11-04', count: 1, total: 11.6 }]);
  });

  it('muestra también los días sin ventas', () => {
    const report = withCosts([sale([item()])], {
      from: new Date('2026-11-02T06:00:00Z'),
      to: new Date('2026-11-05T05:59:59Z'),
    });

    expect(report.timeline.map((p) => [p.key, p.count])).toEqual([
      ['2026-11-02', 0],
      ['2026-11-03', 0],
      ['2026-11-04', 1],
    ]);
  });

  it('un periodo largo se agrupa por mes', () => {
    const report = withCosts([sale([item()])], {
      from: new Date('2026-01-01T06:00:00Z'),
      to: new Date('2026-11-05T05:59:59Z'),
    });

    expect(report.granularity).toBe('month');
    expect(report.timeline).toHaveLength(11);
    expect(report.timeline.find((p) => p.key === '2026-11')?.count).toBe(1);
  });

  it('solo reporta las cajas cerradas con diferencia', () => {
    const closedAt = new Date('2026-11-04T20:00:00Z');
    const report = buildReport(
      [],
      [
        { terminalId: 't1', number: 1, closedAt, countedCash: 90, difference: -10 },
        { terminalId: 't1', number: 2, closedAt, countedCash: 105, difference: 5 },
        { terminalId: 't1', number: 3, closedAt, countedCash: 100, difference: 0 },
        { terminalId: 't1', number: 4, closedAt: null, countedCash: null, difference: null },
      ],
      options,
    );

    expect(report.cash.shortage).toBe(-10);
    expect(report.cash.overage).toBe(5);
    expect(report.cash.differences.map((d) => d.number).sort()).toEqual([1, 2]);
  });

  it('sin ventas todo queda en cero, sin dividir entre cero', () => {
    const report = withCosts([]);

    expect(report.totals).toMatchObject({ count: 0, total: 0, average: 0 });
    expect(report.profitability.margin).toBe(0);
  });
});
