import { FinanceService, profitRange } from './finance.service.js';
import { productProfits, type ProfitLine } from './finance.js';

const line = (values: Partial<ProfitLine> = {}): ProfitLine => ({
  productId: 'p1',
  name: 'REFRESCO',
  unit: 'pza',
  quantity: 1,
  unitPrice: 116,
  unitCost: 50,
  discount: 0,
  taxRate: 0.16,
  ...values,
});

describe('productProfits', () => {
  it('lo que entró sin IVA menos lo que costó: 2 piezas de $116 con IVA y costo $50 dejan $100', () => {
    const { rows } = productProfits([line({ quantity: 2 })]);

    // 232 con IVA son 200 sin IVA; la mercancía costó 100
    expect(rows[0]).toMatchObject({ netSales: 200, cost: 100, profit: 100, marginPercent: 50, quantity: 2 });
  });

  it('suma las ventas del mismo producto', () => {
    const { rows } = productProfits([line(), line(), line({ productId: 'p2', name: 'GALLETAS', unitPrice: 29, unitCost: 10 })]);

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.productId === 'p1')).toMatchObject({ quantity: 2, netSales: 200, cost: 100 });
  });

  it('los descuentos y promociones bajan lo que entró, no el costo', () => {
    // $116 menos $11.60 de descuento: $104.40 con IVA, $90 sin IVA
    const { rows } = productProfits([line({ discount: 11.6 })]);

    expect(rows[0]).toMatchObject({ netSales: 90, cost: 50, profit: 40 });
  });

  it('un producto exento de IVA: lo cobrado es lo que entra', () => {
    const { rows } = productProfits([line({ taxRate: 0, unitPrice: 30, unitCost: 20, quantity: 3 })]);

    expect(rows[0]).toMatchObject({ netSales: 90, cost: 60, profit: 30 });
  });

  it('ordena de más a menos utilidad y dice qué parte de la utilidad total deja cada uno', () => {
    const { rows, totals } = productProfits([
      line({ productId: 'a', name: 'A', taxRate: 0, unitPrice: 100, unitCost: 40 }), // deja 60
      line({ productId: 'b', name: 'B', taxRate: 0, unitPrice: 50, unitCost: 20 }), // deja 30
      line({ productId: 'c', name: 'C', taxRate: 0, unitPrice: 20, unitCost: 10 }), // deja 10
    ]);

    expect(rows.map((r) => [r.productId, r.profit, r.shareOfProfit])).toEqual([
      ['a', 60, 60],
      ['b', 30, 30],
      ['c', 10, 10],
    ]);
    expect(totals).toMatchObject({ products: 3, netSales: 170, cost: 70, profit: 100 });
  });

  it('un producto vendido por debajo de su costo pierde dinero y se cuenta aparte', () => {
    const { rows, totals } = productProfits([
      line({ productId: 'bien', name: 'BIEN', taxRate: 0, unitPrice: 20, unitCost: 10 }),
      line({ productId: 'mal', name: 'MAL', taxRate: 0, unitPrice: 10, unitCost: 12 }),
    ]);

    expect(rows.at(-1)).toMatchObject({ productId: 'mal', profit: -2, marginPercent: -20 });
    expect(totals.losing).toBe(1);
  });

  it('sin costo capturado lo avisa: la utilidad se vería completa', () => {
    const { rows, totals } = productProfits([line({ unitCost: 0 }), line({ productId: 'p2', name: 'OTRO' })]);

    expect(rows.find((r) => r.productId === 'p1')).toMatchObject({ cost: 0, linesWithoutCost: 1 });
    expect(totals.withoutCost).toBe(1);
  });

  it('con 6 o más productos dice cuánto de la utilidad dejan los 5 que más dejan', () => {
    // Cinco dejan $10 cada uno y el sexto $2: los 5 primeros suman 50 de 52
    const lines = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) =>
      line({ productId: id, name: id, taxRate: 0, unitPrice: 100, unitCost: id === 'f' ? 98 : 90 }),
    );
    const { totals } = productProfits(lines);

    expect(totals.topShare).toBe(96.2);
    expect(totals.topCount).toBe(5);
  });

  it('con 5 productos o menos no hace esa cuenta: sería siempre 100 %', () => {
    const { totals } = productProfits([line(), line({ productId: 'p2', name: 'B' })]);

    expect(totals.topShare).toBeNull();
  });

  it('si en total no hubo utilidad, no reparte porcentajes de ella', () => {
    const { rows } = productProfits([line({ taxRate: 0, unitPrice: 10, unitCost: 12 })]);

    expect(rows[0].shareOfProfit).toBeNull();
  });

  it('sin ventas, todo en cero', () => {
    expect(productProfits([])).toMatchObject({
      rows: [],
      totals: { products: 0, netSales: 0, cost: 0, profit: 0, losing: 0, withoutCost: 0, topShare: null },
    });
  });

  it('conserva el nombre más reciente y las piezas con decimales', () => {
    const { rows } = productProfits([line({ name: 'NOMBRE VIEJO', unit: 'kg', quantity: 0.1 }), line({ name: 'NOMBRE NUEVO', unit: 'kg', quantity: 0.2 })]);

    expect(rows[0]).toMatchObject({ name: 'NOMBRE NUEVO', quantity: 0.3 });
  });
});

describe('profitRange', () => {
  // 13 de noviembre de 2026, 4 p. m. en México (UTC-6, sin horario de verano)
  const now = new Date('2026-11-13T22:00:00Z');
  const zone = 'America/Mexico_City';

  it('este mes: desde el primer día a la medianoche de quien consulta, hasta ahora', () => {
    expect(profitRange('month', now, zone)).toEqual({ from: new Date('2026-11-01T06:00:00Z'), to: now });
  });

  it('el mes pasado: completo, hasta el último instante de octubre', () => {
    const range = profitRange('lastMonth', now, zone);

    expect(range.from.toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-11-01T05:59:59.999Z');
  });

  it('en enero, el mes pasado es diciembre del año anterior', () => {
    const range = profitRange('lastMonth', new Date('2027-01-10T18:00:00Z'), zone);

    expect(range.from.toISOString()).toBe('2026-12-01T06:00:00.000Z');
    expect(range.to.toISOString()).toBe('2027-01-01T05:59:59.999Z');
  });

  it('los últimos 30 días: 30 días hacia atrás desde ahora', () => {
    const range = profitRange('last30', now, zone);

    expect(range.to).toEqual(now);
    expect(range.from.toISOString()).toBe('2026-10-14T22:00:00.000Z');
  });
});

describe('FinanceService: utilidad por producto', () => {
  const now = new Date('2026-11-13T22:00:00Z');
  const sold = [
    { items: [{ productId: 'p1', name: 'REFRESCO', unit: 'pza', quantity: 2, unitPrice: 116, unitCost: 50, discount: 0, taxRate: 0.16 }] },
    {
      items: [
        { productId: 'p1', name: 'REFRESCO', unit: 'pza', quantity: 1, unitPrice: 116, unitCost: 50, discount: 0, taxRate: 0.16 },
        { productId: 'p2', name: 'SAL', unit: 'pza', quantity: 1, unitPrice: 20 },
      ],
    },
  ];

  function setUp(salesResult: object[]) {
    const seen: { filter?: Record<string, any> } = {};
    const saleModel = {
      find: (filter: Record<string, any>) => {
        seen.filter = filter;
        return { sort: () => ({ select: () => ({ lean: async () => salesResult }) }) };
      },
    };
    const reports = { timeZone: (tz?: string) => tz ?? 'America/Mexico_City' };
    const service = new FinanceService({} as never, {} as never, saleModel as never, reports as never);
    return { service, seen };
  }

  it('pide las ventas completadas del negocio en el periodo', async () => {
    const { service, seen } = setUp(sold);

    const result = await service.productProfit('t1', 'month', 'America/Mexico_City', now);

    expect(seen.filter).toMatchObject({ tenantId: 't1', status: 'completed', deletedAt: null });
    expect(seen.filter?.soldAt.$gte).toEqual(new Date('2026-11-01T06:00:00Z'));
    expect(seen.filter?.soldAt.$lte).toEqual(now);
    expect(result).toMatchObject({ period: 'month', timeZone: 'America/Mexico_City' });
  });

  it('suma lo vendido en varias ventas y trata un costo que falta como cero', async () => {
    const { service } = setUp(sold);

    const { rows, totals } = await service.productProfit('t1', 'month', 'America/Mexico_City', now);

    expect(rows.find((r) => r.productId === 'p1')).toMatchObject({ quantity: 3, netSales: 300, cost: 150, profit: 150 });
    expect(rows.find((r) => r.productId === 'p2')).toMatchObject({ cost: 0, linesWithoutCost: 1 });
    expect(totals.withoutCost).toBe(1);
  });

  it('por defecto mide este mes', async () => {
    const { service } = setUp([]);

    expect((await service.productProfit('t1', undefined, 'America/Mexico_City', now)).period).toBe('month');
  });
});
