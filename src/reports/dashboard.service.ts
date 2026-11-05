import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CashSession, CashSessionDocument } from '../cash/schemas/cash-session.schema.js';
import { MailerService } from '../mail/mailer.service.js';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { TerminalsService } from '../terminals/terminals.service.js';
import { localDay, localDayStart } from './email/daily-report.email.js';
import { ReportEmailSettings, ReportEmailSettingsDocument } from './email/report-email-settings.schema.js';
import { ReportsService } from './reports.service.js';
import { terminalAlerts } from './terminal-alerts.js';

const DAY_MS = 86_400_000;
const round = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Sale.name) private readonly sales: Model<SaleDocument>,
    @InjectModel(CashSession.name) private readonly sessions: Model<CashSessionDocument>,
    @InjectModel(ReportEmailSettings.name) private readonly emailSettings: Model<ReportEmailSettingsDocument>,
    private readonly reports: ReportsService,
    private readonly terminals: TerminalsService,
    private readonly tenants: TenantsService,
    private readonly mailer: MailerService,
  ) {}

  async business(tenantId: string, tz: string | undefined, includeCosts: boolean, now = new Date()) {
    const timeZone = this.reports.timeZone(tz);
    const dayStart = localDayStart(now, timeZone);
    // A mediodía UTC para caer en el día correcto de cualquier zona, también con cambio de horario
    const monthStart = localDayStart(new Date(`${localDay(now, timeZone).slice(0, 7)}-01T12:00:00Z`), timeZone);
    const weekStart = localDayStart(new Date(dayStart.getTime() - 6 * DAY_MS + DAY_MS / 2), timeZone);
    const range = (from: Date, to: Date) => ({ from: from.toISOString(), to: to.toISOString(), tz: timeZone });

    const [today, yesterday, week, month, lowStock, terminals, open, options] = await Promise.all([
      this.reports.salesReport(tenantId, range(dayStart, now), includeCosts),
      this.reports.salesReport(tenantId, range(new Date(dayStart.getTime() - DAY_MS), new Date(now.getTime() - DAY_MS)), false),
      this.reports.salesReport(tenantId, range(weekStart, now), false),
      this.reports.salesReport(tenantId, range(monthStart, now), includeCosts),
      this.reports.lowStock(tenantId),
      this.terminals.findAll(tenantId),
      this.sessions
        .find({ tenantId, status: 'open', deletedAt: null })
        .select('terminalId number openedAt')
        .sort({ openedAt: 1 })
        .lean(),
      this.terminals.options(tenantId),
    ]);
    const names = new Map(options.map((t) => [t._id, t.name]));
    const todayCosts = 'profitability' in today ? today.profitability : null;
    const monthCosts = 'profitability' in month ? month.profitability : null;

    return {
      generatedAt: now,
      today: {
        total: today.totals.total,
        count: today.totals.count,
        average: today.totals.average,
        discount: today.totals.discount,
        cancelledCount: today.totals.cancelledCount,
        cancelledTotal: today.totals.cancelledTotal,
        ...(todayCosts ? { profit: todayCosts.profit, margin: todayCosts.margin } : {}),
      },
      previousTotal: yesterday.totals.total,
      week: week.timeline,
      month: {
        total: month.totals.total,
        count: month.totals.count,
        promotionDiscount: month.promotions.discount,
        ...(monthCosts
          ? {
              profit: monthCosts.profit,
              margin: monthCosts.margin,
              profitWithoutPromotions: monthCosts.profitWithoutPromotions,
              belowCostLoss: monthCosts.belowCostLoss,
              linesWithoutCost: monthCosts.linesWithoutCost,
            }
          : {}),
      },
      topProducts: today.topProducts.slice(0, 5).map((p) => ({ name: p.name, unit: p.unit, quantity: p.quantity, amount: p.amount })),
      byTerminal: today.byTerminal,
      openCash: open.map((s) => ({ terminalName: names.get(s.terminalId) ?? '—', number: s.number, openedAt: s.openedAt })),
      lowStock: lowStock.items,
      lowStockTotal: lowStock.total,
      terminalAlerts: terminalAlerts(terminals as never, now),
    };
  }

  async platform(tz: string | undefined, now = new Date()) {
    const timeZone = this.reports.timeZone(tz);
    const dayStart = localDayStart(now, timeZone);
    const yesterdayStart = new Date(dayStart.getTime() - DAY_MS);
    const yesterdayEnd = new Date(now.getTime() - DAY_MS);

    const tenants = (await this.tenants.findAll()).filter((tenant) => !tenant.deletedAt);
    const ids = tenants.map((tenant) => tenant._id);
    const [sales, settings, terminals] = await Promise.all([
      this.sales.aggregate<{ _id: string; total: number; count: number; previousTotal: number }>([
        { $match: { tenantId: { $in: ids }, soldAt: { $gte: yesterdayStart, $lte: now }, status: 'completed', deletedAt: null } },
        {
          $group: {
            _id: '$tenantId',
            total: { $sum: { $cond: [{ $gte: ['$soldAt', dayStart] }, '$total', 0] } },
            count: { $sum: { $cond: [{ $gte: ['$soldAt', dayStart] }, 1, 0] } },
            previousTotal: { $sum: { $cond: [{ $lte: ['$soldAt', yesterdayEnd] }, '$total', 0] } },
          },
        },
      ]),
      this.emailSettings.find({ _id: { $in: ids } }).select('enabled lastError').lean(),
      Promise.all(ids.map((id) => this.terminals.findAll(id))),
    ]);
    const salesBy = new Map(sales.map((row) => [row._id, row]));
    const settingsBy = new Map(settings.map((row) => [row._id, row]));

    const rows = tenants
      .map((tenant, index) => {
        const sale = salesBy.get(tenant._id);
        const email = settingsBy.get(tenant._id);
        return {
          tenantId: tenant._id,
          name: tenant.name,
          total: round(sale?.total ?? 0),
          count: sale?.count ?? 0,
          previousTotal: round(sale?.previousTotal ?? 0),
          terminals: terminals[index].filter((terminal) => terminal.active && terminal.activatedAt).length,
          alerts: terminalAlerts(terminals[index] as never, now),
          reportEnabled: !!email?.enabled,
          reportError: email?.enabled ? (email.lastError ?? null) : null,
        };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    return {
      generatedAt: now,
      smtpConfigured: this.mailer.isConfigured,
      totals: {
        tenants: rows.length,
        terminals: rows.reduce((sum, row) => sum + row.terminals, 0),
        total: round(rows.reduce((sum, row) => sum + row.total, 0)),
        count: rows.reduce((sum, row) => sum + row.count, 0),
        previousTotal: round(rows.reduce((sum, row) => sum + row.previousTotal, 0)),
      },
      rows,
    };
  }
}
