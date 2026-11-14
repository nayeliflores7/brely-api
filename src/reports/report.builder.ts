import { priceLine } from '../common/money.js';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ReportSaleItem {
  productId: string;
  name: string;
  unit: string;
  unitPrice: number;
  unitCost: number;
  quantity: number;
  /** Todo lo que se le quitó a la línea: promoción más descuento dado en caja. */
  discount: number;
  /** La parte de `discount` que dio el cajero. Antes de los descuentos manuales no existe: era todo promoción. */
  manualDiscount?: number;
  taxRate?: number;
  promotionName: string | null;
}

export interface ReportSale {
  terminalId: string;
  soldAt: Date;
  status: string;
  subtotal: number; // ya con descuento y sin IVA
  tax: number;
  total: number;
  discount: number;
  manualDiscount?: number;
  discountReason?: string;
  createdByName?: string;
  items: ReportSaleItem[];
  payments: { method: string; amount: number }[];
}

export interface ReportSession {
  terminalId: string;
  number: number;
  closedAt: Date | null;
  countedCash: number | null;
  difference: number | null;
}

export interface ReportOptions {
  timeZone: string;
  includeCosts: boolean;
  from?: Date;
  to: Date;
  terminalLabel: (id: string) => string;
}

// Más de dos meses en barras diarias ya no se puede leer
const MAX_DAILY_POINTS = 62;

function dayFormatter(timeZone: string) {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return (date: Date) => format.format(date);
}

/** Los días locales, de uno en uno, entre dos instantes. */
function localDaysBetween(first: Date, last: Date, dayOf: (date: Date) => string): string[] {
  const days: string[] = [];
  for (let at = first.getTime(); at <= last.getTime(); at += 3_600_000 * 6) {
    const day = dayOf(new Date(at));
    if (days.at(-1) !== day) days.push(day);
  }
  const closing = dayOf(last);
  if (days.at(-1) !== closing) days.push(closing);
  return days;
}

/** Todos los días o meses del periodo, también los que no tuvieron ventas: un hueco también informa. */
function timeline(first: Date, last: Date, dayOf: (date: Date) => string) {
  const days = localDaysBetween(first, last, dayOf);
  if (days.length <= MAX_DAILY_POINTS) return { granularity: 'day' as const, keys: days };
  return { granularity: 'month' as const, keys: [...new Set(days.map((day) => day.slice(0, 7)))] };
}

/** Lunes primero, que es como se cuenta la semana en México: 0 = lunes ... 6 = domingo. */
const WEEKDAY_BY_NAME: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** El día de la semana (lunes = 0) de un día local en formato AAAA-MM-DD. */
function weekdayOfDay(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;
}

/** Qué parte de las ventas del día debe caber en el horario que se sugiere. */
const WINDOW_SHARE = 0.8;

/**
 * Lo que se puede decir de cuándo se vende: qué día rinde más y cuál menos, a qué hora se vende más y en qué
 * horario cae la mayor parte de las ventas (el tramo más corto de horas seguidas que reúne el 80 %).
 */
export function scheduleInsights(
  weekdays: { index: number; total: number; occurrences: number; averagePerDay: number | null }[],
  hours: { hour: number; total: number }[],
) {
  const withData = weekdays.filter((day) => day.averagePerDay !== null && day.occurrences > 0);
  const sold = withData.filter((day) => day.total > 0);
  const best = [...sold].sort((a, b) => b.averagePerDay! - a.averagePerDay!)[0] ?? null;
  // Los días más flojos: si varios empatan (por ejemplo, tres sin ventas), son todos, no el primero de la semana
  const lowest = withData.length > 1 ? Math.min(...withData.map((day) => day.averagePerDay!)) : null;
  const quietest = lowest === null ? [] : withData.filter((day) => day.averagePerDay === lowest);
  const allEqual = lowest !== null && quietest.length === withData.length;
  // Un día promedio: todo lo vendido entre todos los días que cubre el periodo
  const totalDays = withData.reduce((sum, day) => sum + day.occurrences, 0);
  const totalSold = weekdays.reduce((sum, day) => sum + day.total, 0);
  const averageDay = totalDays > 0 ? totalSold / totalDays : 0;

  const busiest = [...hours].sort((a, b) => b.total - a.total)[0];
  const hoursTotal = hours.reduce((sum, hour) => sum + hour.total, 0);

  // El tramo más corto de horas seguidas que reúne el 80 % de lo vendido; con empate, el que más vende
  let window: { from: number; to: number; share: number } | null = null;
  if (hoursTotal > 0) {
    let bestLength = 25;
    let bestSum = -1;
    for (let start = 0; start < 24; start++) {
      let sum = 0;
      for (let end = start; end < 24; end++) {
        sum += hours[end].total;
        const length = end - start + 1;
        if (sum >= hoursTotal * WINDOW_SHARE) {
          if (length < bestLength || (length === bestLength && sum > bestSum)) {
            bestLength = length;
            bestSum = sum;
            window = { from: start, to: end + 1, share: Math.round((sum / hoursTotal) * 1000) / 10 };
          }
          break;
        }
      }
    }
  }

  return {
    bestDay: best && { index: best.index, averagePerDay: best.averagePerDay! },
    quietestDays:
      lowest !== null && !allEqual
        ? {
            indexes: quietest.map((day) => day.index),
            averagePerDay: lowest,
            // Cuánto menos que un día promedio: negativo si vende menos
            vsAverage: averageDay > 0 ? Math.round((lowest / averageDay - 1) * 1000) / 10 : null,
          }
        : null,
    busiestHour: busiest && busiest.total > 0 ? { hour: busiest.hour, total: busiest.total } : null,
    window,
  };
}

export function buildReport(sales: ReportSale[], sessions: ReportSession[], options: ReportOptions) {
  const dayOf = dayFormatter(options.timeZone);
  const completed = sales.filter((sale) => sale.status === 'completed');
  const cancelled = sales.filter((sale) => sale.status === 'cancelled');

  let subtotal = 0;
  let tax = 0;
  let total = 0;
  let discount = 0;
  let cost = 0;
  let linesWithoutCost = 0;
  let belowCostLoss = 0;

  const byTerminal = new Map<string, { terminalId: string; name: string; count: number; total: number }>();
  const byPayment = new Map<string, number>();
  const byProduct = new Map<string, { productId: string; name: string; unit: string; quantity: number; amount: number; discount: number; cost: number }>();
  const byPromotion = new Map<string, { name: string; units: number; discount: number; sales: Set<number> }>();
  const byUser = new Map<string, { name: string; sales: number; discount: number }>();
  const byReason = new Map<string, { reason: string; sales: number; discount: number }>();
  let promotionDiscount = 0;
  let manualDiscount = 0;
  let salesWithPromotion = 0;
  let salesWithManual = 0;
  const belowCost = new Map<string, { productId: string; name: string; quantity: number; amount: number; cost: number; loss: number }>();
  const counts = new Map<string, { count: number; total: number }>();

  const first = options.from ?? (sales.length ? new Date(Math.min(...sales.map((s) => s.soldAt.getTime()))) : options.to);
  const time = timeline(first, options.to, dayOf);
  const bucket = (date: Date) => (time.granularity === 'day' ? dayOf(date) : dayOf(date).slice(0, 7));

  // Cuándo se vende: día de la semana y hora, en la zona horaria del negocio
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: options.timeZone, weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
  const weekly = Array.from({ length: 7 }, () => ({ count: 0, total: 0 }));
  const hourly = Array.from({ length: 24 }, () => ({ count: 0, total: 0 }));
  const heat = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));

  completed.forEach((sale, saleIndex) => {
    subtotal += sale.subtotal;
    tax += sale.tax;
    total += sale.total;

    const terminal = byTerminal.get(sale.terminalId) ?? {
      terminalId: sale.terminalId,
      name: options.terminalLabel(sale.terminalId),
      count: 0,
      total: 0,
    };
    terminal.count += 1;
    terminal.total += sale.total;
    byTerminal.set(sale.terminalId, terminal);

    const point = counts.get(bucket(sale.soldAt)) ?? { count: 0, total: 0 };
    point.count += 1;
    point.total += sale.total;
    counts.set(bucket(sale.soldAt), point);

    const parts = clock.formatToParts(sale.soldAt);
    const weekday = WEEKDAY_BY_NAME[parts.find((part) => part.type === 'weekday')?.value ?? ''] ?? 0;
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0) % 24;
    weekly[weekday].count += 1;
    weekly[weekday].total += sale.total;
    hourly[hour].count += 1;
    hourly[hour].total += sale.total;
    heat[weekday][hour] += sale.total;

    for (const payment of sale.payments) {
      byPayment.set(payment.method, (byPayment.get(payment.method) ?? 0) + payment.amount);
    }

    let saleManual = 0;
    let saleHasPromotion = false;
    for (const item of sale.items) {
      // Los precios incluyen IVA; lo que entra al negocio y el costo de los descuentos van sin él
      const { net, discountNet: lineDiscount } = priceLine(item.unitPrice, item.quantity, item.discount ?? 0, item.taxRate ?? 0);
      discount += lineDiscount;
      // Lo que el cajero dio y lo que dio la promoción se cuentan aparte
      const manualPart = Math.min(Math.max(item.manualDiscount ?? 0, 0), item.discount ?? 0);
      const promotionNet = manualPart > 0
        ? priceLine(item.unitPrice, item.quantity, round2((item.discount ?? 0) - manualPart), item.taxRate ?? 0).discountNet
        : lineDiscount;
      const manualNet = round2(lineDiscount - promotionNet);
      promotionDiscount += promotionNet;
      manualDiscount += manualNet;
      saleManual += manualNet;
      if (promotionNet > 0) saleHasPromotion = true;
      const lineCost = round2((item.unitCost ?? 0) * item.quantity);
      cost += lineCost;
      if (!item.unitCost) linesWithoutCost += 1;

      const product = byProduct.get(item.productId) ?? {
        productId: item.productId,
        name: item.name,
        unit: item.unit,
        quantity: 0,
        amount: 0,
        discount: 0,
        cost: 0,
      };
      product.quantity += item.quantity;
      product.amount += net;
      product.discount += lineDiscount;
      product.cost += lineCost;
      byProduct.set(item.productId, product);

      if (promotionNet > 0) {
        const key = item.promotionName ?? 'PROMOCIÓN';
        const promotion = byPromotion.get(key) ?? { name: key, units: 0, discount: 0, sales: new Set<number>() };
        promotion.units += item.quantity;
        promotion.discount += promotionNet;
        promotion.sales.add(saleIndex);
        byPromotion.set(key, promotion);
      }

      // Sin costo capturado no se puede saber si hubo pérdida
      if (item.unitCost > 0 && net < lineCost) {
        const loss = round2(lineCost - net);
        belowCostLoss += loss;
        const row = belowCost.get(item.productId) ?? { productId: item.productId, name: item.name, quantity: 0, amount: 0, cost: 0, loss: 0 };
        row.quantity += item.quantity;
        row.amount += net;
        row.cost += lineCost;
        row.loss += loss;
        belowCost.set(item.productId, row);
      }
    }

    if (saleHasPromotion) salesWithPromotion += 1;
    if (saleManual > 0) {
      salesWithManual += 1;
      const user = sale.createdByName?.trim() || '—';
      const byWho = byUser.get(user) ?? { name: user, sales: 0, discount: 0 };
      byWho.sales += 1;
      byWho.discount += saleManual;
      byUser.set(user, byWho);
      const reason = sale.discountReason?.trim().toUpperCase() || 'SIN MOTIVO';
      const byWhy = byReason.get(reason) ?? { reason, sales: 0, discount: 0 };
      byWhy.sales += 1;
      byWhy.discount += saleManual;
      byReason.set(reason, byWhy);
    }
  });

  const differences = sessions
    .filter((session) => session.closedAt && round2(session.difference ?? 0) !== 0)
    .map((session) => ({
      terminalId: session.terminalId,
      terminalName: options.terminalLabel(session.terminalId),
      number: session.number,
      closedAt: session.closedAt as Date,
      countedCash: session.countedCash ?? 0,
      difference: round2(session.difference ?? 0),
    }))
    .sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime());

  const totals = {
    count: completed.length,
    gross: round2(subtotal + discount),
    // Todo lo que se quitó: promociones más descuentos dados en caja
    discount: round2(discount),
    promotionDiscount: round2(promotionDiscount),
    manualDiscount: round2(manualDiscount),
    subtotal: round2(subtotal),
    tax: round2(tax),
    total: round2(total),
    average: completed.length ? round2(total / completed.length) : 0,
    cancelledCount: cancelled.length,
    cancelledTotal: round2(cancelled.reduce((sum, sale) => sum + sale.total, 0)),
  };

  const promotions = {
    discount: totals.promotionDiscount,
    salesWithPromotion,
    rows: [...byPromotion.values()]
      .map((row) => ({ name: row.name, units: round2(row.units), discount: round2(row.discount), sales: row.sales.size }))
      .sort((a, b) => b.discount - a.discount),
  };

  // Descuentos que dio el cajero al cobrar (no los de las promociones)
  const discounts = {
    discount: totals.manualDiscount,
    salesWithDiscount: salesWithManual,
    // Qué parte del importe antes de descuentos se regaló en caja
    percentOfGross: totals.gross > 0 ? round2((manualDiscount / totals.gross) * 100) : 0,
    byUser: [...byUser.values()]
      .map((row) => ({ ...row, discount: round2(row.discount) }))
      .sort((a, b) => b.discount - a.discount),
    byReason: [...byReason.values()]
      .map((row) => ({ ...row, discount: round2(row.discount) }))
      .sort((a, b) => b.discount - a.discount),
  };

  // Cuántas veces se repite cada día de la semana en el periodo: el promedio de un martes se saca entre martes
  const periodDays = localDaysBetween(first, options.to, dayOf);
  const occurrences = new Array<number>(7).fill(0);
  for (const day of periodDays) occurrences[weekdayOfDay(day)] += 1;
  const weekdays = weekly.map((day, index) => ({
    index,
    count: day.count,
    total: round2(day.total),
    occurrences: occurrences[index],
    averagePerDay: occurrences[index] > 0 ? round2(day.total / occurrences[index]) : null,
  }));
  const hours = hourly.map((hour, index) => ({ hour: index, count: hour.count, total: round2(hour.total) }));
  const schedule = {
    days: periodDays.length,
    weekdays,
    hours,
    heatmap: heat.map((row) => row.map(round2)),
    insights: scheduleInsights(weekdays, hours),
  };

  const topProducts = [...byProduct.values()]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 20)
    .map((row) => ({
      productId: row.productId,
      name: row.name,
      unit: row.unit,
      quantity: round2(row.quantity),
      amount: round2(row.amount),
      discount: round2(row.discount),
      ...(options.includeCosts ? { profit: round2(row.amount - row.cost) } : {}),
    }));

  const report = {
    granularity: time.granularity,
    totals,
    timeline: time.keys.map((key) => ({
      key,
      count: counts.get(key)?.count ?? 0,
      total: round2(counts.get(key)?.total ?? 0),
    })),
    byTerminal: [...byTerminal.values()]
      .map((row) => ({ ...row, total: round2(row.total) }))
      .sort((a, b) => b.total - a.total),
    byPayment: [...byPayment.entries()]
      .map(([method, amount]) => ({ method, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount),
    topProducts,
    promotions,
    discounts,
    schedule,
    cash: {
      shortage: round2(differences.filter((d) => d.difference < 0).reduce((sum, d) => sum + d.difference, 0)),
      overage: round2(differences.filter((d) => d.difference > 0).reduce((sum, d) => sum + d.difference, 0)),
      differences,
    },
  };

  if (!options.includeCosts) return report;

  const profit = round2(subtotal - cost);
  return {
    ...report,
    profitability: {
      cost: round2(cost),
      profit,
      // Lo que se habría ganado con los mismos artículos a precio normal
      profitWithoutPromotions: round2(profit + promotionDiscount),
      // Y sin ningún descuento: ni promociones ni los dados en caja
      profitWithoutDiscounts: round2(profit + discount),
      margin: subtotal > 0 ? round2((profit / subtotal) * 100) : 0,
      linesWithoutCost,
      belowCostLoss: round2(belowCostLoss),
      belowCost: [...belowCost.values()]
        .map((row) => ({ ...row, quantity: round2(row.quantity), amount: round2(row.amount), cost: round2(row.cost), loss: round2(row.loss) }))
        .sort((a, b) => b.loss - a.loss),
    },
  };
}

export type SalesReport = ReturnType<typeof buildReport>;
