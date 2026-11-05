import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import { createHash, randomInt } from 'crypto';
import { Terminal, TerminalDocument } from './schemas/terminal.schema.js';
import { ActivateDto, CreateTerminalDto, UpdateTerminalDto } from './dto/terminal.dto.js';

// Sin 0/O/1/I para que se pueda dictar sin errores. 32^8 ≈ 1.1e12 combinaciones
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL_MS = 24 * 60 * 60 * 1000;

// Tipo explícito: evita que TS intente serializar los tipos gigantes de Mongoose (TS7056)
export type TerminalView = Record<string, any>;
export type TerminalWithCode = TerminalView & { activationCode: string; activationExpiresAt: Date };

@Injectable()
export class TerminalsService {
  constructor(
    @InjectModel(Terminal.name) private readonly model: Model<TerminalDocument>,
    private readonly jwt: JwtService,
  ) {}

  async create(tenantId: string, dto: CreateTerminalDto): Promise<TerminalWithCode> {
    const c = this.issueCode();
    const doc = await this.model.create({
      tenantId,
      name: dto.name,
      activationCodeHash: c.hash,
      activationExpiresAt: c.expiresAt,
    });
    return { ...this.strip(doc.toObject()), activationCode: c.display, activationExpiresAt: c.expiresAt };
  }

  async findAll(tenantId: string) {
    const rows = await this.model.find({ tenantId, deletedAt: null }).sort({ name: 1 }).lean();
    return rows.map((r) => this.strip(r));
  }

  // Lo mínimo para filtrar y mostrar nombres. Incluye las eliminadas: sus ventas siguen existiendo.
  async options(tenantId: string) {
    const rows = await this.model
      .find({ tenantId })
      .select('name active deletedAt')
      .sort({ name: 1 })
      .lean();
    return rows.map((t) => ({ _id: t._id, name: t.name, deleted: !!t.deletedAt }));
  }

  async update(tenantId: string, id: string, dto: UpdateTerminalDto) {
    const t = await this.model
      .findOneAndUpdate({ _id: id, tenantId, deletedAt: null }, dto, { new: true })
      .lean();
    if (!t) throw new NotFoundException(`Terminal ${id} not found`);
    return this.strip(t);
  }

  // Reinstalación: invalida el token actual y genera un código nuevo
  async resetActivation(tenantId: string, id: string): Promise<TerminalWithCode> {
    const c = this.issueCode();
    const t = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId, deletedAt: null },
        {
          $set: {
            activatedAt: null,
            deviceInfo: '',
            activationCodeHash: c.hash,
            activationExpiresAt: c.expiresAt,
          },
          $inc: { tokenVersion: 1 },
        },
        { new: true },
      )
      .lean();
    if (!t) throw new NotFoundException(`Terminal ${id} not found`);
    return { ...this.strip(t), activationCode: c.display, activationExpiresAt: c.expiresAt };
  }

  async remove(tenantId: string, id: string) {
    const t = await this.model.findOneAndUpdate(
      { _id: id, tenantId, deletedAt: null },
      { deletedAt: new Date(), active: false, $inc: { tokenVersion: 1 } },
    );
    if (!t) throw new NotFoundException(`Terminal ${id} not found`);
  }

  async findDeleted(tenantId: string) {
    const rows = await this.model
      .find({ tenantId, deletedAt: { $ne: null } })
      .sort({ deletedAt: -1 })
      .limit(100)
      .lean();
    return rows.map((r) => this.strip(r));
  }

  // Conserva el id: sus ventas y folios vuelven a ser de esta terminal, y el POS puede reactivarse
  // sin perder lo que tenga sin enviar. Siempre con código nuevo: pudo eliminarse por un equipo
  // robado, y restaurarla no debe devolverle el acceso a ese equipo.
  async restore(tenantId: string, id: string): Promise<TerminalWithCode> {
    const c = this.issueCode();
    const t = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId, deletedAt: { $ne: null } },
        {
          $set: {
            deletedAt: null,
            active: true,
            activatedAt: null,
            deviceInfo: '',
            activationCodeHash: c.hash,
            activationExpiresAt: c.expiresAt,
          },
          $inc: { tokenVersion: 1 },
        },
        { new: true },
      )
      .lean();
    if (!t) throw new NotFoundException(`Terminal ${id} not found`);
    return { ...this.strip(t), activationCode: c.display, activationExpiresAt: c.expiresAt };
  }

  // Público: lo llama el POS. La actualización atómica evita canjear el mismo código dos veces
  async activate(dto: ActivateDto) {
    const now = new Date();
    const t = await this.model
      .findOneAndUpdate(
        {
          ...(dto.terminalId ? { _id: dto.terminalId } : {}),
          activationCodeHash: this.hash(dto.code),
          activationExpiresAt: { $gt: now },
          activatedAt: null,
          active: true,
          deletedAt: null,
        },
        {
          $set: { activatedAt: now, lastSeenAt: now, deviceInfo: dto.deviceInfo ?? '' },
          $unset: { activationCodeHash: 1, activationExpiresAt: 1 },
        },
        { new: true },
      )
      .lean();
    if (!t) throw new BadRequestException('Invalid or expired activation code');

    const token = await this.jwt.signAsync(
      { sub: t._id, tenantId: t.tenantId, scope: 'terminal', tv: t.tokenVersion },
      { expiresIn: '365d' },
    );
    return { token, terminalId: t._id, terminalName: t.name, tenantId: t.tenantId };
  }

  // ── Usados por TerminalAuthGuard ──
  findForAuth(id: string) {
    return this.model.findOne({ _id: id, deletedAt: null }).lean();
  }

  touch(t: { _id: string; lastSeenAt: Date | null }) {
    if (t.lastSeenAt && Date.now() - +t.lastSeenAt < 60_000) return;
    this.model
      .updateOne({ _id: t._id }, { $set: { lastSeenAt: new Date() } }, { timestamps: false })
      .catch(() => undefined);
  }

  async reportSync(id: string, report: { ok: boolean; pending: number; rejected: number }) {
    await this.model.updateOne(
      { _id: id },
      {
        $set: {
          lastSyncFailed: !report.ok,
          syncPending: report.pending,
          syncRejected: report.rejected,
          ...(report.ok ? { lastSyncedAt: new Date() } : {}),
        },
      },
      { timestamps: false }, // no es un cambio de la terminal: no debe viajar en el pull
    );
  }

  // ── helpers ──
  private issueCode() {
    let code = '';
    for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)];
    return {
      hash: this.hash(code),
      display: `${code.slice(0, 4)}-${code.slice(4)}`,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    };
  }

  private hash(code: string) {
    return createHash('sha256')
      .update(code.toUpperCase().replace(/[^A-Z0-9]/g, ''))
      .digest('hex');
  }

  private strip(t: Record<string, any>): TerminalView {
    const { activationCodeHash, ...rest } = t;
    return rest;
  }
}