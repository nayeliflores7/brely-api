import { BadRequestException } from '@nestjs/common';
import { RejectedOpError } from '../sync/sync.types.js';
import { PromotionPushHandler } from './promotion-push.handler.js';
import { normalizePromotion } from './promotions.service.js';

const base = { name: ' 3X2 ', type: 'buy_x_pay_y' as const, productId: 'p', buyQty: 3, payQty: 2 };

describe('normalizePromotion', () => {
  it('limpia lo que no corresponde al tipo', () => {
    const result = normalizePromotion({ ...base, percent: 0.5, amount: 3 });

    expect(result).toMatchObject({ name: '3X2', buyQty: 3, payQty: 2, percent: null, amount: null, active: true, categoryId: null });
  });

  it('exige exactamente un destino', () => {
    expect(() => normalizePromotion({ ...base, productId: null })).toThrow(BadRequestException);
    expect(() => normalizePromotion({ ...base, categoryId: 'c' })).toThrow(BadRequestException);
  });

  it.each([
    ['paga igual que lleva', { type: 'buy_x_pay_y', buyQty: 2, payQty: 2 }],
    ['cantidad fraccionaria', { type: 'buy_x_pay_y', buyQty: 2.5, payQty: 1 }],
    ['paquete de una pieza', { type: 'bundle_price', bundleQty: 1, bundlePrice: 10 }],
    ['paquete sin precio', { type: 'bundle_price', bundleQty: 2 }],
    ['más de 100 %', { type: 'percent', percent: 1.5 }],
    ['0 %', { type: 'percent', percent: 0 }],
    ['monto negativo', { type: 'amount', amount: -1 }],
  ])('rechaza: %s', (_, values) => {
    expect(() => normalizePromotion({ name: 'X', productId: 'p', ...values } as never)).toThrow(BadRequestException);
  });

  it('rechaza un fin anterior al inicio', () => {
    expect(() =>
      normalizePromotion({ ...base, startsAt: '2026-11-10T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' }),
    ).toThrow(BadRequestException);
  });

  it('los 7 días equivalen a sin límite, y ordena los demás', () => {
    expect(normalizePromotion({ ...base, weekdays: [0, 1, 2, 3, 4, 5, 6] }).weekdays).toBeNull();
    expect(normalizePromotion({ ...base, weekdays: [5, 1, 1] }).weekdays).toEqual([1, 5]);
  });
});

describe('PromotionPushHandler', () => {
  const ctx = { tenantId: 't', terminalId: 'c' };
  const payload = { id: 'x', ...base, categoryId: null, weekdays: '1,3', startsAt: null, endsAt: null, active: true };

  function setUp(existing: object | null) {
    const calls: unknown[][] = [];
    const service = {
      findAnyById: async () => existing,
      create: async (...args: unknown[]) => calls.push(['create', ...args]),
      update: async (...args: unknown[]) => calls.push(['update', ...args]),
      remove: async (...args: unknown[]) => calls.push(['remove', ...args]),
    };
    return { handler: new PromotionPushHandler(service as never, {} as never), calls };
  }
  const op = (action: string, value: object) => ({ action, entity: 'promotion', payload: value }) as never;

  it('crea con el id del POS y convierte los días que llegan como texto', async () => {
    const { handler, calls } = setUp(null);

    await handler.handle(ctx as never, op('create', payload), {} as never);

    expect(calls[0][0]).toBe('create');
    expect(calls[0][1]).toBe('t');
    expect(calls[0][2]).toMatchObject({ name: ' 3X2 ', weekdays: [1, 3] });
    expect(calls[0][3]).toMatchObject({ id: 'x' });
  });

  it('un create repetido actualiza: el reenvío es idempotente', async () => {
    const { handler, calls } = setUp({ tenantId: 't', deletedAt: null });

    await handler.handle(ctx as never, op('create', payload), {} as never);

    expect(calls[0][0]).toBe('update');
  });

  it('rechaza la de otro negocio', async () => {
    const { handler } = setUp({ tenantId: 'otro', deletedAt: null });

    await expect(handler.handle(ctx as never, op('update', payload), {} as never)).rejects.toBeInstanceOf(RejectedOpError);
  });

  it('borrar lo ya borrado no falla', async () => {
    const { handler, calls } = setUp({ tenantId: 't', deletedAt: new Date() });

    await handler.handle(ctx as never, op('delete', { id: 'x' }), {} as never);

    expect(calls).toEqual([]);
  });

  it('activa o pausa', async () => {
    const { handler, calls } = setUp({ tenantId: 't', deletedAt: null });

    await handler.handle(ctx as never, op('set-active', { id: 'x', active: false }), {} as never);

    expect(calls[0].slice(0, 4)).toEqual(['update', 't', 'x', { active: false }]);
  });
});
