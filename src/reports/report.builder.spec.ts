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

describe('buildReport con IVA incluido en el precio', () => {
  const line = (values = {}) => ({
    productId: 'p1', name: 'LATA', unit: 'pza', unitPrice: 60, unitCost: 44, quantity: 3, discount: 0, taxRate: 0.16, promotionName: null, ...values,
  });
  const taxed = (items: ReturnType<typeof line>[], subtotal: number, tax: number, total: number, discount = 0): ReportSale => ({
    terminalId: 't1', soldAt: new Date('2026-11-04T18:00:00Z'), status: 'completed', subtotal, tax, total, discount, items,
    payments: [{ method: 'cash', amount: total }],
  });
  const report = (sales: ReportSale[]) =>
    buildReport(sales, [], { timeZone: 'America/Mexico_City', includeCosts: true, from: new Date('2026-11-04T06:00:00Z'), to: new Date('2026-11-05T05:00:00Z'), terminalLabel: () => 'Caja' }) as any;

  it('la utilidad resta el costo del subtotal, no del precio', () => {
    const result = report([taxed([line()], 155.17, 24.83, 180)]);

    expect(result.totals).toMatchObject({ subtotal: 155.17, tax: 24.83, total: 180 });
    expect(result.profitability.profit).toBe(23.17);
    expect(result.topProducts[0].amount).toBe(155.17);
  });

  it('una promoción cuenta lo que dejó de entrar sin IVA', () => {
    const result = report([taxed([line({ discount: 60, promotionName: '3X2' })], 103.45, 16.55, 120, 60)]);

    expect(result.promotions.discount).toBe(51.72);
    expect(result.promotions.rows[0].discount).toBe(51.72);
    expect(result.totals.gross).toBe(155.17);
    expect(result.profitability.profitWithoutPromotions).toBe(23.17);
  });

  it('vender bajo costo se detecta contra el subtotal', () => {
    const result = report([taxed([line({ unitPrice: 50, quantity: 1 })], 43.1, 6.9, 50)]);

    expect(result.profitability.belowCostLoss).toBe(0.9);
  });

  it('exento: precio y subtotal son lo mismo', () => {
    const result = report([taxed([line({ taxRate: 0, quantity: 2, discount: 10, promotionName: 'X' })], 110, 0, 110, 10)]);

    expect(result.promotions.discount).toBe(10);
    expect(result.profitability.profit).toBe(22);
  });
});

describe('descuentos dados en caja', () => {
  const given = (values: Partial<ReportSale> = {}, itemValues: Partial<ReportSale['items'][number]> = {}) =>
    sale([item({ unitPrice: 100, discount: 10, manualDiscount: 10, ...itemValues })], {
      manualDiscount: 10,
      discountReason: 'cliente frecuente',
      createdByName: 'ANA',
      ...values,
    });

  it('se cuentan aparte de las promociones', () => {
    const report = buildReport([given()], [], options);

    expect(report.totals).toMatchObject({ gross: 100, discount: 10, promotionDiscount: 0, manualDiscount: 10 });
    expect(report.promotions).toEqual({ discount: 0, salesWithPromotion: 0, rows: [] });
    expect(report.discounts).toMatchObject({ discount: 10, salesWithDiscount: 1, percentOfGross: 10 });
  });

  it('dice quién los dio y por qué', () => {
    const report = buildReport(
      [given(), given({ discountReason: 'PRODUCTO MALTRATADO', createdByName: 'LUIS' }), given({ discountReason: '', createdByName: undefined })],
      [],
      options,
    );

    expect(report.discounts.byUser).toEqual([
      { name: 'ANA', sales: 1, discount: 10 },
      { name: 'LUIS', sales: 1, discount: 10 },
      { name: '—', sales: 1, discount: 10 },
    ]);
    expect(report.discounts.byReason.map((r) => r.reason).sort()).toEqual(['CLIENTE FRECUENTE', 'PRODUCTO MALTRATADO', 'SIN MOTIVO']);
  });

  it('en una línea con promoción y descuento, cada uno cuenta lo suyo', () => {
    // 3 piezas de $10: la promoción quita $10 y el cajero $2 más
    const report = withCosts([
      sale([item({ quantity: 3, discount: 12, manualDiscount: 2, promotionName: '3X2' })], { manualDiscount: 2, createdByName: 'ANA' }),
    ]);

    expect(report.totals).toMatchObject({ gross: 30, discount: 12, promotionDiscount: 10, manualDiscount: 2 });
    expect(report.promotions.rows).toEqual([{ name: '3X2', units: 3, discount: 10, sales: 1 }]);
    expect(report.discounts.discount).toBe(2);
    expect(report.profitability).toMatchObject({ profit: 0, profitWithoutPromotions: 10, profitWithoutDiscounts: 12 });
    // El descuento total de la línea sigue siendo la suma
    expect(report.topProducts[0].discount).toBe(12);
  });

  it('el descuento sale sin IVA', () => {
    // $116 con IVA, $11.60 de descuento: $10 sin IVA
    const report = buildReport(
      [sale([item({ unitPrice: 116, taxRate: 0.16, discount: 11.6, manualDiscount: 11.6 })], { manualDiscount: 11.6 })],
      [],
      options,
    );

    expect(report.discounts.discount).toBe(10);
    expect(report.totals.manualDiscount).toBe(10);
  });

  it('una venta de antes de los descuentos manuales sigue contando como promoción', () => {
    const report = buildReport([sale([item({ quantity: 3, discount: 10, promotionName: '3X2' })])], [], options);

    expect(report.totals).toMatchObject({ promotionDiscount: 10, manualDiscount: 0 });
    expect(report.discounts).toEqual({ discount: 0, salesWithDiscount: 0, percentOfGross: 0, byUser: [], byReason: [] });
  });

  it('una venta cancelada no cuenta', () => {
    const report = buildReport([given({ status: 'cancelled' })], [], options);

    expect(report.discounts.salesWithDiscount).toBe(0);
    expect(report.totals.manualDiscount).toBe(0);
  });
});
