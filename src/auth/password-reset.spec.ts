import { BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { sessionRevoked } from './jwt-auth.guard.js';
import { renderPasswordResetEmail } from './password-reset.email.js';
import { PasswordResetService } from './password-reset.service.js';

const user = { _id: 'u1', tenantId: 't1', roleId: 'r1', fullName: 'Ana', email: 'ana@example.com' };
const admin = { _id: 'a1', fullName: 'Admin', email: 'admin@example.com' };

function setUp(opts: { configured?: boolean; tenantActive?: boolean; permissions?: string[]; recent?: boolean; sendFails?: boolean; env?: Record<string, string> } = {}) {
  const docs: Record<string, unknown>[] = [];
  const sent: { to: string[]; subject: string; text: string }[] = [];
  const audits: string[] = [];
  const passwords: Record<string, string> = {};
  const store = (accounts: Record<string, { _id: string; email: string }>) => ({
    findByEmailForLogin: async (email: string) => Object.values(accounts).find((a) => a.email === email) ?? null,
    findForPassword: async (id: string) => accounts[id] ?? null,
    resetPassword: async (id: string, hash: string) => {
      passwords[id] = hash;
    },
  });
  const accounts = { u1: { ...user } };
  const service = new PasswordResetService(
    {
      exists: async () => (opts.recent ? { _id: 'x' } : null),
      deleteMany: async ({ accountId }: { accountId: string }) => {
        for (let i = docs.length - 1; i >= 0; i--) if (docs[i].accountId === accountId) docs.splice(i, 1);
      },
      create: async (doc: Record<string, unknown>) => docs.push(doc),
      findOneAndDelete: (filter: { _id: string; expiresAt: { $gt: Date } }) => ({
        lean: async () => {
          const index = docs.findIndex(
            (d) => d._id === filter._id && (d.expiresAt as Date) > filter.expiresAt.$gt,
          );
          return index < 0 ? null : docs.splice(index, 1)[0];
        },
      }),
    } as never,
    store(accounts) as never,
    store({ a1: admin }) as never,
    { findOneOrNull: async () => ({ permissions: opts.permissions ?? ['admin.access'] }) } as never,
    { isActive: async () => opts.tenantActive ?? true } as never,
    {
      isConfigured: opts.configured ?? true,
      send: async (message: { to: string[]; subject: string; text: string }) => {
        if (opts.sendFails) throw Object.assign(new Error('secreto'), { code: 'EAUTH' });
        sent.push(message);
      },
    } as never,
    { record: async ({ action }: { action: string }) => void audits.push(action) } as never,
    { get: (key: string) => opts.env?.[key] } as never,
  );
  const tokenFrom = () => sent[0].text.match(/token=([0-9a-f]+)/)![1];
  return { service, docs, sent, audits, passwords, accounts, tokenFrom };
}

describe('PasswordResetService.request', () => {
  it('envía un enlace y guarda solo el hash del token', async () => {
    const { service, sent, docs, tokenFrom, audits } = setUp();

    await service.request('ANA@example.com');

    expect(sent[0].to).toEqual(['ana@example.com']);
    const token = tokenFrom();
    expect(token).toHaveLength(64);
    expect(docs[0]._id).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(docs)).not.toContain(token);
    expect(audits).toEqual(['auth.password_reset_requested']);
  });

  it('el enlace vence en 60 minutos', async () => {
    const { service, docs } = setUp();

    await service.request('ana@example.com');

    const minutes = ((docs[0].expiresAt as Date).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(59);
    expect(minutes).toBeLessThanOrEqual(60);
  });

  it('también sirve para el super admin', async () => {
    const { service, sent, docs } = setUp();

    await service.request('admin@example.com');

    expect(sent).toHaveLength(1);
    expect(docs[0]).toMatchObject({ isSuperAdmin: true, tenantId: null });
  });

  it.each([
    ['un correo que no existe', {}, 'nadie@example.com'],
    ['un negocio inactivo', { tenantActive: false }, 'ana@example.com'],
    ['un usuario sin acceso al panel', { permissions: ['sales.create'] }, 'ana@example.com'],
    ['una solicitud reciente', { recent: true }, 'ana@example.com'],
    ['sin cuenta de correo configurada', { configured: false }, 'ana@example.com'],
  ])('no envía nada con %s', async (_, opts, email) => {
    const { service, sent, docs } = setUp(opts);

    await service.request(email);

    expect(sent).toEqual([]);
    expect(docs).toEqual([]);
  });

  it('un fallo del correo no se propaga a quien lo pidió', async () => {
    await expect(setUp({ sendFails: true }).service.request('ana@example.com')).resolves.toBeUndefined();
  });

  it('una solicitud nueva invalida el enlace anterior', async () => {
    const { service, docs } = setUp();

    await service.request('ana@example.com');
    const first = docs[0]._id;
    await service.request('ana@example.com');

    expect(docs).toHaveLength(1);
    expect(docs[0]._id).not.toBe(first);
  });

  it.each([
    [{}, 'http://localhost:4200/restablecer-contrasena'],
    [{ CORS_ORIGINS: 'https://a.test, https://b.test' }, 'https://a.test/restablecer-contrasena'],
    [{ PANEL_URL: 'https://panel.test/', CORS_ORIGINS: 'https://a.test' }, 'https://panel.test/restablecer-contrasena'],
  ])('arma el enlace con la dirección configurada %#', async (env, expected) => {
    const { service, sent } = setUp({ env });

    await service.request('ana@example.com');

    expect(sent[0].text).toContain(`${expected}?token=`);
  });
});

describe('PasswordResetService.reset', () => {
  it('cambia la contraseña, avisa por correo y registra', async () => {
    const { service, sent, passwords, audits, tokenFrom, docs } = setUp();
    await service.request('ana@example.com');

    await service.reset(tokenFrom(), 'nueva-clave-1');

    expect(await argon2.verify(passwords.u1, 'nueva-clave-1')).toBe(true);
    expect(docs).toEqual([]);
    expect(sent[1].subject).toContain('cambió');
    expect(audits).toContain('auth.password_reset');
  });

  it('un enlace solo funciona una vez', async () => {
    const { service, tokenFrom } = setUp();
    await service.request('ana@example.com');
    const token = tokenFrom();
    await service.reset(token, 'nueva-clave-1');

    await expect(service.reset(token, 'otra-clave-2')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un enlace vencido', async () => {
    const { service, tokenFrom, docs, passwords } = setUp();
    await service.request('ana@example.com');
    docs[0].expiresAt = new Date(Date.now() - 1000);

    await expect(service.reset(tokenFrom(), 'nueva-clave-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(passwords).toEqual({});
  });

  it('rechaza un token inventado', async () => {
    await expect(setUp().service.reset('f'.repeat(64), 'nueva-clave-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el enlace deja de servir si la cuenta cambió de correo', async () => {
    const { service, tokenFrom, accounts, passwords } = setUp();
    await service.request('ana@example.com');
    accounts.u1.email = 'otra@example.com';

    await expect(service.reset(tokenFrom(), 'nueva-clave-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(passwords).toEqual({});
  });
});

describe('sessionRevoked', () => {
  const at = new Date('2026-11-04T12:00:00.500Z');

  it('sin restablecimiento, la sesión sigue', () => {
    expect(sessionRevoked(1, null)).toBe(false);
    expect(sessionRevoked(1, undefined)).toBe(false);
  });

  it('una sesión anterior queda cerrada', () => {
    expect(sessionRevoked(at.getTime() / 1000 - 5, at)).toBe(true);
  });

  it('entrar en cuanto se restablece sigue funcionando', () => {
    expect(sessionRevoked(Math.floor(at.getTime() / 1000), at)).toBe(false);
  });
});

describe('renderPasswordResetEmail', () => {
  it('escapa el nombre', () => {
    const { html } = renderPasswordResetEmail('<b>Ana</b>', 'https://a.test/?token=x', 60);

    expect(html).not.toContain('<b>Ana');
    expect(html).toContain('60 minutos');
  });
});
