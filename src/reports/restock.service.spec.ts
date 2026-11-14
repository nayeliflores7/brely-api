import 'reflect-metadata';
import { PERMISSIONS_KEY } from '../common/decorators.js';
import { RestockController } from './restock.controller.js';
import { RestockService, salesWindowDays } from './restock.service.js';

const DAY = 86_400_000;
const now = new Date('2026-11-13T22:00:00Z');

const products = [
  { _id: 'a', name: 'COCA COLA', barcode: 'A', categoryId: 'c1', unit: 'pza', stock: 2, minStock: 12 },
  { _id: 'b', name: 'JUGO', barcode: 'B', categoryId: 'c1', unit: 'pza', stock: 13, minStock: 12 },
  { _id: 'c', name: 'LEJOS', barcode: 'C', categoryId: null, unit: 'pza', stock: 40, minStock: 12 },
  { _id: 'd', name: 'ARROZ', barcode: 'D', categoryId: null, unit: 'kg', stock: 0.5, minStock: 1 },
];

function setUp({ firstSale = new Date(now.getTime() - 60 * DAY), sold = [] as { _id: string; quantity: number }[] } = {}) {
  const seen: { filter?: Record<string, any>; pipeline?: any[]; salesFilter?: Record<string, any> } = {};
  const productModel = {
    find: (filter: Record<string, any>) => {
      seen.filter = filter;
      return { select: () => ({ lean: async () => products }) };
    },
  };
  const categoryModel = { find: () => ({ select: () => ({ lean: async () => [{ _id: 'c1', name: 'Bebidas' }] }) }) };
  const saleModel = {
    findOne: (filter: Record<string, any>) => {
      seen.salesFilter = filter;
      return { sort: () => ({ select: () => ({ lean: async () => (firstSale ? { soldAt: firstSale } : null) }) }) };
    },
    aggregate: async (pipeline: any[]) => {
      seen.pipeline = pipeline;
      return sold;
    },
  };
  const unitModel = {
    find: () => ({
      select: () => ({
        lean: async () => [
          { code: 'pza', allowsDecimals: false, tenantId: null },
          { code: 'kg', allowsDecimals: true, tenantId: null },
        ],
      }),
    }),
  };
  const tenants = { findOne: async () => ({ name: 'Mi Tienda' }) };
  const reports = { timeZone: (tz?: string) => tz ?? 'America/Mexico_City' };
  const service = new RestockService(productModel as never, categoryModel as never, saleModel as never, unitModel as never, tenants as never, reports as never);
  return { service, seen };
}

describe('RestockService', () => {
  it('pide solo productos activos, con control de existencias y del negocio', async () => {
    const { service, seen } = setUp();

    await service.list('t1', 0.25, 14, now);

    expect(seen.filter).toMatchObject({ tenantId: 't1', active: true, trackStock: true, deletedAt: null });
    expect(seen.filter?.$expr).toEqual({ $lte: ['$stock', { $multiply: ['$minStock', 1.25] }] });
  });

  it('descarta lo que la base dejó pasar pero queda fuera del margen', async () => {
    const { service } = setUp();

    const list = await service.list('t1', 0.25, 14, now);

    expect(list.rows.map((r) => [r.productId, r.status])).toEqual([
      ['a', 'alert'],
      ['b', 'soon'],
      ['d', 'alert'],
    ].sort((x, y) => (x[1] === y[1] ? 0 : x[1] === 'alert' ? -1 : 1)));
  });

  it('sin margen, solo los de alerta', async () => {
    const { service } = setUp();

    expect((await service.list('t1', 0, 14, now)).rows.map((r) => r.productId).sort()).toEqual(['a', 'd']);
  });

  it('cuenta solo ventas completadas de los últimos 30 días, de los productos de la lista', async () => {
    const { service, seen } = setUp();

    await service.list('t1', 0.25, 14, now);

    const match = seen.pipeline?.[0].$match;
    expect(match).toMatchObject({ tenantId: 't1', status: 'completed', deletedAt: null });
    expect(match.soldAt.$gte).toEqual(new Date(now.getTime() - 30 * DAY));
    expect(match['items.productId'].$in.sort()).toEqual(['a', 'b', 'd']);
  });

  it('con lo vendido calcula cuánto se vende al día y cuánto comprar', async () => {
    // 60 piezas en 30 días: 2 al día. Para 14 días: 28 + el mínimo 12 = 40; hay 2.
    const { service } = setUp({ sold: [{ _id: 'a', quantity: 60 }] });

    const list = await service.list('t1', 0.25, 14, now);
    const cola = list.rows.find((r) => r.productId === 'a')!;

    expect(list).toMatchObject({ coverDays: 14, windowDays: 30 });
    expect(cola).toMatchObject({ perDay: 2, suggested: 38 });
  });

  it('lo que se vende por peso se sugiere con un decimal; las piezas, enteras', async () => {
    // Arroz: 10.5 kg en 30 días = 0.35 al día. 14 días: 4.9 + 1 de mínimo = 5.9; hay 0.5 -> 5.4
    const { service } = setUp({ sold: [{ _id: 'd', quantity: 10.5 }, { _id: 'a', quantity: 7 }] });

    const list = await service.list('t1', 0.25, 14, now);

    expect(list.rows.find((r) => r.productId === 'd')?.suggested).toBe(5.4);
    expect(Number.isInteger(list.rows.find((r) => r.productId === 'a')?.suggested)).toBe(true);
  });

  it('un negocio nuevo no diluye las ventas en días en que ni existía', async () => {
    // Primera venta hace 10 días: 20 piezas en 10 días son 2 al día, no 0.67
    const { service, seen } = setUp({ firstSale: new Date(now.getTime() - 10 * DAY), sold: [{ _id: 'a', quantity: 20 }] });

    const list = await service.list('t1', 0.25, 14, now);

    expect(list.windowDays).toBe(10);
    expect(list.rows.find((r) => r.productId === 'a')?.perDay).toBe(2);
    expect(seen.pipeline?.[0].$match.soldAt.$gte).toEqual(new Date(now.getTime() - 10 * DAY));
  });

  it('sin ventas aún, sugiere llegar al doble del mínimo', async () => {
    const { service } = setUp({ firstSale: null as never });

    const list = await service.list('t1', 0.25, 14, now);

    // Coca Cola: mínimo 12, hay 2: llegar a 24 son 22
    expect(list.rows.find((r) => r.productId === 'a')).toMatchObject({ perDay: 0, suggested: 22 });
  });

  it('el PDF sale como archivo PDF', async () => {
    const { service } = setUp({ sold: [{ _id: 'a', quantity: 60 }] });

    const pdf = await service.pdf('t1', 0.25, 14, 'America/Mexico_City');

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('salesWindowDays', () => {
  it('sin ventas, o con mucha historia, mira 30 días', () => {
    expect(salesWindowDays(null, now)).toBe(30);
    expect(salesWindowDays(new Date(now.getTime() - 200 * DAY), now)).toBe(30);
  });

  it('con poca historia, solo los días que existe el negocio', () => {
    expect(salesWindowDays(new Date(now.getTime() - 15 * DAY), now)).toBe(15);
  });

  it('nunca menos de 7 días: una venta suelta no es una tendencia', () => {
    expect(salesWindowDays(new Date(now.getTime() - 2 * 3_600_000), now)).toBe(7);
    expect(salesWindowDays(new Date(now.getTime() - 3 * DAY), now)).toBe(7);
  });
});

describe('RestockController', () => {
  it('pide el permiso de ver el inventario, no el de reportes', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, RestockController)).toEqual(['inventory.view']);
  });
});
