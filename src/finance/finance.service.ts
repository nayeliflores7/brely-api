import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from '../products/schemas/product.schema.js';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema.js';
import { localDay, localDayStart } from '../reports/email/daily-report.email.js';
import { ReportsService } from '../reports/reports.service.js';
import { CreateFixedExpenseDto, UpdateFixedExpenseDto } from './dto/fixed-expense.dto.js';
import { breakEven, daysInMonthOf, monthlyAmount, monthProgress, productProfits, type ProfitLine, type ProfitPeriod } from './finance.js';
import { FixedExpense, FixedExpenseDocument } from './schemas/fixed-expense.schema.js';

const DAY_MS = 86_400_000;
/** Con cuántos días de ventas se calcula el margen: lo de un solo día o una sola semana engaña. */
export const MARGIN_REFERENCE_DAYS = 30;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Cuántos productos como máximo trae la lista: una tienda pequeña no se acerca. */
const MAX_PROFIT_ROWS = 1000;

/** El periodo en que se mide la utilidad de cada producto, con el mes empezando a la hora de quien consulta. */
export function profitRange(period: ProfitPeriod, now: Date, timeZone: string): { from: Date; to: Date } {
  const today = localDay(now, timeZone);
  // A mediodía UTC para caer en el día correcto de cualquier zona, también con cambio de horario
  const startOf = (year: number, month: number) =>
    localDayStart(new Date(`${year}-${String(month).padStart(2, '0')}-01T12:00:00Z`), timeZone);
  const [year, month] = today.split('-').map(Number);
  const monthStart = startOf(year, month);

  if (period === 'last30') return { from: new Date(now.getTime() - MARGIN_REFERENCE_DAYS * DAY_MS), to: now };
  if (period === 'lastMonth') {
    const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
    return { from: startOf(previous.year, previous.month), to: new Date(monthStart.getTime() - 1) };
  }
  return { from: monthStart, to: now };
}

@Injectable()
export class FinanceService {
  constructor(
    @InjectModel(FixedExpense.name) private readonly expenses: Model<FixedExpenseDocument>,
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    @InjectModel(Sale.name) private readonly sales: Model<SaleDocument>,
    private readonly reports: ReportsService,
  ) {}

  // ── Gastos fijos ──

  async listExpenses(tenantId: string) {
    const rows = await this.expenses.find({ tenantId, deletedAt: null }).sort({ name: 1 }).lean();
    const items = rows.map((row) => this.present(row));
    // La suma de lo que se ve en la tabla: si cada fila se redondea, el total también
    return { items, monthlyTotal: round2(items.reduce((sum, item) => sum + item.monthlyAmount, 0)) };
  }

  async createExpense(tenantId: string, userId: string, dto: CreateFixedExpenseDto) {
    const created = await this.expenses.create({
      tenantId,
      name: dto.name.trim().toUpperCase(),
      amount: dto.amount,
      frequency: dto.frequency,
      notes: dto.notes?.trim() ?? '',
      createdBy: userId,
    });
    return this.present(created.toObject());
  }

  async updateExpense(tenantId: string, id: string, dto: UpdateFixedExpenseDto) {
    const changes: Record<string, unknown> = {};
    if (dto.name !== undefined) changes.name = dto.name.trim().toUpperCase();
    if (dto.amount !== undefined) changes.amount = dto.amount;
    if (dto.frequency !== undefined) changes.frequency = dto.frequency;
    if (dto.notes !== undefined) changes.notes = dto.notes.trim();

    const updated = await this.expenses
      .findOneAndUpdate({ _id: id, tenantId, deletedAt: null }, { $set: changes }, { new: true })
      .lean();
    if (!updated) throw new NotFoundException('Expense not found');
    return this.present(updated);
  }

  async removeExpense(tenantId: string, id: string) {
    const removed = await this.expenses
      .findOneAndUpdate({ _id: id, tenantId, deletedAt: null }, { $set: { deletedAt: new Date() } })
      .lean();
    if (!removed) throw new NotFoundException('Expense not found');
    // Con el nombre: la auditoría lo muestra aunque el gasto ya no exista
    return { _id: removed._id, name: removed.name };
  }

  private present(row: { _id: string; name: string; amount: number; frequency: FixedExpense['frequency']; notes?: string }) {
    return {
      _id: row._id,
      name: row.name,
      amount: row.amount,
      frequency: row.frequency,
      notes: row.notes ?? '',
      /** Lo que pesa cada mes: la luz que se paga cada dos meses cuenta la mitad. */
      monthlyAmount: monthlyAmount(row.amount, row.frequency),
    };
  }

  // ── Resumen ──

  async summary(tenantId: string, tz?: string, now = new Date()) {
    const timeZone = this.reports.timeZone(tz);
    const today = localDay(now, timeZone);
    // A mediodía UTC para caer en el día correcto de cualquier zona, también con cambio de horario
    const monthStart = localDayStart(new Date(`${today.slice(0, 7)}-01T12:00:00Z`), timeZone);
    const referenceStart = new Date(now.getTime() - MARGIN_REFERENCE_DAYS * DAY_MS);
    const range = (from: Date) => ({ from: from.toISOString(), to: now.toISOString(), tz: timeZone });

    const [expenses, reference, month, inventory] = await Promise.all([
      this.listExpenses(tenantId),
      this.reports.salesReport(tenantId, range(referenceStart), true),
      this.reports.salesReport(tenantId, range(monthStart), true),
      this.inventoryValue(tenantId),
    ]);
    if (!('profitability' in reference) || !('profitability' in month)) throw new Error('El reporte de ventas no trae costos');

    const daysInMonth = daysInMonthOf(today);
    const daysElapsed = (now.getTime() - monthStart.getTime()) / DAY_MS;

    const equilibrium = breakEven({
      monthlyFixed: expenses.monthlyTotal,
      netSales: reference.totals.subtotal,
      cost: reference.profitability.cost,
      salesWithTax: reference.totals.total,
      salesCount: reference.totals.count,
    });
    const progress = monthProgress({ breakEvenNet: equilibrium.monthlyNet, netSales: month.totals.subtotal, daysElapsed, daysInMonth });

    const grossProfit = month.profitability.profit;
    return {
      generatedAt: now,
      timeZone,
      fixedExpenses: { monthly: expenses.monthlyTotal, count: expenses.items.length },
      margin: {
        percent: equilibrium.marginPercent,
        referenceDays: MARGIN_REFERENCE_DAYS,
        netSales: reference.totals.subtotal,
        cost: reference.profitability.cost,
        salesCount: reference.totals.count,
        /** Ventas de productos sin costo capturado: el margen se ve mayor al real. */
        linesWithoutCost: reference.profitability.linesWithoutCost,
      },
      breakEven: {
        state: equilibrium.state,
        monthlyNet: equilibrium.monthlyNet,
        monthlyWithTax: equilibrium.monthlyWithTax,
        dailyWithTax: equilibrium.monthlyWithTax === null ? null : round2(equilibrium.monthlyWithTax / daysInMonth),
        averageTicket: equilibrium.averageTicket,
        ticketsPerDay:
          equilibrium.monthlyWithTax === null || !equilibrium.averageTicket
            ? null
            : Math.ceil(equilibrium.monthlyWithTax / daysInMonth / equilibrium.averageTicket),
      },
      month: {
        from: monthStart,
        daysInMonth,
        daysElapsed: Math.round(daysElapsed * 10) / 10,
        daysLeft: Math.max(0, daysInMonth - Math.floor(daysElapsed)),
        netSales: month.totals.subtotal,
        salesWithTax: month.totals.total,
        salesCount: month.totals.count,
        cost: month.profitability.cost,
        grossProfit,
        fixedExpenses: expenses.monthlyTotal,
        // El mes completo de gastos contra lo vendido hasta hoy: sale negativo hasta llegar al punto de equilibrio
        netProfit: round2(grossProfit - expenses.monthlyTotal),
        ...progress,
        remainingWithTax:
          progress.remainingNet === null || equilibrium.monthlyNet === null || equilibrium.monthlyWithTax === null
            ? null
            : round2(progress.remainingNet * (equilibrium.monthlyWithTax / equilibrium.monthlyNet)),
      },
      inventory,
    };
  }

  /** Cuánto deja cada producto en el periodo: lo vendido sin IVA menos lo que costó la mercancía. */
  async productProfit(tenantId: string, period: ProfitPeriod = 'month', tz?: string, now = new Date()) {
    const timeZone = this.reports.timeZone(tz);
    const { from, to } = profitRange(period, now, timeZone);
    const sales = await this.sales
      .find({ tenantId, status: 'completed', deletedAt: null, soldAt: { $gte: from, $lte: to } })
      .sort({ soldAt: 1 })
      .select('items')
      .lean<{ items: (Omit<ProfitLine, 'unitCost' | 'discount' | 'taxRate'> & { unitCost?: number; discount?: number; taxRate?: number })[] }[]>();

    const lines: ProfitLine[] = sales.flatMap((sale) =>
      sale.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost ?? 0,
        discount: item.discount ?? 0,
        taxRate: item.taxRate ?? 0,
      })),
    );
    const result = productProfits(lines);
    return { period, from, to, timeZone, ...result, rows: result.rows.slice(0, MAX_PROFIT_ROWS) };
  }

  /** El dinero que hay en la mercancía que aún está en la tienda. */
  private async inventoryValue(tenantId: string) {
    const [row] = await this.products.aggregate<{
      products: number;
      withoutCost: number;
      atCost: number;
      atPrice: number;
      atNetPrice: number;
    }>([
      { $match: { tenantId, active: true, trackStock: true, deletedAt: null, stock: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          products: { $sum: 1 },
          withoutCost: { $sum: { $cond: [{ $gt: ['$cost', 0] }, 0, 1] } },
          atCost: { $sum: { $multiply: ['$stock', '$cost'] } },
          atPrice: { $sum: { $multiply: ['$stock', '$price'] } },
          atNetPrice: { $sum: { $multiply: ['$stock', { $divide: ['$price', { $add: [1, '$taxRate'] }] }] } },
        },
      },
    ]);
    const atCost = round2(row?.atCost ?? 0);
    return {
      products: row?.products ?? 0,
      withoutCost: row?.withoutCost ?? 0,
      atCost,
      /** Lo que entraría a la caja si se vendiera todo, con el IVA incluido. */
      atPrice: round2(row?.atPrice ?? 0),
      /** Lo que quedaría de ganancia, sin IVA y ya pagada la mercancía. */
      potentialProfit: round2((row?.atNetPrice ?? 0) - atCost),
    };
  }
}
