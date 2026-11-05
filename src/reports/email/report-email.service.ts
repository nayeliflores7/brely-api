import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditService } from '../../audit/audit.service.js';
import { TenantsService } from '../../tenants/tenants.service.js';
import { TerminalsService } from '../../terminals/terminals.service.js';
import { ReportsService } from '../reports.service.js';
import { terminalAlerts } from '../terminal-alerts.js';
import { localDay, localDayStart, localTime, renderDailyReport } from './daily-report.email.js';
import { mailErrorMessage, MailerService } from '../../mail/mailer.service.js';
import { SaveReportEmailDto } from './report-email.dto.js';
import { ReportEmailSettings, ReportEmailSettingsDocument } from './report-email-settings.schema.js';

const DEFAULTS = { enabled: false, time: '21:00', timeZone: 'America/Mexico_City', recipients: [] as string[], includeCosts: true };
const RETRY_AFTER_MS = 15 * 60_000;
const TEST_COOLDOWN_MS = 15_000;
const DAY_MS = 86_400_000;

/** ¿Toca enviar? Si el servidor estuvo apagado a la hora, se envía en cuanto vuelva, el mismo día. */
export function isDue(
  settings: { time: string; timeZone: string; lastSentOn: string | null; lastAttemptAt: Date | null },
  now: Date,
): boolean {
  if (settings.lastSentOn === localDay(now, settings.timeZone)) return false;
  if (localTime(now, settings.timeZone) < settings.time) return false;
  return !settings.lastAttemptAt || now.getTime() - settings.lastAttemptAt.getTime() >= RETRY_AFTER_MS;
}

@Injectable()
export class ReportEmailService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ReportEmailService.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    @InjectModel(ReportEmailSettings.name) private readonly model: Model<ReportEmailSettingsDocument>,
    private readonly reports: ReportsService,
    private readonly mailer: MailerService,
    private readonly tenants: TenantsService,
    private readonly terminals: TerminalsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    const every = Number(this.config.get('REPORT_EMAIL_TICK_MS') ?? 60_000);
    this.timer = setInterval(() => void this.tick(), every);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async get(tenantId: string) {
    const settings = await this.model.findById(tenantId).lean();
    return {
      ...DEFAULTS,
      lastSentAt: null,
      lastError: null,
      ...(settings ?? {}),
      smtpConfigured: this.mailer.isConfigured,
    };
  }

  async save(tenantId: string, dto: SaveReportEmailDto) {
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: dto.timeZone });
    } catch {
      throw new BadRequestException('Invalid time zone');
    }
    const recipients = [...new Set(dto.recipients.map((r) => r.trim().toLowerCase()))];
    if (dto.enabled && recipients.length === 0) throw new BadRequestException('At least one recipient is required');

    // Si la hora de hoy ya pasó, el primer envío es mañana: guardar no debe disparar un correo
    const now = new Date();
    const passed = localTime(now, dto.timeZone) >= dto.time;
    await this.model.updateOne(
      { _id: tenantId },
      {
        $set: {
          ...dto,
          recipients,
          lastSentOn: passed ? localDay(now, dto.timeZone) : null,
          lastAttemptAt: null,
          lastError: null,
        },
      },
      { upsert: true },
    );
    return this.get(tenantId);
  }

  async sendTest(tenantId: string) {
    const settings = await this.model.findById(tenantId).lean();
    if (!settings?.recipients.length) throw new BadRequestException('At least one recipient is required');
    if (!this.mailer.isConfigured) throw new BadRequestException('Email account is not configured');
    if (settings.lastTestAt && Date.now() - settings.lastTestAt.getTime() < TEST_COOLDOWN_MS) {
      throw new HttpException('Too many test emails', HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.model.updateOne({ _id: tenantId }, { $set: { lastTestAt: new Date() } });
    try {
      await this.deliver(tenantId, settings, new Date(), true);
    } catch (error) {
      throw new BadGatewayException(mailErrorMessage(error));
    }
    return { sent: true, recipients: settings.recipients };
  }

  async tick(now = new Date()): Promise<void> {
    if (this.ticking || !this.mailer.isConfigured) return;
    this.ticking = true;
    try {
      const enabled = await this.model.find({ enabled: true }).lean();
      for (const settings of enabled) {
        if (!isDue(settings, now)) continue;
        await this.sendScheduled(settings, now);
      }
    } catch (error) {
      this.logger.error('Falló la revisión de reportes programados', (error as Error).stack);
    } finally {
      this.ticking = false;
    }
  }

  private async sendScheduled(settings: ReportEmailSettings, now: Date) {
    const tenantId = settings._id;
    if (!(await this.tenants.isActive(tenantId))) return;
    // Se aparta el intento primero: con dos instancias de la API, solo una lo gana
    const claimed = await this.model.findOneAndUpdate(
      { _id: tenantId, lastAttemptAt: settings.lastAttemptAt },
      { $set: { lastAttemptAt: now } },
    );
    if (!claimed) return;

    try {
      await this.deliver(tenantId, settings, now, false);
      await this.model.updateOne(
        { _id: tenantId },
        { $set: { lastSentOn: localDay(now, settings.timeZone), lastSentAt: now, lastError: null } },
      );
      await this.recordAudit(tenantId, 'reports.email.sent', settings.recipients);
    } catch (error) {
      const message = mailErrorMessage(error);
      this.logger.error(`No se envió el reporte diario: ${message}`);
      await this.model.updateOne({ _id: tenantId }, { $set: { lastError: message } });
      await this.recordAudit(tenantId, 'reports.email.failed', settings.recipients);
    }
  }

  private recordAudit(tenantId: string, action: string, recipients: string[]) {
    return this.audit.record({
      tenantId,
      source: 'admin',
      actorId: null,
      actorName: 'Sistema',
      action,
      entity: 'reports',
      entityName: 'Reporte diario',
      detail: { recipients },
    });
  }

  private async deliver(
    tenantId: string,
    settings: Pick<ReportEmailSettings, 'timeZone' | 'includeCosts' | 'recipients'>,
    now: Date,
    isTest: boolean,
  ) {
    const { timeZone, includeCosts } = settings;
    const from = localDayStart(now, timeZone);
    const [tenant, report, previous, lowStock, terminals] = await Promise.all([
      this.tenants.findOne(tenantId),
      this.reports.salesReport(tenantId, { from: from.toISOString(), to: now.toISOString(), tz: timeZone }, includeCosts),
      this.reports.salesReport(
        tenantId,
        { from: new Date(from.getTime() - DAY_MS).toISOString(), to: new Date(now.getTime() - DAY_MS).toISOString(), tz: timeZone },
        false,
      ),
      this.reports.lowStock(tenantId),
      this.terminals.findAll(tenantId),
    ]);
    const message = renderDailyReport({
      tenantName: tenant.name,
      timeZone,
      now,
      report,
      previousTotal: previous.totals.total,
      lowStock: lowStock.items,
      terminalAlerts: terminalAlerts(terminals as never, now),
      isTest,
    });
    await this.mailer.send({ to: settings.recipients, ...message });
  }
}
