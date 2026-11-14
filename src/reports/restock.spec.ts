import { buildRestock, NO_CATEGORY, suggestPurchase, type RestockDemand, type RestockProduct } from './restock.js';
import { printable, renderRestockPdf } from './restock.pdf.js';

const product = (values: Partial<RestockProduct> = {}): RestockProduct => ({
  _id: 'p1',
  name: 'REFRESCO',
  barcode: '7501',
  categoryId: 'c1',
  unit: 'pza',
  stock: 10,
  minStock: 10,
  ...values,
});

const categories = new Map([
  ['c1', 'Bebidas'],
  ['c2', 'Abarrotes'],
]);

describe('buildRestock', () => {
  it('entra el que está en el mínimo o por debajo, aunque no haya margen', () => {
    const { rows, counts } = buildRestock(
      [product({ _id: 'a', stock: 10 }), product({ _id: 'b', stock: 3 }), product({ _id: 'c', stock: 0 }), product({ _id: 'd', stock: -2 })],
      categories,
      0,
    );

    expect(rows.map((r) => r.productId).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(counts).toEqual({ alert: 4, soon: 0 });
  });

  it('con margen entran también los que están por entrar, hasta ese porcentaje sobre el mínimo', () => {
    // mínimo 10 y margen 25 %: hasta 12.5
    const { rows, counts } = buildRestock(
      [product({ _id: 'alerta', stock: 9 }), product({ _id: 'cerca', stock: 12 }), product({ _id: 'justo', stock: 12.5 }), product({ _id: 'lejos', stock: 13 })],
      categories,
      0.25,
    );

    expect(rows.map((r) => [r.productId, r.status])).toEqual([
      ['alerta', 'alert'],
      ['cerca', 'soon'],
      ['justo', 'soon'],
    ]);
    expect(counts).toEqual({ alert: 1, soon: 2 });
  });

  it('sin margen, los que están por encima del mínimo no entran', () => {
    expect(buildRestock([product({ stock: 11 })], categories, 0).rows).toEqual([]);
  });

  it('dice cuánto falta para el mínimo, o 0 si todavía está por encima', () => {
    const { rows } = buildRestock([product({ _id: 'a', stock: 4 }), product({ _id: 'b', stock: 11 })], categories, 0.25);

    expect(rows.find((r) => r.productId === 'a')?.shortfall).toBe(6);
    expect(rows.find((r) => r.productId === 'b')?.shortfall).toBe(0);
  });

  it('un producto sin mínimo configurado solo entra si ya se acabó', () => {
    const { rows } = buildRestock([product({ _id: 'sin', minStock: 0, stock: 0 }), product({ _id: 'hay', minStock: 0, stock: 5 })], categories, 0.25);

    expect(rows.map((r) => r.productId)).toEqual(['sin']);
  });

  it('primero los de alerta; dentro de cada grupo, por categoría y nombre, con "sin categoría" al final', () => {
    const { rows } = buildRestock(
      [
        product({ _id: 'soon-b', name: 'ZUMO', categoryId: 'c1', stock: 11 }),
        product({ _id: 'alert-sin', name: 'AAA', categoryId: null, stock: 1 }),
        product({ _id: 'alert-bebida', name: 'COLA', categoryId: 'c1', stock: 1 }),
        product({ _id: 'alert-abarrote-2', name: 'SAL', categoryId: 'c2', stock: 1 }),
        product({ _id: 'alert-abarrote-1', name: 'ARROZ', categoryId: 'c2', stock: 1 }),
      ],
      categories,
      0.25,
    );

    expect(rows.map((r) => r.productId)).toEqual(['alert-abarrote-1', 'alert-abarrote-2', 'alert-bebida', 'alert-sin', 'soon-b']);
    expect(rows.find((r) => r.productId === 'alert-sin')?.category).toBe(NO_CATEGORY);
  });

  it('una categoría que ya no existe cuenta como sin categoría', () => {
    expect(buildRestock([product({ categoryId: 'borrada' })], categories, 0).rows[0].category).toBe(NO_CATEGORY);
  });

  it('con decimales no se arrastra el error de redondeo', () => {
    const { rows } = buildRestock([product({ unit: 'kg', stock: 0.1 + 0.2, minStock: 1 })], categories, 0);

    expect(rows[0]).toMatchObject({ stock: 0.3, shortfall: 0.7 });
  });
});

describe('printable', () => {
  it('conserva acentos, ñ y signos de apertura', () => {
    expect(printable('JALAPEÑO Á¿QUÉ¡ 1/2 kg – “extra”')).toBe('JALAPEÑO Á¿QUÉ¡ 1/2 kg – “extra”');
  });

  it('cambia lo que una fuente de PDF no puede dibujar', () => {
    expect(printable('COLA 🥤 ZERO')).toBe('COLA ?? ZERO');
    expect(printable('日本')).toBe('??');
  });
});

describe('renderRestockPdf', () => {
  const render = (rows: RestockProduct[], margin = 0.25) =>
    renderRestockPdf({
      tenantName: 'Mi Tienda',
      timeZone: 'America/Mexico_City',
      now: new Date('2026-11-13T22:30:00Z'),
      list: buildRestock(rows, categories, margin),
    });
  const pagesOf = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;

  it('genera un PDF válido', async () => {
    const pdf = await render([product({ stock: 1 })]);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-8).toString()).toContain('%%EOF');
    expect(pagesOf(pdf)).toBe(1);
  });

  it('sin productos también genera un PDF, con el aviso', async () => {
    const pdf = await render([]);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pagesOf(pdf)).toBe(1);
  });

  it('con muchos productos sigue en otras páginas, sin cortar la lista', async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      product({ _id: `p${i}`, name: `PRODUCTO ${String(i).padStart(3, '0')}`, categoryId: i % 2 ? 'c1' : 'c2', stock: i % 3 === 0 ? 20 / 8 * 5 : 1, minStock: 10 }),
    );
    const pdf = await render(many);

    expect(pagesOf(pdf)).toBeGreaterThan(2);
  });

  it('un nombre larguísimo o con emojis no la rompe', async () => {
    const pdf = await render([product({ name: `${'NOMBRE MUY LARGO '.repeat(30)} 🥤`, stock: 1 })]);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('suggestPurchase', () => {
  const base = { stock: 5, minStock: 12, perDay: 2, coverDays: 14, status: 'alert' as const, decimals: false };

  it('alcanza para los días pedidos más el mínimo', () => {
    // 2 al día x 14 = 28, más 12 de mínimo = 40; hay 5
    expect(suggestPurchase(base)).toBe(35);
  });

  it('pedir más días pide más', () => {
    expect(suggestPurchase({ ...base, coverDays: 30 })).toBe(67);
    expect(suggestPurchase({ ...base, coverDays: 7 })).toBe(21);
  });

  it('sin ventas, llegar al doble del mínimo', () => {
    expect(suggestPurchase({ ...base, perDay: 0, stock: 2 })).toBe(22);
  });

  it('un producto en alerta siempre sugiere algo, aunque la cuenta diera cero', () => {
    expect(suggestPurchase({ ...base, perDay: 0, minStock: 0, stock: 0 })).toBe(1);
  });

  it('uno por agotarse al que todavía le alcanza no sugiere nada', () => {
    expect(suggestPurchase({ ...base, status: 'soon', perDay: 0, minStock: 5, stock: 11 })).toBe(0);
  });

  it('uno por agotarse que se vende rápido sí', () => {
    // 3 al día x 14 = 42 + 12 = 54; hay 13
    expect(suggestPurchase({ ...base, status: 'soon', perDay: 3, stock: 13 })).toBe(41);
  });

  it('las piezas se compran enteras, siempre hacia arriba', () => {
    // 0.43 x 14 = 6.02 + 12 = 18.02; hay 5 -> 13.02 -> 14
    expect(suggestPurchase({ ...base, perDay: 0.43 })).toBe(14);
  });

  it('el error del punto flotante no sube una pieza de más', () => {
    // 0.1 x 30 es 3.0000000000000004 en flotante: son 3 piezas, no 4
    expect(suggestPurchase({ ...base, perDay: 0.1, coverDays: 30, minStock: 0, stock: 0 })).toBe(3);
  });

  it('lo que se vende por peso, con un decimal hacia arriba', () => {
    expect(suggestPurchase({ ...base, perDay: 0.35, minStock: 1, stock: 0.5, decimals: true })).toBe(5.4);
    expect(suggestPurchase({ ...base, perDay: 0.333, minStock: 0, stock: 0, coverDays: 10, decimals: true })).toBe(3.4);
  });
});

describe('buildRestock con ventas', () => {
  const demand = (values: Partial<RestockDemand> = {}): RestockDemand => ({
    sold: new Map([['p1', 60]]),
    windowDays: 30,
    coverDays: 14,
    decimalUnits: new Set(),
    ...values,
  });

  it('cada fila dice cuánto se vende al día y cuánto comprar', () => {
    const { rows, coverDays, windowDays } = buildRestock([product({ stock: 5, minStock: 12 })], categories, 0, demand());

    expect(rows[0]).toMatchObject({ perDay: 2, suggested: 35 });
    expect({ coverDays, windowDays }).toEqual({ coverDays: 14, windowDays: 30 });
  });

  it('un producto que no se ha vendido tiene 0 al día', () => {
    const { rows } = buildRestock([product({ _id: 'sin-ventas', stock: 1, minStock: 12 })], categories, 0, demand());

    expect(rows[0]).toMatchObject({ perDay: 0, suggested: 23 });
  });
});
