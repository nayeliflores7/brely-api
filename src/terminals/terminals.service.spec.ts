import { BadRequestException } from '@nestjs/common';
import { TerminalsService } from './terminals.service.js';

function setUp(found: Record<string, unknown> | null) {
  const filters: Record<string, unknown>[] = [];
  const model = {
    findOneAndUpdate: (filter: Record<string, unknown>) => {
      filters.push(filter);
      return { lean: () => Promise.resolve(found) };
    },
  };
  const jwt = { signAsync: () => Promise.resolve('token') };
  return { service: new TerminalsService(model as never, jwt as never), filters };
}

const terminal = { _id: 't1', tenantId: 'x', name: 'Caja 1', tokenVersion: 2 };

describe('TerminalsService.activate', () => {
  it('sin terminalId canjea cualquier código válido', async () => {
    const { service, filters } = setUp(terminal);

    const result = await service.activate({ code: 'ABCD-2345' });

    expect(result).toMatchObject({ token: 'token', terminalId: 't1' });
    expect(filters[0]).not.toHaveProperty('_id');
  });

  it('con terminalId solo canjea el código de esa terminal', async () => {
    const { service, filters } = setUp(terminal);

    await service.activate({ code: 'ABCD-2345', terminalId: 't1' });

    expect(filters[0]._id).toBe('t1');
  });

  it('rechaza el código si no coincide', async () => {
    const { service } = setUp(null);

    await expect(service.activate({ code: 'ABCD-2345', terminalId: 't9' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('TerminalsService.restore', () => {
  function restoreSetUp(found: Record<string, unknown> | null) {
    const calls: { filter: Record<string, any>; update: Record<string, any> }[] = [];
    const model = {
      findOneAndUpdate: (filter: Record<string, any>, update: Record<string, any>) => {
        calls.push({ filter, update });
        return { lean: () => Promise.resolve(found) };
      },
    };
    return { service: new TerminalsService(model as never, { signAsync: async () => 't' } as never), calls };
  }

  it('solo restaura una eliminada del mismo negocio', async () => {
    const { service, calls } = restoreSetUp({ _id: 't1', name: 'Caja 1' });

    await service.restore('x', 't1');

    expect(calls[0].filter).toEqual({ _id: 't1', tenantId: 'x', deletedAt: { $ne: null } });
  });

  it('devuelve un código nuevo y obliga a activar de nuevo el equipo', async () => {
    const { service, calls } = restoreSetUp({ _id: 't1', name: 'Caja 1', activationCodeHash: 'secreto' });

    const result = await service.restore('x', 't1');

    expect(result.activationCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(result).not.toHaveProperty('activationCodeHash');
    expect(calls[0].update.$set).toMatchObject({ deletedAt: null, active: true, activatedAt: null });
    expect(calls[0].update.$inc).toEqual({ tokenVersion: 1 }); // el token del equipo anterior no revive
    expect(calls[0].update.$set.activationCodeHash).toHaveLength(64);
  });

  it('una terminal que no está eliminada no se restaura', async () => {
    const { service } = restoreSetUp(null);

    await expect(service.restore('x', 't1')).rejects.toThrow('not found');
  });
});
