const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ReportSaleItem {
  productId: string;
  name: string;
  unit: string;
  unitPrice: number;
  unitCost: number;
  quantity: number;
  discount: number;
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

/** Todos los días o meses del periodo, también los que no tuvieron ventas: un hueco también informa. */
function timeline(first: Date, last: Date, dayOf: (date: Date) => string) {
  const days: string[] = [];
  for (let at = first.getTime(); at <= last.getTime(); at += 3_600_000 * 6) {
    const day = dayOf(new Date(at));
    if (days.at(-1) !== day) days.push(day);
  }
  const closing = dayOf(last);
  if (days.at(-1) !== closing) days.push(closing);
  if (days.length <= MAX_DAILY_POINTS) return { granularity: 'day' as const, keys: days };
  return { granularity: 'month' as const, keys: [...new Set(days.map((day) => day.slice(0, 7)))] };
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
  const belowCost = new Map<string, { productId: string; name: string; quantity: number; amount: number; cost: number; loss: number }>();
  const counts = new Map<string, { count: number; total: number }>();

  const first = options.from ?? (sales.length ? new Date(Math.min(...sales.map((s) => s.soldAt.getTime()))) : options.to);
  const time = timeline(first, options.to, dayOf);
  const bucket = (date: Date) => (time.granularity === 'day' ? dayOf(date) : dayOf(date).slice(0, 7));

  completed.forEach((sale, saleIndex) => {
    subtotal += sale.subtotal;
    tax += sale.tax;
    total += sale.total;
    discount += sale.discount;

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

    for (const payment of sale.payments) {
      byPayment.set(payment.method, (byPayment.get(payment.method) ?? 0) + payment.amount);
    }

    for (const item of sale.items) {
      const lineDiscount = item.discount ?? 0;
      const net = round2(item.unitPrice * item.quantity - lineDiscount);
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

      if (lineDiscount > 0) {
        const key = item.promotionName ?? 'PROMOCIÓN';
        const promotion = byPromotion.get(key) ?? { name: key, units: 0, discount: 0, sales: new Set<number>() };
        promotion.units += item.quantity;
        promotion.discount += lineDiscount;
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
    discount: round2(discount),
    subtotal: round2(subtotal),
    tax: round2(tax),
    total: round2(total),
    average: completed.length ? round2(total / completed.length) : 0,
    cancelledCount: cancelled.length,
    cancelledTotal: round2(cancelled.reduce((sum, sale) => sum + sale.total, 0)),
  };

  const promotions = {
    discount: totals.discount,
    salesWithPromotion: completed.filter((sale) => sale.discount > 0).length,
    rows: [...byPromotion.values()]
      .map((row) => ({ name: row.name, units: round2(row.units), discount: round2(row.discount), sales: row.sales.size }))
      .sort((a, b) => b.discount - a.discount),
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
      profitWithoutPromotions: round2(profit + discount),
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
