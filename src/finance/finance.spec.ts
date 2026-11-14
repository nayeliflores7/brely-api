import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../common/decorators.js';
import { SYSTEM_ROLES } from '../roles/permissions.js';
import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';
import { breakEven, daysInMonthOf, monthlyAmount, monthProgress } from './finance.js';

describe('monthlyAmount', () => {
  it('lo mensual pesa lo mismo; lo que se paga cada cierto tiempo, su parte de cada mes', () => {
    expect(monthlyAmount(1000, 'monthly')).toBe(1000);
    expect(monthlyAmount(900, 'bimonthly')).toBe(450);
    expect(monthlyAmount(3000, 'quarterly')).toBe(1000);
    expect(monthlyAmount(6000, 'semiannual')).toBe(1000);
    expect(monthlyAmount(1200, 'annual')).toBe(100);
  });

  it('redondea a centavos', () => {
    expect(monthlyAmount(100, 'quarterly')).toBe(33.33);
  });
});

describe('breakEven', () => {
  // Gastos fijos de $15,000; se vendieron $100,000 sin IVA (con IVA, $116,000) y la mercancía costó $70,000
  const base = { monthlyFixed: 15_000, netSales: 100_000, cost: 70_000, salesWithTax: 116_000, salesCount: 500 };

  it('gastos fijos entre el margen: con 30 % de margen, $15,000 de gastos piden $50,000 de ventas', () => {
    const result = breakEven(base);

    expect(result).toMatchObject({ state: 'ok', marginPercent: 30, monthlyNet: 50_000 });
  });

  it('lo traduce a lo que marcaría la caja, con el IVA que traen los precios', () => {
    const result = breakEven(base);

    expect(result.monthlyWithTax).toBe(58_000);
    expect(result.averageTicket).toBe(232);
  });

  it('a mayor margen, menos hay que vender', () => {
    expect(breakEven({ ...base, cost: 50_000 }).monthlyNet).toBe(30_000);
    expect(breakEven({ ...base, cost: 80_000 }).monthlyNet).toBe(75_000);
  });

  it('productos exentos de IVA: lo de la caja es lo mismo', () => {
    const result = breakEven({ ...base, salesWithTax: 100_000 });

    expect(result.monthlyWithTax).toBe(result.monthlyNet);
  });

  it('sin gastos fijos registrados no hay qué calcular', () => {
    expect(breakEven({ ...base, monthlyFixed: 0 })).toMatchObject({ state: 'no-expenses', monthlyNet: null, monthlyWithTax: null });
  });

  it('sin ventas no hay margen del que partir', () => {
    expect(breakEven({ ...base, netSales: 0, cost: 0, salesWithTax: 0, salesCount: 0 })).toMatchObject({
      state: 'no-sales',
      marginPercent: null,
      monthlyNet: null,
      averageTicket: null,
    });
  });

  it('vendiendo a costo o por debajo, ninguna cantidad de ventas paga los gastos', () => {
    expect(breakEven({ ...base, cost: 100_000 })).toMatchObject({ state: 'no-margin', monthlyNet: null });
    expect(breakEven({ ...base, cost: 120_000 })).toMatchObject({ state: 'no-margin', marginPercent: -20 });
  });
});

describe('monthProgress', () => {
  it('avance contra el punto de equilibrio y proyección al cierre del mes', () => {
    // 10 de 30 días: $20,000 vendidos de $50,000. Al ritmo de $2,000 al día: $60,000
    const result = monthProgress({ breakEvenNet: 50_000, netSales: 20_000, daysElapsed: 10, daysInMonth: 30 });

    expect(result).toEqual({ progressPercent: 40, reached: false, remainingNet: 30_000, projectedNet: 60_000, willReach: true });
  });

  it('al ritmo actual no llega', () => {
    const result = monthProgress({ breakEvenNet: 50_000, netSales: 10_000, daysElapsed: 15, daysInMonth: 30 });

    expect(result).toMatchObject({ projectedNet: 20_000, willReach: false });
  });

  it('ya cubrió los gastos', () => {
    const result = monthProgress({ breakEvenNet: 50_000, netSales: 55_000, daysElapsed: 20, daysInMonth: 30 });

    expect(result).toMatchObject({ reached: true, remainingNet: 0, progressPercent: 110 });
  });

  it('con menos de 3 días no proyecta: un día de ventas no es una tendencia', () => {
    const result = monthProgress({ breakEvenNet: 50_000, netSales: 5_000, daysElapsed: 1.5, daysInMonth: 30 });

    expect(result).toMatchObject({ projectedNet: null, willReach: null });
  });

  it('sin punto de equilibrio no hay avance que medir', () => {
    expect(monthProgress({ breakEvenNet: null, netSales: 5_000, daysElapsed: 10, daysInMonth: 30 })).toEqual({
      progressPercent: null,
      reached: false,
      remainingNet: null,
      projectedNet: null,
      willReach: null,
    });
  });
});

describe('daysInMonthOf', () => {
  it('cuenta los días del mes, también en año bisiesto', () => {
    expect(daysInMonthOf('2026-11-13')).toBe(30);
    expect(daysInMonthOf('2026-12-01')).toBe(31);
    expect(daysInMonthOf('2026-02-10')).toBe(28);
    expect(daysInMonthOf('2028-02-01')).toBe(29);
  });
});

// ── Servicio, con la base y los reportes simulados ──

type Expense = { _id: string; tenantId: string; name: string; amount: number; frequency: string; notes?: string; deletedAt: Date | null };

function setUp(initial: Expense[] = [], reports: unknown[] = [], inventory: object[] = [], sold: object[] = []) {
  const rows = [...initial];
  const calls: { filter?: Record<string, any>; update?: Record<string, any> }[] = [];
  const expenseModel = {
    find: (filter: Record<string, any>) => {
      calls.push({ filter });
      return { sort: () => ({ lean: async () => rows.filter((r) => r.tenantId === filter.tenantId && r.deletedAt === null) }) };
    },
    create: async (doc: Record<string, any>) => {
      const row = { _id: `e${rows.length + 1}`, deletedAt: null, ...doc } as Expense;
      rows.push(row);
      return { toObject: () => row };
    },
    findOneAndUpdate: (filter: Record<string, any>, update: Record<string, any>) => {
      calls.push({ filter, update });
      const row = rows.find((r) => r._id === filter._id && r.tenantId === filter.tenantId && r.deletedAt === null);
      if (row) Object.assign(row, update.$set);
      return { lean: async () => row ?? null };
    },
  };
  const productModel = { aggregate: async (pipeline: any[]) => (calls.push({ filter: pipeline[0].$match }), inventory) };
  const queue = [...reports];
  const reportsService = {
    timeZone: (tz?: string) => tz ?? 'America/Mexico_City',
    salesReport: async () => queue.shift(),
  };
  const saleModel = {
    find: (filter: Record<string, any>) => {
      calls.push({ filter });
      return { sort: () => ({ select: () => ({ lean: async () => sold }) }) };
    },
  };
  return { service: new FinanceService(expenseModel as never, productModel as never, saleModel as never, reportsService as never), rows, calls };
}

const expense = (values: Partial<Expense> = {}): Expense => ({
  _id: 'e1',
  tenantId: 't1',
  name: 'RENTA',
  amount: 8000,
  frequency: 'monthly',
  deletedAt: null,
  ...values,
});

const report = (subtotal: number, total: number, count: number, cost: number, linesWithoutCost = 0) => ({
  totals: { subtotal, total, count },
  profitability: { cost, profit: subtotal - cost, linesWithoutCost },
});

describe('FinanceService: gastos fijos', () => {
  it('lista solo los del negocio y suma lo que pesan al mes', async () => {
    const { service } = setUp([
      expense(),
      expense({ _id: 'e2', name: 'LUZ', amount: 900, frequency: 'bimonthly' }),
      expense({ _id: 'e3', tenantId: 'otro', name: 'AJENO', amount: 99_999 }),
    ]);

    const list = await service.listExpenses('t1');

    expect(list.items.map((i) => [i.name, i.monthlyAmount])).toEqual([
      ['RENTA', 8000],
      ['LUZ', 450],
    ]);
    expect(list.monthlyTotal).toBe(8450);
  });

  it('el total es la suma de lo que se ve, aunque haya centavos de redondeo', async () => {
    const { service } = setUp([expense({ amount: 100, frequency: 'quarterly' }), expense({ _id: 'e2', amount: 100, frequency: 'quarterly' })]);

    expect((await service.listExpenses('t1')).monthlyTotal).toBe(66.66);
  });

  it('crea con el nombre en mayúsculas', async () => {
    const { service, rows } = setUp();

    const created = await service.createExpense('t1', 'u1', { name: '  renta del local ', amount: 8000, frequency: 'monthly', notes: ' contrato ' });

    expect(created).toMatchObject({ name: 'RENTA DEL LOCAL', amount: 8000, notes: 'contrato', monthlyAmount: 8000 });
    expect(rows[0]).toMatchObject({ tenantId: 't1', createdBy: 'u1' });
  });

  it('edita solo lo que se manda', async () => {
    const { service } = setUp([expense()]);

    const updated = await service.updateExpense('t1', 'e1', { amount: 9000 });

    expect(updated).toMatchObject({ name: 'RENTA', amount: 9000 });
  });

  it('no edita ni borra el gasto de otro negocio', async () => {
    const { service } = setUp([expense({ tenantId: 'otro' })]);

    await expect(service.updateExpense('t1', 'e1', { amount: 1 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.removeExpense('t1', 'e1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('borrar lo oculta pero conserva el registro, y devuelve el nombre para la auditoría', async () => {
    const { service, rows } = setUp([expense()]);

    const removed = await service.removeExpense('t1', 'e1');

    expect(removed).toEqual({ _id: 'e1', name: 'RENTA' });
    expect(rows[0].deletedAt).toBeInstanceOf(Date);
    expect((await service.listExpenses('t1')).items).toEqual([]);
  });
});

describe('FinanceService: resumen', () => {
  // 13 de noviembre de 2026, 4 p.m. en México
  const now = new Date('2026-11-13T22:00:00Z');
  const inventory = [{ products: 4, withoutCost: 1, atCost: 5000, atPrice: 8120, atNetPrice: 7000 }];

  it('con gastos y ventas calcula el punto de equilibrio, el avance y el resultado del mes', async () => {
    const { service } = setUp(
      [expense({ amount: 15_000 })],
      [
        report(100_000, 116_000, 500, 70_000, 3), // últimos 30 días
        report(45_000, 52_200, 225, 31_500), // este mes, 13 días
      ],
      inventory,
    );

    const summary = await service.summary('t1', 'America/Mexico_City', now);

    expect(summary.fixedExpenses).toEqual({ monthly: 15_000, count: 1 });
    expect(summary.margin).toMatchObject({ percent: 30, referenceDays: 30, linesWithoutCost: 3 });
    expect(summary.breakEven).toMatchObject({ state: 'ok', monthlyNet: 50_000, monthlyWithTax: 58_000, averageTicket: 232 });
    // 58,000 entre los 30 días de noviembre
    expect(summary.breakEven.dailyWithTax).toBe(1933.33);
    expect(summary.breakEven.ticketsPerDay).toBe(9);

    expect(summary.month).toMatchObject({
      daysInMonth: 30,
      netSales: 45_000,
      cost: 31_500,
      grossProfit: 13_500,
      fixedExpenses: 15_000,
      netProfit: -1_500,
      progressPercent: 90,
      reached: false,
      remainingNet: 5_000,
    });
    expect(summary.month.remainingWithTax).toBe(5_800);
    expect(summary.month.willReach).toBe(true);
  });

  it('el inventario trae lo invertido y lo que dejaría venderlo', async () => {
    const { service } = setUp([expense()], [report(100, 116, 1, 70), report(100, 116, 1, 70)], inventory);

    const { inventory: stock } = await service.summary('t1', 'America/Mexico_City', now);

    expect(stock).toEqual({ products: 4, withoutCost: 1, atCost: 5000, atPrice: 8120, potentialProfit: 2000 });
  });

  it('sin inventario en la tienda, todo en cero', async () => {
    const { service } = setUp([expense()], [report(100, 116, 1, 70), report(100, 116, 1, 70)], []);

    expect((await service.summary('t1', 'America/Mexico_City', now)).inventory).toEqual({ products: 0, withoutCost: 0, atCost: 0, atPrice: 0, potentialProfit: 0 });
  });

  it('sin gastos registrados lo dice y no inventa un punto de equilibrio', async () => {
    const { service } = setUp([], [report(100_000, 116_000, 500, 70_000), report(45_000, 52_200, 225, 31_500)], inventory);

    const summary = await service.summary('t1', 'America/Mexico_City', now);

    expect(summary.breakEven).toMatchObject({ state: 'no-expenses', monthlyNet: null, dailyWithTax: null, ticketsPerDay: null });
    expect(summary.month).toMatchObject({ progressPercent: null, remainingWithTax: null, netProfit: 13_500 });
  });

  it('sin ventas todavía lo dice', async () => {
    const empty = report(0, 0, 0, 0);
    const { service } = setUp([expense()], [empty, empty], inventory);

    const summary = await service.summary('t1', 'America/Mexico_City', now);

    expect(summary.breakEven.state).toBe('no-sales');
    expect(summary.month.netProfit).toBe(-8000);
  });

  it('el mes empieza en la zona horaria de quien consulta', async () => {
    const { service } = setUp([expense()], [report(1, 1, 1, 0), report(1, 1, 1, 0)], inventory);

    // Las 3 a. m. del 1 de diciembre UTC todavía son noviembre en México
    const summary = await service.summary('t1', 'America/Mexico_City', new Date('2026-12-01T03:00:00Z'));

    expect(summary.month.from.toISOString()).toBe('2026-11-01T06:00:00.000Z');
    expect(summary.month.daysInMonth).toBe(30);
  });
});

describe('permisos de finanzas', () => {
  it('ver y administrar son permisos distintos', () => {
    const view = Reflect.getMetadata(PERMISSIONS_KEY, FinanceController.prototype.summary);
    const list = Reflect.getMetadata(PERMISSIONS_KEY, FinanceController.prototype.list);
    const products = Reflect.getMetadata(PERMISSIONS_KEY, FinanceController.prototype.products);
    const create = Reflect.getMetadata(PERMISSIONS_KEY, FinanceController.prototype.create);
    const update = Reflect.getMetadata(PERMISSIONS_KEY, FinanceController.prototype.update);
    const remove = Reflect.getMetadata(PERMISSIONS_KEY, FinanceController.prototype.remove);

    expect([view, list, products]).toEqual([['finance.view'], ['finance.view'], ['finance.view']]);
    expect([create, update, remove]).toEqual([['finance.manage'], ['finance.manage'], ['finance.manage']]);
  });

  it('por defecto solo el propietario ve las finanzas', () => {
    const role = (name: string) => SYSTEM_ROLES.find((r) => r.name === name)!.permissions;

    expect(role('Propietario')).toBe('all');
    for (const name of ['Encargado', 'Cajero']) {
      expect(role(name)).not.toContain('finance.view');
      expect(role(name)).not.toContain('finance.manage');
    }
  });
});
