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
