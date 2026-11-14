import { priceLine } from '../common/money.js';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;

export type ExpenseFrequency = 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual';

export const EXPENSE_FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'] as const;

/**
 * Cada cuántos meses se paga. Un gasto anual pesa 1/12 cada mes. Una semana es 12/52 de mes (el año tiene 52 semanas)
 * y una quincena, medio mes (24 quincenas al año).
 */
export const FREQUENCY_MONTHS: Record<ExpenseFrequency, number> = {
  weekly: 12 / 52,
  biweekly: 0.5,
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/** Lo que un gasto representa cada mes: la luz que se paga cada dos meses pesa la mitad cada mes. */
export const monthlyAmount = (amount: number, frequency: ExpenseFrequency) => round2(amount / FREQUENCY_MONTHS[frequency]);

export interface BreakEvenInput {
  /** Lo que se paga cada mes aunque no se venda nada. */
  monthlyFixed: number;
  /** Ventas del periodo de referencia, sin IVA y después de descuentos. */
  netSales: number;
  /** Lo que costó la mercancía de esas ventas. */
  cost: number;
  /** Las mismas ventas, con el IVA incluido: lo que marcó la caja. */
  salesWithTax: number;
  salesCount: number;
}

/**
 * ok: se pudo calcular. no-expenses: aún no hay gastos fijos registrados. no-sales: sin ventas de las que sacar
 * el margen. no-margin: se vende a costo o por debajo: ninguna cantidad de ventas pagaría los gastos.
 */
export type BreakEvenState = 'ok' | 'no-expenses' | 'no-sales' | 'no-margin';

/**
 * Punto de equilibrio: cuánto hay que vender al mes para que lo que queda de cada venta (el margen) cubra los
 * gastos fijos: gastos fijos / margen. Se calcula sin IVA, porque el IVA que se cobra no es dinero del negocio;
 * y se traduce a lo que marcaría la caja, con el IVA que traen los precios.
 */
export function breakEven(input: BreakEvenInput) {
  const margin = input.netSales > 0 ? (input.netSales - input.cost) / input.netSales : null;
  const state: BreakEvenState =
    input.monthlyFixed <= 0 ? 'no-expenses' : margin === null ? 'no-sales' : margin <= 0 ? 'no-margin' : 'ok';

  // Cuánto IVA traen en promedio las ventas: 1.16 si todo lleva el 16 %
  const taxFactor = input.netSales > 0 ? input.salesWithTax / input.netSales : 1;
  const monthlyNet = state === 'ok' ? round2(input.monthlyFixed / margin!) : null;
  const monthlyWithTax = monthlyNet === null ? null : round2(monthlyNet * taxFactor);
  const averageTicket = input.salesCount > 0 ? round2(input.salesWithTax / input.salesCount) : null;

  return {
    state,
    /** De cada $100 que se venden (sin IVA), cuántos quedan después de pagar la mercancía. */
    marginPercent: margin === null ? null : round1(margin * 100),
    monthlyNet,
    monthlyWithTax,
    averageTicket,
  };
}

/** Desde cuántos días de mes hay datos suficientes para proyectar: antes sería adivinar con un día de ventas. */
export const MIN_DAYS_TO_PROJECT = 3;

export interface MonthProgressInput {
  /** Punto de equilibrio mensual, sin IVA. null si no se pudo calcular. */
  breakEvenNet: number | null;
  /** Lo vendido en el mes hasta ahora, sin IVA. */
  netSales: number;
  /** Días transcurridos del mes, con fracción. */
  daysElapsed: number;
  daysInMonth: number;
}

/** Cómo va el mes contra el punto de equilibrio. */
export function monthProgress(input: MonthProgressInput) {
  const { breakEvenNet, netSales } = input;
  if (breakEvenNet === null) {
    return { progressPercent: null, reached: false, remainingNet: null, projectedNet: null, willReach: null };
  }
  const projectedNet = input.daysElapsed >= MIN_DAYS_TO_PROJECT ? round2((netSales / input.daysElapsed) * input.daysInMonth) : null;
  return {
    progressPercent: round1((netSales / breakEvenNet) * 100),
    reached: netSales >= breakEvenNet,
    remainingNet: round2(Math.max(0, breakEvenNet - netSales)),
    projectedNet,
    willReach: projectedNet === null ? null : projectedNet >= breakEvenNet,
  };
}

/** Los días del mes de una fecha en formato AAAA-MM-DD. */
export function daysInMonthOf(localDay: string): number {
  const [year, month] = localDay.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export interface ProfitLine {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  /** Precio de venta, con IVA. */
  unitPrice: number;
  /** Lo que costó cada pieza cuando se vendió. 0 si no se había capturado. */
  unitCost: number;
  /** Todo lo que se le quitó a la línea: promoción más descuento dado en caja. */
  discount: number;
  taxRate: number;
}

/**
 * Cuánto deja cada producto: lo que entró por él (sin IVA y ya con descuentos) menos lo que costó la mercancía
 * vendida. Misma regla de línea que los reportes. Ordenado de más a menos utilidad.
 */
export function productProfits(lines: ProfitLine[]) {
  const byProduct = new Map<
    string,
    { productId: string; name: string; unit: string; quantity: number; netSales: number; cost: number; linesWithoutCost: number }
  >();

  for (const line of lines) {
    // Los precios incluyen IVA: lo que entra al negocio va sin él
    const { net } = priceLine(line.unitPrice, line.quantity, line.discount ?? 0, line.taxRate ?? 0);
    const row = byProduct.get(line.productId) ?? {
      productId: line.productId,
      name: line.name,
      unit: line.unit,
      quantity: 0,
      netSales: 0,
      cost: 0,
      linesWithoutCost: 0,
    };
    row.quantity += line.quantity;
    row.netSales += net;
    row.cost += round2((line.unitCost ?? 0) * line.quantity);
    // Sin costo capturado la utilidad se vería completa: se avisa
    if (!(line.unitCost > 0)) row.linesWithoutCost += 1;
    // Si el producto cambió de nombre, el de la venta más reciente: las líneas llegan de la más vieja a la más nueva
    row.name = line.name;
    byProduct.set(line.productId, row);
  }

  const rows = [...byProduct.values()].map((row) => ({
    productId: row.productId,
    name: row.name,
    unit: row.unit,
    quantity: Math.round(row.quantity * 1000) / 1000,
    netSales: round2(row.netSales),
    cost: round2(row.cost),
    profit: round2(row.netSales - row.cost),
    linesWithoutCost: row.linesWithoutCost,
  }));

  const netSales = round2(rows.reduce((sum, row) => sum + row.netSales, 0));
  const cost = round2(rows.reduce((sum, row) => sum + row.cost, 0));
  const profit = round2(netSales - cost);

  const ranked = rows
    .map((row) => ({
      ...row,
      /** De cada $100 que se venden de este producto (sin IVA), cuántos quedan. */
      marginPercent: row.netSales > 0 ? round1((row.profit / row.netSales) * 100) : null,
      /** Qué parte de toda la utilidad viene de este producto. Solo tiene sentido si en total hubo utilidad. */
      shareOfProfit: profit > 0 ? round1((row.profit / profit) * 100) : null,
    }))
    .sort((a, b) => b.profit - a.profit || b.netSales - a.netSales || a.name.localeCompare(b.name, 'es'));

  const TOP = 5;
  const topProfit = ranked.slice(0, TOP).reduce((sum, row) => sum + row.profit, 0);
  return {
    rows: ranked,
    totals: {
      products: ranked.length,
      netSales,
      cost,
      profit,
      /** Productos que se vendieron por debajo de su costo: cada pieza vendida hizo perder dinero. */
      losing: ranked.filter((row) => row.profit < 0).length,
      /** Productos con alguna venta sin costo capturado. */
      withoutCost: ranked.filter((row) => row.linesWithoutCost > 0).length,
      /** Qué parte de la utilidad total dejan los 5 que más dejan. Solo si hay más de 5 productos. */
      topShare: profit > 0 && ranked.length > TOP ? round1((topProfit / profit) * 100) : null,
      topCount: TOP,
    },
  };
}

export type ProfitPeriod = 'month' | 'last30' | 'lastMonth';
export const PROFIT_PERIODS = ['month', 'last30', 'lastMonth'] as const;
