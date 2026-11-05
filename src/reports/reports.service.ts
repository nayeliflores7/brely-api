import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import ExcelJS from 'exceljs';
import { Model } from 'mongoose';
import { CashSession, CashSessionDocument } from '../cash/schemas/cash-session.schema.js';
import { Product, ProductDocument } from '../products/schemas/product.schema.js';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema.js';
import { TerminalsService } from '../terminals/terminals.service.js';
import { ReportQuery } from './dto/report.dto.js';
import { buildReport, ReportSale, ReportSession, SalesReport } from './report.builder.js';

const DEFAULT_TIME_ZONE = 'America/Mexico_City';
const PAYMENT_LABELS: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' };
const MONEY = '"$"#,##0.00;[Red]-"$"#,##0.00';

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Sale.name) private readonly sales: Model<SaleDocument>,
    @InjectModel(CashSession.name) private readonly sessions: Model<CashSessionDocument>,
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    private readonly terminals: TerminalsService,
  ) {}

  timeZone(value?: string): string {
    const timeZone = value || DEFAULT_TIME_ZONE;
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone });
      return timeZone;
    } catch {
      throw new BadRequestException('Invalid time zone');
    }
  }

  // La misma regla de stock bajo que usa el POS
  async lowStock(tenantId: string, limit = 10) {
    const filter = { tenantId, active: true, trackStock: true, deletedAt: null, $expr: { $lte: ['$stock', '$minStock'] } };
    const [items, total] = await Promise.all([
      this.products.find(filter).select('name stock minStock unit').sort({ stock: 1 }).limit(limit).lean(),
      this.products.countDocuments(filter),
    ]);
    return { items: items.map((p) => ({ name: p.name, stock: p.stock, minStock: p.minStock, unit: p.unit })), total };
  }

  async salesReport(tenantId: string, q: ReportQuery, includeCosts: boolean) {
    const timeZone = this.timeZone(q.tz);
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : new Date();
    if (from && from > to) throw new BadRequestException('from must be before to');

    const range = { ...(from ? { $gte: from } : {}), $lte: to };
    const scope = { tenantId, ...(q.terminalId ? { terminalId: q.terminalId } : {}) };
    const [sales, sessions, options] = await Promise.all([
      this.sales
        .find({ ...scope, soldAt: range, deletedAt: null })
        .select('terminalId soldAt status subtotal tax total discount items payments')
        .lean<ReportSale[]>(),
      this.sessions
        .find({ ...scope, status: 'closed', closedAt: range, deletedAt: null })
        .select('terminalId number closedAt countedCash difference')
        .lean<ReportSession[]>(),
      this.terminals.options(tenantId),
    ]);
    const names = new Map(options.map((t) => [t._id, t.deleted ? `${t.name} (eliminada)` : t.name]));

    return buildReport(sales, sessions, {
      timeZone,
      includeCosts,
      from,
      to,
      terminalLabel: (id) => (id === 'admin' ? 'Panel web' : (names.get(id) ?? '—')),
    });
  }

  async excel(tenantId: string, q: ReportQuery, includeCosts: boolean): Promise<Buffer> {
    const report = await this.salesReport(tenantId, q, includeCosts);
    const timeZone = this.timeZone(q.tz);
    const book = new ExcelJS.Workbook();

    const sheet = (name: string, columns: { header: string; width: number; money?: boolean }[]) => {
      const added = book.addWorksheet(name);
      added.columns = columns.map((column) => ({
        header: column.header,
        width: column.width,
        style: column.money ? { numFmt: MONEY } : {},
      }));
      added.getRow(1).font = { bold: true };
      added.views = [{ state: 'frozen', ySplit: 1 }];
      return added;
    };

    const summary = sheet('Resumen', [
      { header: 'Concepto', width: 38 },
      { header: 'Valor', width: 16, money: true },
    ]);
    const { totals } = report;
    summary.addRows([
      ['Subtotal antes de descuentos', totals.gross],
      ['Descuentos por promociones', -totals.discount],
      ['Subtotal', totals.subtotal],
      ['IVA', totals.tax],
      ['Total vendido', totals.total],
      ['Ticket promedio', totals.average],
      ['Faltantes de caja', report.cash.shortage],
      ['Sobrantes de caja', report.cash.overage],
      ['Importe de ventas canceladas', totals.cancelledTotal],
    ]);
    if ('profitability' in report) {
      summary.addRows([
        ['Costo de lo vendido', report.profitability.cost],
        ['Utilidad', report.profitability.profit],
        ['Utilidad sin promociones', report.profitability.profitWithoutPromotions],
        ['Pérdida por vender bajo costo', -report.profitability.belowCostLoss],
      ]);
    }
    // Conteos al final y sin formato de dinero
    for (const [label, value] of [
      ['Número de ventas', totals.count],
      ['Ventas canceladas', totals.cancelledCount],
      ['Ventas con promoción', report.promotions.salesWithPromotion],
    ] as const) {
      summary.addRow([label, value]).getCell(2).numFmt = '0';
    }

    const timeline = sheet(report.granularity === 'day' ? 'Por día' : 'Por mes', [
      { header: report.granularity === 'day' ? 'Día' : 'Mes', width: 14 },
      { header: 'Ventas', width: 10 },
      { header: 'Total', width: 16, money: true },
    ]);
    timeline.addRows(report.timeline.map((p) => [p.key, p.count, p.total]));

    const terminals = sheet('Por terminal', [
      { header: 'Terminal', width: 32 },
      { header: 'Ventas', width: 10 },
      { header: 'Total', width: 16, money: true },
    ]);
    terminals.addRows(report.byTerminal.map((t) => [t.name, t.count, t.total]));

    const payments = sheet('Formas de pago', [
      { header: 'Forma de pago', width: 20 },
      { header: 'Importe', width: 16, money: true },
    ]);
    payments.addRows(report.byPayment.map((p) => [PAYMENT_LABELS[p.method] ?? p.method, p.amount]));

    const products = sheet('Más vendidos', [
      { header: 'Producto', width: 42 },
      { header: 'Cantidad', width: 10 },
      { header: 'Unidad', width: 8 },
      { header: 'Vendido sin IVA', width: 16, money: true },
      { header: 'Descuento', width: 14, money: true },
      ...(includeCosts ? [{ header: 'Utilidad', width: 14, money: true }] : []),
    ]);
    products.addRows(
      report.topProducts.map((p) => [p.name, p.quantity, p.unit, p.amount, p.discount, ...('profit' in p ? [p.profit] : [])]),
    );

    const promotions = sheet('Promociones', [
      { header: 'Promoción', width: 36 },
      { header: 'Ventas', width: 10 },
      { header: 'Piezas', width: 10 },
      { header: 'Dejó de entrar sin IVA', width: 22, money: true },
    ]);
    promotions.addRows(report.promotions.rows.map((p) => [p.name, p.sales, p.units, p.discount]));

    if ('profitability' in report) {
      const below = sheet('Bajo costo', [
        { header: 'Producto', width: 42 },
        { header: 'Cantidad', width: 10 },
        { header: 'Vendido sin IVA', width: 16, money: true },
        { header: 'Costo', width: 14, money: true },
        { header: 'Pérdida', width: 14, money: true },
      ]);
      below.addRows(report.profitability.belowCost.map((p) => [p.name, p.quantity, p.amount, p.cost, p.loss]));
    }

    const closedAt = new Intl.DateTimeFormat('es-MX', { timeZone, dateStyle: 'short', timeStyle: 'short' });
    const cash = sheet('Cortes con diferencia', [
      { header: 'Terminal', width: 32 },
      { header: 'Turno', width: 8 },
      { header: 'Cierre', width: 20 },
      { header: 'Contado', width: 14, money: true },
      { header: 'Diferencia', width: 14, money: true },
    ]);
    cash.addRows(report.cash.differences.map((d) => [d.terminalName, d.number, closedAt.format(d.closedAt), d.countedCash, d.difference]));

    return Buffer.from(await book.xlsx.writeBuffer());
  }
}

export type { SalesReport };
