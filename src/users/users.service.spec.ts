import { UsersService } from './users.service.js';

const stored = {
  _id: 'u1',
  fullName: 'Ana',
  email: 'ana@example.com',
  pinHash: 'hash-pin',
  pinSalt: 'salt-pin',
  passwordHash: 'hash-password',
};

function chain(result: unknown) {
  const query: Record<string, unknown> = {
    select: () => query,
    sort: () => query,
    lean: () => Promise.resolve(result),
  };
  return query;
}

function service(model: unknown, roleModel: unknown = {}) {
  return new UsersService(model as never, roleModel as never, {} as never);
}

describe('UsersService', () => {
  it.each([
    ['findAll', () => service({ find: () => chain([stored]) }).findAll('t').then((r) => r[0])],
    ['findOne', () => service({ findOne: () => chain(stored) }).findOne('t', 'u1')],
  ])('%s informa si hay PIN sin exponer credenciales', async (_name, run) => {
    const user = (await run()) as unknown as Record<string, unknown>;

    expect(user.hasPin).toBe(true);
    expect(user.fullName).toBe('Ana');
    expect(user).not.toHaveProperty('pinHash');
    expect(user).not.toHaveProperty('pinSalt');
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('indica cuando el usuario no tiene PIN', async () => {
    const user = await service({
      findOne: () => chain({ _id: 'u2', fullName: 'Web' }),
    }).findOne('t', 'u2');

    expect(user.hasPin).toBe(false);
  });

  it('las opciones de rol solo dicen si dan acceso al panel', async () => {
    const options = await service(
      {},
      {
        find: () =>
          chain([
            { _id: 'r1', name: 'Cajero', permissions: ['cash.movements'] },
            { _id: 'r2', name: 'Propietario', permissions: ['admin.access'] },
          ]),
      },
    ).roleOptions('t');

    expect(options).toEqual([
      { _id: 'r1', name: 'Cajero', adminAccess: false },
      { _id: 'r2', name: 'Propietario', adminAccess: true },
    ]);
  });
});
