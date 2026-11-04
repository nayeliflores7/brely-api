import { firstValueFrom, of } from 'rxjs';
import { RejectedOpError } from '../sync/sync.types.js';
import { AuditPushHandler } from './audit-push.handler.js';
import { AuditInterceptor, describeRoute } from './audit.interceptor.js';
import { AuditService, sanitize } from './audit.service.js';

describe('describeRoute', () => {
  it.each([
    ['POST', '/api/v1/products', 'products', 'products.create'],
    ['PATCH', '/api/v1/products/:id', 'products', 'products.update'],
    ['DELETE', '/api/v1/products/:id', 'products', 'products.delete'],
    ['POST', '/api/v1/sales/:id/cancel', 'sales', 'sales.cancel'],
    ['POST', '/api/v1/cash/sessions/:id/close', 'cash', 'cash.sessions.close'],
    ['POST', '/api/v1/cash/movements', 'cash', 'cash.movements.create'],
    ['POST', '/api/v1/terminals/:id/reset-activation', 'terminals', 'terminals.reset-activation'],
    ['POST', '/api/v1/tenants/:id/restore', 'tenants', 'tenants.restore'],
    ['PATCH', '/api/v1/tenants/me', 'tenants', 'tenants.me.update'],
    ['PATCH', '/api/v1/units/:code', 'units', 'units.update'],
  ])('%s %s', (method, path, entity, action) => {
    expect(describeRoute(method, path)).toEqual({ entity, action });
  });
});

describe('sanitize', () => {
  it('oculta secretos a cualquier profundidad y omite el logo', () => {
    const clean = sanitize({
      fullName: 'Ana',
      password: 'x',
      pin: '123456',
      logo: 'data:image',
      owner: { email: 'a@b.com', password: 'y', pinHash: 'z' },
      list: [{ accessToken: 't', name: 'n' }],
    });

    expect(clean).toEqual({
      fullName: 'Ana',
      password: '[oculto]',
      pin: '[oculto]',
      owner: { email: 'a@b.com', password: '[oculto]', pinHash: '[oculto]' },
      list: [{ accessToken: '[oculto]', name: 'n' }],
    });
  });

  it('nunca guarda un secreto aunque venga en el detalle', async () => {
    const created: { detail: unknown }[] = [];
    const service = new AuditService(
      { create: async (doc: { detail: unknown }) => created.push(doc) } as never,
      {} as never,
    );

    await service.record({
      tenantId: 't',
      source: 'admin',
      actorId: 'u',
      actorName: 'A',
      action: 'users.create',
      entity: 'users',
      detail: { password: 'secreta' },
    });

    expect(JSON.stringify(created)).not.toContain('secreta');
  });

  it('registrar nunca lanza: la operación ya ocurrió', async () => {
    const service = new AuditService(
      { create: async () => { throw new Error('fallo'); } } as never,
      {} as never,
    );

    await expect(
      service.record({ tenantId: null, source: 'admin', actorId: null, actorName: '', action: 'x', entity: 'x' }),
    ).resolves.toBeUndefined();
  });
});

describe('AuditInterceptor', () => {
  const superAdmin = { id: 's', tenantId: null, fullName: 'Super', isSuperAdmin: true, permissions: [], roleId: null };
  const user = { ...superAdmin, id: 'u', tenantId: 't', fullName: 'Ana', isSuperAdmin: false };

  async function run(request: object, response: unknown) {
    const entries: Record<string, unknown>[] = [];
    const audit = {
      record: async (entry: Record<string, unknown>) => entries.push(entry),
      lookupName: async () => 'NOMBRE BORRADO',
    };
    const interceptor = new AuditInterceptor(audit as never);
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request }),
    };
    await firstValueFrom(interceptor.intercept(context as never, { handle: () => of(response) }));
    await new Promise((resolve) => setTimeout(resolve));
    return entries;
  }

  it('registra una escritura con su negocio y su autor', async () => {
    const [entry] = await run(
      { method: 'POST', user, route: { path: '/api/v1/products' }, params: {}, body: { name: 'P' } },
      { _id: 'p1', name: 'P' },
    );

    expect(entry).toMatchObject({
      tenantId: 't',
      actorId: 'u',
      actorName: 'Ana',
      action: 'products.create',
      entityId: 'p1',
      entityName: 'P',
      source: 'admin',
    });
  });

  it('no registra lecturas', async () => {
    expect(await run({ method: 'GET', user, route: { path: '/x' } }, {})).toEqual([]);
  });

  it('no registra lo que no viene de una sesión del panel', async () => {
    expect(await run({ method: 'POST', route: { path: '/api/v1/sync/push' } }, {})).toEqual([]);
  });

  it('al borrar busca el nombre, porque la respuesta viene vacía', async () => {
    const [entry] = await run(
      { method: 'DELETE', user, route: { path: '/api/v1/products/:id' }, params: { id: 'p1' }, body: {} },
      undefined,
    );

    expect(entry).toMatchObject({ entityId: 'p1', entityName: 'NOMBRE BORRADO', detail: null });
  });

  it('en /tenants el super admin audita sobre ese negocio', async () => {
    const [entry] = await run(
      { method: 'PATCH', user: superAdmin, route: { path: '/api/v1/tenants/:id' }, params: { id: 'n1' }, body: { phone: '1' } },
      { _id: 'n1', name: 'Tienda' },
    );

    expect(entry).toMatchObject({ tenantId: 'n1', actorIsSuperAdmin: true, entityName: 'Tienda' });
  });

  it('una venta se identifica por su folio', async () => {
    const [entry] = await run(
      { method: 'POST', user, route: { path: '/api/v1/sales/:id/cancel' }, params: { id: 's1' }, body: { reason: 'X' } },
      { _id: 's1', folio: 7 },
    );

    expect(entry).toMatchObject({ action: 'sales.cancel', entityName: '#000007' });
  });
});

describe('AuditPushHandler', () => {
  const ctx = { tenantId: 't', terminalId: 'c1' };
  const base = { id: 'a1', action: 'sale.cancel', entity: 'sale', entityId: 's1', createdAt: '2026-11-04T12:00:00.000Z' };

  function setUp() {
    const saved: Record<string, unknown>[] = [];
    const handler = new AuditPushHandler(
      {
        recordInSession: async (entry: Record<string, unknown>) => saved.push(entry),
        lookupName: async () => '#000007',
      } as never,
      { displayNames: async () => new Map([['u', 'Ana']]) } as never,
      {} as never,
    );
    return { handler, saved };
  }
  const push = (payload: object) => ({ action: 'create', entity: 'audit', payload }) as never;

  it('guarda con la terminal y el negocio del token, no con lo que diga el POS', async () => {
    const { handler, saved } = setUp();

    await handler.handle(ctx as never, push({ ...base, tenantId: 'otro', userId: 'u', detail: '{"reason":"X"}' }), {} as never);

    expect(saved[0]).toMatchObject({
      id: 'a1',
      tenantId: 't',
      terminalId: 'c1',
      source: 'pos',
      entity: 'sales',
      entityName: '#000007',
      actorName: 'Ana',
      detail: { reason: 'X' },
    });
  });

  it('un PIN fallido se atribuye al usuario al que se intentó entrar', async () => {
    const { handler, saved } = setUp();

    await handler.handle(
      ctx as never,
      push({ ...base, action: 'auth.login_failed', entity: 'user', entityId: 'u', userId: null, detail: null }),
      {} as never,
    );

    expect(saved[0]).toMatchObject({ actorId: 'u', actorName: 'Ana', entity: 'auth', entityName: 'Ana' });
  });

  it('rechaza cualquier acción que no sea crear', async () => {
    const { handler } = setUp();

    await expect(
      handler.handle(ctx as never, { action: 'delete', entity: 'audit', payload: base } as never, {} as never),
    ).rejects.toBeInstanceOf(RejectedOpError);
  });
});
